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
 * Generate a random valid 16-digit card number (Luhn algorithm)
 */
function generateRandomCardNumber() {
  // Generate random 15 digits
  let cardNumber = "";
  for (let i = 0; i < 15; i++) {
    cardNumber += Math.floor(Math.random() * 10);
  }

  // Calculate Luhn checksum for the 16th digit
  let sum = 0;
  let shouldDouble = true;

  // Start from rightmost digit (excluding checksum)
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber[i]);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  const checksum = (10 - (sum % 10)) % 10;
  return cardNumber + checksum;
}

function generateRandomExpiryMonth() {
  return String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
}

function generateRandomExpiryYear() {
  return String(2026 + Math.floor(Math.random() * 5));
}

function generateRandomCvv() {
  return String(Math.floor(Math.random() * 900) + 100);
}

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

    const payload = {
      amount,
      currency,
      merchantReference,
      paymentMode,
      customer,
    };

    if (paymentMode === "CARD") {
      payload.card = {
        cardNumber: options.cardNumber || generateRandomCardNumber(),
        expiryMonth: options.expiryMonth || generateRandomExpiryMonth(),
        expiryYear: options.expiryYear || generateRandomExpiryYear(),
        cvv: options.cvv || generateRandomCvv(),
        cardHolderName: options.cardHolderName || customer.name,
      };
    }

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

    if (response.data && response.data.id) {
      logSuccess(
        `Pay-In created: ID ${response.data.id} | Status: ${response.data.status}`,
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
