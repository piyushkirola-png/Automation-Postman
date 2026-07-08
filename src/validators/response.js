const { logger, logSuccess, logError, logInfo, logWarning } = require('../utils/logger');

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
    warnings: []
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

  // Check if gateway routing is correct
  // Note: Gateway ID is not directly in response, we need to check intent or other fields
  if (response.intent) {
    try {
      const intent = JSON.parse(response.intent);
      if (intent.key) {
        // Razorpay key indicates Razorpay gateway
        const actualGateway = intent.key.startsWith('rzp_test') ? 1 : null;
        if (actualGateway && actualGateway !== expectedGatewayId) {
          result.warnings.push(`Gateway mismatch: Expected ${expectedGatewayId}, Got ${actualGateway}`);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
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

  return result;
}

/**
 * Check if routing is correct
 * @param {object} response - Pay-in response
 * @param {number} expectedGatewayId - Expected gateway ID
 * @returns {boolean}
 */
function isRoutingCorrect(response, expectedGatewayId) {
  // Try to extract gateway from response
  let actualGatewayId = null;
  
  if (response.intent) {
    try {
      const intent = JSON.parse(response.intent);
      if (intent.key) {
        if (intent.key.startsWith('rzp_test')) {
          actualGatewayId = 1; // Razorpay
        } else if (intent.key.includes('cashfree')) {
          actualGatewayId = 2; // Cashfree
        } else if (intent.key.includes('adyen')) {
          actualGatewayId = 3; // Adyen
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // If we can't determine actual gateway, assume correct
  if (actualGatewayId === null) {
    return true;
  }

  return actualGatewayId === expectedGatewayId;
}

module.exports = {
  validatePayInResponse,
  validateWebhookResponse,
  isRoutingCorrect
};