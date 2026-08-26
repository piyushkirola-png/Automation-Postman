const axios = require("axios");
const config = require("../config");
const {
  generateSignature,
  generateMerchantReference,
} = require("../utils/crypto");
const {
  randomCustomer,
  randomAmount,
  randomPaymentMode,
} = require("../utils/random");
const { logger, logSuccess, logError, logInfo } = require("../utils/logger");

/**
 * Generate random merchant reference
 */
function generateRandomMerchantReference() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `ORD-${timestamp}-${random}`;
}

/**
 * Create a pay-in request
 */
async function createPayIn(accessToken, clientSecret, options = {}) {
  try {
    const url = `${config.BASE_URL}${config.API_PATHS.PAYIN}`;

    const merchantReference =
      options.merchantReference || generateRandomMerchantReference();

    const signature = generateSignature(merchantReference, clientSecret);

    const customer = options.customer || randomCustomer();

    const amount =
      options.amount ||
      randomAmount(
        config.TEST_CONFIG.MIN_AMOUNT,
        config.TEST_CONFIG.MAX_AMOUNT,
      );
    const currency = options.currency || "INR";
    const paymentMode = options.paymentMode || randomPaymentMode();

    // HOSTED CHECKOUT
    const payload = {
      amount,
      currency,
      merchantReference,
      paymentMode,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    };

    logInfo(
      `Creating Pay-In: ${merchantReference} | ${paymentMode} | ₹${amount}`,
    );

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-signature": signature,
      },
    });

    // status is "PROCESSING"
    if (response.data && response.data.id) {
      logSuccess(
        `Pay-In created: ID ${response.data.id} | Status: ${response.data.status} | URL: ${response.data.url || "N/A"}`,
      );
    }

    return {
      request: {
        payload,
        signature,
        merchantReference,
        amount,
        currency,
        paymentMode,
        customer,
      },
      response: response.data,
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
 */
async function createMultiplePayIns(accessToken, clientSecret, count = 5) {
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const result = await createPayIn(accessToken, clientSecret);
      results.push({
        success: true,
        transaction: result,
        index: i + 1,
      });
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        index: i + 1,
      });
    }
  }
  return results;
}

module.exports = { createPayIn, createMultiplePayIns };
