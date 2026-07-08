const axios = require('axios');
const config = require('../config');
const { generateSignature, generateMerchantReference } = require('../utils/crypto');
const { randomCustomer, randomAmount, randomPaymentMode } = require('../utils/random');
const { logger, logSuccess, logError, logInfo } = require('../utils/logger');

/**
 * Create a pay-in request
 * @param {string} accessToken - Bearer token
 * @param {string} clientSecret - Client secret for signature
 * @param {object} options - Optional overrides
 * @returns {Promise<{request: object, response: object}>}
 */
async function createPayIn(accessToken, clientSecret, options = {}) {
  try {
    const url = `${config.BASE_URL}${config.API_PATHS.PAYIN}`;
    
    // Generate unique merchant reference
    const merchantReference = options.merchantReference || generateMerchantReference();
    
    // Generate signature
    const signature = generateSignature(merchantReference, clientSecret);
    
    // Generate random customer data
    const customer = options.customer || randomCustomer();
    
    // Generate random amount and payment mode
    const amount = options.amount || randomAmount(config.TEST_CONFIG.MIN_AMOUNT, config.TEST_CONFIG.MAX_AMOUNT);
    const currency = options.currency || 'INR';
    const paymentMode = options.paymentMode || randomPaymentMode();
    
    const payload = {
      amount,
      currency,
      merchantReference,
      paymentMode,
      customer
    };
    
    logInfo(`Creating Pay-In: ${merchantReference} | ${paymentMode} | ₹${amount}`);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-signature': signature
      }
    });
    
    if (response.data && response.data.id) {
      logSuccess(`Pay-In created: ID ${response.data.id} | Status: ${response.data.status}`);
    }
    
    return {
      request: {
        payload,
        signature,
        merchantReference,
        amount,
        currency,
        paymentMode,
        customer
      },
      response: response.data
    };
    
  } catch (error) {
    logError(`Pay-In failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Create multiple pay-in requests
 * @param {string} accessToken - Bearer token
 * @param {string} clientSecret - Client secret
 * @param {number} count - Number of transactions
 * @returns {Promise<Array>}
 */
async function createMultiplePayIns(accessToken, clientSecret, count = 5) {
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const result = await createPayIn(accessToken, clientSecret);
      results.push({
        success: true,
        transaction: result,
        index: i + 1
      });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        index: i + 1
      });
    }
  }
  return results;
}

module.exports = { createPayIn, createMultiplePayIns };