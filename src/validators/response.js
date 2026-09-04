const {
  logger,
  logSuccess,
  logError,
  logInfo,
  logWarning,
} = require("../utils/logger");

// UPDATED GATEWAY MAP with all new gateways
const GATEWAY_MAP = {
  1: { id: 1, name: "Razorpay", keyPatterns: ["rzp_test"] },
  2: { id: 2, name: "Cashfree", keyPatterns: ["cashfree", "cf_"] },
  3: { id: 3, name: "Adyen", keyPatterns: ["adyen"] },
  4: { id: 4, name: "ChargeBee", keyPatterns: ["chargebee", "cb_", "ch_"] },
  5: { id: 5, name: "Bennupay", keyPatterns: ["bennupay", "bp_"] },
  6: { id: 6, name: "SabPaisa", keyPatterns: ["sppay_", "sabpaisa"] },
  7: {
    id: 7,
    name: "Chillpay",
    keyPatterns: ["chillpay", "CHP-TXN", "PayLinkToken"],
  },
  8: {
    id: 8,
    name: "Setu",
    keyPatterns: ["setu", "platformBillID", "billerBillID"],
  },
  9: { id: 9, name: "Stripe", keyPatterns: ["stripe", "cs_test_"] },
  10: { id: 10, name: "PayU", keyPatterns: ["payu", "txnid"] },
  12: {
    id: 12,
    name: "Paystack",
    keyPatterns: ["paystack", "checkout.paystack"],
  },
  14: { id: 14, name: "Mollie", keyPatterns: ["mollie", "mollie.com"] },
  15: {
    id: 15,
    name: "Flutterwave",
    keyPatterns: ["flutterwave", "checkout-v2.dev-flutterwave"],
  },
};

function detectGatewayId(response) {
  if (!response) return null;

  if (response.intent) {
    try {
      let intent = response.intent;
      if (typeof intent === "string") {
        intent = JSON.parse(intent);
      }

      // Razorpay
      if (intent.key && intent.key.startsWith("rzp_test")) {
        return 1;
      }

      // Cashfree
      if (intent.paymentSessionId) {
        return 2;
      }

      // Adyen
      if (intent.sessionId && intent.sessionId.startsWith("CS")) {
        return 3;
      }

      // Chargebee
      if (intent.hostedPageId) {
        return 4;
      }

      // Bennupay
      if (intent.purchaseId) {
        return 5;
      }

      // SabPaisa
      if (intent.paymentId && intent.paymentId.startsWith("sppay_")) {
        return 6;
      }

      // CHILLPAY
      if (intent.payLinkId || intent.payLinkToken || intent.PayLinkToken) {
        return 7;
      }

      // SETU - no specific intent, check URL
      if (response.url && response.url.includes("kaypay")) {
        return 8;
      }

      // Stripe
      if (intent.sessionId && intent.sessionId.startsWith("cs_test_")) {
        return 9;
      }

      // PayU
      if (intent.txnid) {
        return 10;
      }

      // PAYSTACK
      if (intent.accessCode || intent.reference) {
        return 12;
      }

      // MOLLIE
      if (intent.paymentId && intent.paymentId.startsWith("tr_")) {
        return 14;
      }

      // FLUTTERWAVE
      if (intent.tx_ref || intent.checkoutUrl?.includes("flutterwave")) {
        return 15;
      }
    } catch (e) {
      // Not JSON, continue
    }
  }

  // Fallback: check URL
  if (response.url) {
    const url = response.url.toLowerCase();
    if (url.includes("rzp.io")) return 1;
    if (url.includes("cashfree")) return 2;
    if (url.includes("adyen")) return 3;
    if (url.includes("chargebee")) return 4;
    if (url.includes("bennupay")) return 5;
    if (url.includes("sabpaisa")) return 6;
    if (url.includes("chillpay")) return 7;
    if (url.includes("kaypay")) return 8;
    if (url.includes("stripe")) return 9;
    if (url.includes("payu")) return 10;
    if (url.includes("checkout.paystack")) return 12;
    if (url.includes("mollie.com")) return 14;
    if (url.includes("flutterwave")) return 15;
  }

  return null;
}

function getGatewayName(gatewayId) {
  return GATEWAY_MAP[gatewayId]?.name || `Unknown (${gatewayId})`;
}

function validatePayInResponse(response, request, expectedGatewayId) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    detectedGatewayId: null,
    detectedGatewayName: null,
  };

  if (!response.id) {
    result.valid = false;
    result.errors.push("Missing transaction ID");
  }

  if (!response.status) {
    result.valid = false;
    result.errors.push("Missing status");
  }

  if (response.merchantReference !== request.merchantReference) {
    result.valid = false;
    result.errors.push(
      `Merchant reference mismatch: Expected ${request.merchantReference}, Got ${response.merchantReference}`,
    );
  }

  if (parseFloat(response.amount) !== request.amount) {
    result.warnings.push(
      `Amount mismatch: Expected ${request.amount}, Got ${response.amount}`,
    );
  }

  const detectedId = detectGatewayId(response);
  result.detectedGatewayId = detectedId;
  result.detectedGatewayName = detectedId
    ? getGatewayName(detectedId)
    : "Unknown";

  if (detectedId && expectedGatewayId) {
    if (detectedId !== expectedGatewayId) {
      result.valid = false;
      result.errors.push(
        `Gateway mismatch: Expected ${getGatewayName(expectedGatewayId)} (ID: ${expectedGatewayId}), ` +
          `Got ${getGatewayName(detectedId)} (ID: ${detectedId})`,
      );
    } else {
      result.warnings.push(`✅ Gateway correct: ${getGatewayName(detectedId)}`);
    }
  } else if (!detectedId && expectedGatewayId) {
    result.warnings.push(
      `Could not detect gateway, expected ${getGatewayName(expectedGatewayId)}`,
    );
  }

  if (response.feeAmount !== undefined) {
    result.warnings.push(`Fee Amount: ₹${response.feeAmount}`);
  }
  if (response.taxAmount !== undefined) {
    result.warnings.push(`Tax Amount: ₹${response.taxAmount}`);
  }
  if (response.amountToCredit !== undefined) {
    result.warnings.push(`Amount to Credit: ₹${response.amountToCredit}`);
  }

  return result;
}

function validateWebhookResponse(response) {
  const result = {
    valid: true,
    errors: [],
  };

  if (!response || typeof response !== "object") {
    result.valid = false;
    result.errors.push("Invalid webhook response");
    return result;
  }

  if (response.error) {
    result.valid = false;
    result.errors.push(response.error);
  }

  if (response.success === false) {
    result.valid = false;
    result.errors.push("Webhook processing failed");
  }

  if (response.message && response.message.includes("error")) {
    result.valid = false;
    result.errors.push(response.message);
  }

  return result;
}

function isRoutingCorrect(response, expectedGatewayId) {
  const detectedId = detectGatewayId(response);
  if (detectedId === null) {
    return true;
  }
  return detectedId === expectedGatewayId;
}

function getRoutingInfo(response, expectedGatewayId) {
  const detectedId = detectGatewayId(response);

  return {
    expectedGatewayId,
    expectedGatewayName: expectedGatewayId
      ? getGatewayName(expectedGatewayId)
      : "Not specified",
    detectedGatewayId: detectedId,
    detectedGatewayName: detectedId ? getGatewayName(detectedId) : "Unknown",
    isCorrect: detectedId ? detectedId === expectedGatewayId : null,
    message: detectedId
      ? detectedId === expectedGatewayId
        ? `✅ Correct gateway: ${getGatewayName(detectedId)}`
        : `❌ Gateway mismatch: Expected ${getGatewayName(expectedGatewayId)}, Got ${getGatewayName(detectedId)}`
      : "⚠️ Could not detect gateway",
  };
}

module.exports = {
  validatePayInResponse,
  validateWebhookResponse,
  isRoutingCorrect,
  detectGatewayId,
  getGatewayName,
  getRoutingInfo,
  GATEWAY_MAP,
};
