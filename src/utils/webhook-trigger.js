// FILE: src/utils/webhook-trigger.js
const axios = require("axios");
const config = require("../config");
const { logSuccess, logError, logInfo, logWarning } = require("./logger");

/**
 * Detect which gateway was used based on response data
 */
function detectGateway(response) {
  if (!response) return null;

  // Check gatewayId if present (from DB)
  if (response.gatewayId) {
    const gatewayMap = {
      1: "RAZORPAY",
      2: "CASHFREE",
      3: "ADYEN",
      4: "CHARGEBEE",
    };
    return gatewayMap[response.gatewayId] || null;
  }

  // Check response.gatewayName field
  if (response.gatewayName) {
    const name = response.gatewayName.toUpperCase();
    if (name.includes("RAZORPAY")) return "RAZORPAY";
    if (name.includes("CASHFREE")) return "CASHFREE";
    if (name.includes("ADYEN")) return "ADYEN";
  }

  // Check response.gateway field
  if (response.gateway) {
    const gw =
      typeof response.gateway === "string"
        ? response.gateway.toUpperCase()
        : response.gateway;
    if (gw.includes("RAZORPAY")) return "RAZORPAY";
    if (gw.includes("CASHFREE")) return "CASHFREE";
    if (gw.includes("ADYEN")) return "ADYEN";
  }

  // Check intent for gateway identification
  if (response.intent) {
    try {
      const intent =
        typeof response.intent === "string"
          ? JSON.parse(response.intent)
          : response.intent;

      // Razorpay: has 'key' starting with rzp_test
      if (intent.key && intent.key.startsWith("rzp_test")) return "RAZORPAY";

      // Cashfree: has paymentSessionId AND appId starting with TEST
      if (
        intent.paymentSessionId ||
        (intent.appId && intent.appId.startsWith("TEST"))
      ) {
        return "CASHFREE";
      }

      // Adyen: has sessionId starting with CS
      if (intent.sessionId && intent.sessionId.startsWith("CS")) return "ADYEN";

      // Adyen: has pspReference
      if (intent.pspReference) return "ADYEN";

      // Adyen: has clientKey starting with test_
      if (intent.clientKey && intent.clientKey.startsWith("test_"))
        return "ADYEN";
    } catch (e) {}
  }

  return null;
}

/**
 * Get webhook payload for specific gateway with different statuses
 * @param {string} gateway - Gateway name
 * @param {string} merchantReference - Merchant reference
 * @param {number} amount - Payment amount
 * @param {string} paymentMode - Payment mode
 * @param {object} customer - Customer details
 * @param {object} intentData - Parsed intent data from pay-in response
 * @param {string} status - Payment status ('SUCCESS', 'FAILED', 'PENDING')
 */
function getWebhookPayload(
  gateway,
  merchantReference,
  amount,
  paymentMode,
  customer,
  intentData = {},
  status = "SUCCESS",
) {
  const amountInPaise = Math.round(amount * 100);

  switch (gateway) {
    case "RAZORPAY": {
      const orderId =
        intentData.order_id ||
        `order_${Math.random().toString(36).substr(2, 10)}`;
      const paymentId = `pay_${Math.random().toString(36).substr(2, 10)}`;

      // Base payload structure
      const basePayload = {
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: amountInPaise,
              currency: "INR",
              order_id: orderId,
              invoice_id: null,
              international: false,
              method: paymentMode.toLowerCase(),
              amount_refunded: 0,
              refund_status: null,
              captured: status === "SUCCESS",
              description: `Payment for ${merchantReference}`,
              card_id: null,
              bank: "HDFC Bank",
              wallet: null,
              vpa: null,
              email: customer.email,
              contact: customer.phone.replace(/[^0-9]/g, ""),
              notes: {
                customerName: customer.name,
                customerEmail: customer.email,
                customerPhone: customer.phone,
                merchantReference: merchantReference,
              },
              fee: 0,
              tax: 0,
              acquirer_data: {
                rrn: Math.random().toString().substr(2, 12),
              },
              created_at: Math.floor(Date.now() / 1000),
            },
          },
          order: {
            entity: {
              id: orderId,
              entity: "order",
              amount: amountInPaise,
              amount_paid: status === "SUCCESS" ? amountInPaise : 0,
              amount_due: status === "SUCCESS" ? 0 : amountInPaise,
              currency: "INR",
              receipt: merchantReference,
              offer_id: null,
              attempts: 1,
              notes: {
                customerName: customer.name,
                customerEmail: customer.email,
                customerPhone: customer.phone,
                merchantReference: merchantReference,
              },
              created_at: Math.floor(Date.now() / 1000) - 60,
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      };

      // Customize based on status
      switch (status) {
        case "SUCCESS":
          basePayload.event = "payment.captured";
          basePayload.payload.payment.entity.status = "captured";
          basePayload.payload.order.entity.status = "paid";
          break;

        case "FAILED":
          basePayload.event = "payment.failed";
          basePayload.payload.payment.entity.status = "failed";
          basePayload.payload.payment.entity.error_code = "PAYMENT_FAILED";
          basePayload.payload.payment.entity.error_description =
            "Payment failed due to insufficient funds";
          basePayload.payload.payment.entity.error_source = "bank";
          basePayload.payload.payment.entity.error_step =
            "payment_authorization";
          basePayload.payload.payment.entity.error_reason =
            "insufficient_funds";
          basePayload.payload.order.entity.status = "attempted";
          break;

        case "PENDING":
          basePayload.event = "payment.pending";
          basePayload.payload.payment.entity.status = "pending";
          basePayload.payload.order.entity.status = "created";
          break;
      }

      return basePayload;
    }

    case "CASHFREE": {
      const orderId =
        intentData.orderId || `order_${merchantReference}_${Date.now()}`;
      const paymentId = `pay_${Math.random().toString(36).substr(2, 10)}`;

      // Map status to Cashfree statuses
      const cashfreeStatusMap = {
        SUCCESS: "SUCCESS",
        FAILED: "FAILED",
        PENDING: "PENDING",
      };

      const cfStatus = cashfreeStatusMap[status] || "SUCCESS";

      // Map status to event type
      const eventTypeMap = {
        SUCCESS: "PAYMENT_SUCCESS_WEBHOOK",
        FAILED: "PAYMENT_FAILED_WEBHOOK",
        PENDING: "PAYMENT_PENDING_WEBHOOK",
      };

      return {
        type: eventTypeMap[status] || "PAYMENT_SUCCESS_WEBHOOK",
        data: {
          order: {
            order_id: orderId,
            order_amount: amount,
            order_currency: "INR",
            order_status:
              cfStatus === "SUCCESS"
                ? "PAID"
                : cfStatus === "FAILED"
                  ? "FAILED"
                  : "ACTIVE",
            order_expiry_time: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            order_note: `Payment for ${merchantReference}`,
            created_at: new Date().toISOString(),
          },
          payment: {
            payment_id: paymentId,
            order_id: orderId,
            payment_amount: amount,
            payment_status: cfStatus,
            payment_method: paymentMode,
            payment_time: new Date().toISOString(),
            bank_reference:
              cfStatus === "SUCCESS"
                ? Math.random().toString().substr(2, 12)
                : null,
            utr:
              cfStatus === "SUCCESS"
                ? Math.random().toString().substr(2, 12)
                : null,
            acquirer_data:
              cfStatus === "SUCCESS"
                ? {
                    rrn: Math.random().toString().substr(2, 12),
                  }
                : null,
            customer_details: {
              customer_name: customer.name,
              customer_email: customer.email,
              customer_phone: customer.phone,
            },
            // Add failure reason for FAILED status
            ...(cfStatus === "FAILED" && {
              payment_message: "Transaction failed at bank end",
              failure_reason: "Insufficient balance",
            }),
          },
        },
      };
    }

    case "ADYEN": {
      const reference =
        intentData.reference || `${merchantReference}_${Date.now()}`;
      const sessionId = intentData.sessionId || null;

      // Map status to Adyen event codes
      const eventCodeMap = {
        SUCCESS: "AUTHORISATION",
        FAILED: "REFUSED",
        PENDING: "PENDING",
      };

      const reasonMap = {
        SUCCESS: "0000:Authorised",
        FAILED: "1000:Refused",
        PENDING: "0100:Pending",
      };

      return {
        live: "false",
        notificationItems: [
          {
            NotificationRequestItem: {
              additionalData: {
                ...(status === "SUCCESS"
                  ? {
                      authCode: Math.random().toString().substr(2, 6),
                      avsResult: "0",
                      cvcResult: "0",
                      responseCode: "0000",
                      totalFraudScore: "0",
                    }
                  : {
                      responseCode: status === "FAILED" ? "1000" : "0100",
                      refusalReason:
                        status === "FAILED" ? "Insufficient Funds" : null,
                    }),
              },
              amount: {
                currency: "INR",
                value: amountInPaise,
              },
              eventCode: eventCodeMap[status] || "AUTHORISATION",
              eventDate: new Date().toISOString(),
              merchantAccountCode: "HlleoCOM",
              merchantReference: reference,
              paymentMethod: paymentMode.toLowerCase(),
              pspReference:
                sessionId ||
                `AYDEN_PSP_REF_${Math.random().toString(36).substr(2, 10)}`,
              reason: reasonMap[status] || "0000:Authorised",
              success: status === "SUCCESS" ? "true" : "false",
            },
          },
        ],
      };
    }

    default:
      return null;
  }
}

/**
 * Automatically trigger the appropriate webhook based on gateway and status
 * @param {object} payInResult - Pay-in result
 * @param {string} forceStatus - Force a specific status ('SUCCESS', 'FAILED', 'PENDING')
 */
async function triggerWebhookForPayIn(payInResult, forceStatus = null) {
  const { request, response } = payInResult;
  const { merchantReference, paymentMode, customer } = request;
  const amount = parseFloat(response.amountToCredit) || request.amount;

  // Detect which gateway was used
  const gateway = detectGateway(response);

  if (!gateway) {
    logError(`❌ Could not detect gateway for ${merchantReference}`);
    return null;
  }

  // If PENDING, don't trigger webhook (payment is not complete)
  if (forceStatus === "PENDING") {
    logWarning(
      `⏳ Skipping webhook for PENDING transaction ${merchantReference}`,
    );
    return {
      gateway,
      status: "PENDING",
      webhookTriggered: false,
      reason: "Pending transactions do not trigger webhooks",
    };
  }

  const status = forceStatus || "SUCCESS";
  logInfo(
    `🔄 Triggering ${gateway} webhook (${status}) for ${merchantReference}...`,
  );

  // Parse intent to extract real IDs
  let intentData = null;
  if (response.intent) {
    try {
      intentData =
        typeof response.intent === "string"
          ? JSON.parse(response.intent)
          : response.intent;
    } catch (e) {}
  }

  // Get webhook payload with real intent data and status
  const webhookPayload = getWebhookPayload(
    gateway,
    merchantReference,
    amount,
    paymentMode,
    customer,
    intentData,
    status, // Pass status!
  );

  if (!webhookPayload) {
    logError(`❌ No webhook payload for ${gateway}`);
    return null;
  }

  // Get webhook URL
  const webhookUrls = {
    RAZORPAY: config.API_PATHS.WEBHOOKS.RAZORPAY,
    CASHFREE: config.API_PATHS.WEBHOOKS.CASHFREE,
    ADYEN: config.API_PATHS.WEBHOOKS.ADYEN,
  };

  const webhookUrl = `${config.BASE_URL}${webhookUrls[gateway]}`;

  try {
    const webhookResponse = await axios.post(webhookUrl, webhookPayload, {
      headers: { "Content-Type": "application/json" },
    });

    logSuccess(`✅ ${gateway} webhook (${status}) triggered successfully`);
    return { gateway, status, success: true, response: webhookResponse.data };
  } catch (error) {
    logError(`❌ ${gateway} webhook (${status}) failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    return { gateway, status, success: false, error: error.message };
  }
}

module.exports = { triggerWebhookForPayIn, detectGateway, getWebhookPayload };
