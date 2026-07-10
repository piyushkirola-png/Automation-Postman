// src/validators/response.js

const { logger, logSuccess, logError, logInfo, logWarning } = require('../utils/logger');

// Gateway mapping for consistent reference
const GATEWAY_MAP = {
  1: { id: 1, name: 'Razorpay', keyPatterns: ['rzp_test'] },
  2: { id: 2, name: 'Cashfree', keyPatterns: ['cashfree', 'cf_'] },
  3: { id: 3, name: 'Adyen', keyPatterns: ['adyen'] },
  4: { id: 4, name: 'ChargeBee', keyPatterns: ['chargebee', 'cb_', 'ch_'] },
  5: { id: 5, name: 'Bennupay', keyPatterns: ['bennupay', 'bp_'] }
};

/**
 * Detect gateway ID from response
 * @param {object} response - Pay-in response
 * @returns {number|null} - Gateway ID or null if not detected
 */
function detectGatewayId(response) {
  if (!response) return null;

  // 1. Check gatewayId field (most reliable)
  if (response.gatewayId) {
    const id = parseInt(response.gatewayId);
    if (GATEWAY_MAP[id]) {
      return id;
    }
  }

  // 2. Check intent field
  if (response.intent) {
    try {
      // 🔥 FIX: Check if intent is a URL string first
      const intentString = typeof response.intent === 'string'
        ? response.intent
        : JSON.stringify(response.intent);

      // 🔥 CHARGEBEE DETECTION: URL contains chargebee.com
      if (intentString.includes('chargebee.com') ||
        intentString.includes('chargebee') ||
        intentString.includes('invoice_id=')) {
        return 4; // ChargeBee ID
      }

      // 🔥 BENNUPAY DETECTION: Check for Bennupay patterns
      if (intentString.includes('bennupay') ||
        intentString.includes('bp_') ||
        intentString.includes('mock_')) {
        return 5; // Bennupay ID
      }

      // Try to parse as JSON for other gateways
      let parsedIntent = null;
      try {
        parsedIntent = typeof response.intent === 'string'
          ? JSON.parse(response.intent)
          : response.intent;
      } catch (e) {
        // Not JSON, continue with string checks
      }

      if (parsedIntent) {
        // Check for gateway-specific fields in intent
        if (parsedIntent.key) {
          const key = parsedIntent.key;

          // Razorpay: key starts with rzp_test
          if (key.startsWith('rzp_test')) {
            return 1;
          }

          // Check against all gateway patterns
          for (const [id, gateway] of Object.entries(GATEWAY_MAP)) {
            for (const pattern of gateway.keyPatterns) {
              if (key.includes(pattern)) {
                return parseInt(id);
              }
            }
          }
        }

        // ChargeBee specific fields
        if (parsedIntent.chargebee_id ||
          parsedIntent.cb_token ||
          parsedIntent.chargebee_session) {
          return 4;
        }

        // Bennupay specific fields
        if (parsedIntent.bennupay_token ||
          parsedIntent.bp_session ||
          parsedIntent.bennupay_id) {
          return 5;
        }

        // Cashfree specific fields
        if (parsedIntent.paymentSessionId) {
          return 2;
        }

        // Adyen specific fields
        if (parsedIntent.pspReference ||
          (parsedIntent.sessionId && parsedIntent.sessionId.startsWith('CS'))) {
          return 3;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // 3. Check gatewayName field
  if (response.gatewayName) {
    const name = response.gatewayName.toUpperCase();
    for (const [id, gateway] of Object.entries(GATEWAY_MAP)) {
      if (name.includes(gateway.name.toUpperCase())) {
        return parseInt(id);
      }
    }
  }

  // 4. Check paymentGateway field
  if (response.paymentGateway) {
    const name = response.paymentGateway.toUpperCase();
    for (const [id, gateway] of Object.entries(GATEWAY_MAP)) {
      if (name.includes(gateway.name.toUpperCase())) {
        return parseInt(id);
      }
    }
  }

  return null;
}

/**
 * Get gateway name from ID
 * @param {number} gatewayId - Gateway ID
 * @returns {string} - Gateway name or 'Unknown'
 */
function getGatewayName(gatewayId) {
  return GATEWAY_MAP[gatewayId]?.name || `Unknown (${gatewayId})`;
}

/**
 * Validate pay-in response
 * @param {object} response - Pay-in API response
 * @param {object} request - Request data
 * @param {number} expectedGatewayId - Expected gateway ID
 * @returns {object}
 */
function validatePayInResponse(response, request, expectedGatewayId) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    detectedGatewayId: null,
    detectedGatewayName: null
  };

  // Check required fields
  if (!response.id) {
    result.valid = false;
    result.errors.push('Missing transaction ID');
  }

  if (!response.status) {
    result.valid = false;
    result.errors.push('Missing status');
  }

  if (response.merchantReference !== request.merchantReference) {
    result.valid = false;
    result.errors.push(`Merchant reference mismatch: Expected ${request.merchantReference}, Got ${response.merchantReference}`);
  }

  if (parseFloat(response.amount) !== request.amount) {
    result.warnings.push(`Amount mismatch: Expected ${request.amount}, Got ${response.amount}`);
  }

  // Detect gateway
  const detectedId = detectGatewayId(response);
  result.detectedGatewayId = detectedId;
  result.detectedGatewayName = detectedId ? getGatewayName(detectedId) : 'Unknown';

  // Check if gateway routing is correct
  if (detectedId && expectedGatewayId) {
    if (detectedId !== expectedGatewayId) {
      result.valid = false;
      result.errors.push(
        `Gateway mismatch: Expected ${getGatewayName(expectedGatewayId)} (ID: ${expectedGatewayId}), ` +
        `Got ${getGatewayName(detectedId)} (ID: ${detectedId})`
      );
    } else {
      result.warnings.push(`✅ Gateway correct: ${getGatewayName(detectedId)}`);
    }
  } else if (!detectedId && expectedGatewayId) {
    result.warnings.push(`Could not detect gateway, expected ${getGatewayName(expectedGatewayId)}`);
  }

  return result;
}

/**
 * Validate webhook response
 * @param {object} response - Webhook API response
 * @returns {object}
 */
function validateWebhookResponse(response) {
  const result = {
    valid: true,
    errors: []
  };

  if (!response || typeof response !== 'object') {
    result.valid = false;
    result.errors.push('Invalid webhook response');
    return result;
  }

  // Check for success or error
  if (response.error) {
    result.valid = false;
    result.errors.push(response.error);
  }

  if (response.success === false) {
    result.valid = false;
    result.errors.push('Webhook processing failed');
  }

  // Check for gateway-specific webhook response
  if (response.message && response.message.includes('error')) {
    result.valid = false;
    result.errors.push(response.message);
  }

  return result;
}

/**
 * Check if routing is correct
 * @param {object} response - Pay-in response
 * @param {number} expectedGatewayId - Expected gateway ID
 * @returns {boolean}
 */
function isRoutingCorrect(response, expectedGatewayId) {
  const detectedId = detectGatewayId(response);

  // If we can't determine actual gateway, assume correct
  if (detectedId === null) {
    return true;
  }

  return detectedId === expectedGatewayId;
}

/**
 * Get detailed routing info
 * @param {object} response - Pay-in response
 * @param {number} expectedGatewayId - Expected gateway ID
 * @returns {object}
 */
function getRoutingInfo(response, expectedGatewayId) {
  const detectedId = detectGatewayId(response);

  return {
    expectedGatewayId,
    expectedGatewayName: expectedGatewayId ? getGatewayName(expectedGatewayId) : 'Not specified',
    detectedGatewayId: detectedId,
    detectedGatewayName: detectedId ? getGatewayName(detectedId) : 'Unknown',
    isCorrect: detectedId ? detectedId === expectedGatewayId : null,
    message: detectedId
      ? (detectedId === expectedGatewayId
        ? `✅ Correct gateway: ${getGatewayName(detectedId)}`
        : `❌ Gateway mismatch: Expected ${getGatewayName(expectedGatewayId)}, Got ${getGatewayName(detectedId)}`)
      : '⚠️ Could not detect gateway'
  };
}

module.exports = {
  validatePayInResponse,
  validateWebhookResponse,
  isRoutingCorrect,
  detectGatewayId,
  getGatewayName,
  getRoutingInfo,
  GATEWAY_MAP
};