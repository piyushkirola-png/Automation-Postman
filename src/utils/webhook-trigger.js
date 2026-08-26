// utils/webhook-trigger.js
const axios = require("axios");
const config = require("../config");
const { logInfo, logSuccess, logError } = require("./logger");

/**
 * ⭐ NEW: Detect gateway from intent JSON
 */
function detectGateway(response) {
  if (!response) return null;

  // Check if we have intent field
  if (response.intent) {
    try {
      let intent = response.intent;

      // Parse if string
      if (typeof intent === "string") {
        intent = JSON.parse(intent);
      }

      // RAZORPAY: has key starting with rzp_test
      if (intent.key && intent.key.startsWith("rzp_test")) {
        return "RAZORPAY";
      }

      // CASHFREE: has paymentSessionId
      if (intent.paymentSessionId) {
        return "CASHFREE";
      }

      // ADYEN: has sessionId starting with CS
      if (intent.sessionId && intent.sessionId.startsWith("CS")) {
        return "ADYEN";
      }

      // CHARGEBEE: has hostedPageId
      if (intent.hostedPageId) {
        return "CHARGEBEE";
      }

      // BENNUPAY: has purchaseId
      if (intent.purchaseId) {
        return "BENNUPAY";
      }

      // SABPAISA: has paymentId starting with sppay_
      if (intent.paymentId && intent.paymentId.startsWith("sppay_")) {
        return "SABPAISA";
      }

      // STRIPE: has sessionId starting with cs_test_
      if (intent.sessionId && intent.sessionId.startsWith("cs_test_")) {
        return "STRIPE";
      }

      // PAYU: has txnid
      if (intent.txnid) {
        return "PAYU";
      }
    } catch (e) {
      // Not JSON, continue with other checks
    }
  }

  // Fallback: check URL for gateway hints
  if (response.url) {
    const url = response.url.toLowerCase();
    if (url.includes("rzp.io")) return "RAZORPAY";
    if (url.includes("cashfree")) return "CASHFREE";
    if (url.includes("adyen")) return "ADYEN";
    if (url.includes("chargebee")) return "CHARGEBEE";
    if (url.includes("bennupay")) return "BENNUPAY";
    if (url.includes("sabpaisa")) return "SABPAISA";
    if (url.includes("stripe")) return "STRIPE";
    if (url.includes("payu")) return "PAYU";
  }

  return null;
}

/**
 * ⭐ NEW: Get webhook payload for specific gateway (matching current backend)
 */
function getWebhookPayload(
  gateway,
  merchantReference,
  amount,
  paymentMode,
  customer,
  status = "SUCCESS",
) {
  const amountInPaise = Math.round(amount * 100);

  switch (gateway) {
    case "RAZORPAY":
      return {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_${Math.random().toString(36).substr(2, 10)}`,
              entity: "payment",
              amount: amountInPaise,
              currency: "INR",
              status: "captured",
              order_id: `order_${Math.random().toString(36).substr(2, 10)}`,
              invoice_id: null,
              international: false,
              method: paymentMode.toLowerCase(),
              amount_refunded: 0,
              refund_status: null,
              captured: true,
              description: `Payment for ${merchantReference}`,
              card_id: null,
              bank: null,
              wallet: null,
              vpa: null,
              email: customer.email,
              contact: customer.phone.replace(/[^0-9]/g, ""),
              notes: {
                merchantReference: merchantReference,
              },
              fee: 0,
              tax: 0,
              error_code: null,
              error_description: null,
              created_at: Math.floor(Date.now() / 1000),
            },
          },
          order: {
            entity: {
              id: `order_${Math.random().toString(36).substr(2, 10)}`,
              entity: "order",
              amount: amountInPaise,
              amount_paid: amountInPaise,
              amount_due: 0,
              currency: "INR",
              receipt: merchantReference,
              status: "paid",
              attempts: 1,
              notes: {
                merchantReference: merchantReference,
              },
              created_at: Math.floor(Date.now() / 1000) - 60,
            },
          },
        },
        created_at: Math.floor(Date.now() / 1000),
      };

    case "CASHFREE":
      return {
        type: "PAYMENT_SUCCESS_WEBHOOK",
        data: {
          order: {
            order_id: merchantReference,
            order_amount: amount,
            order_currency: "INR",
            order_status: "PAID",
            order_expiry_time: null,
            order_note: `Payment for order ${merchantReference}`,
            created_at: new Date().toISOString(),
          },
          payment: {
            payment_id: `pay_${Math.random().toString(36).substr(2, 10)}`,
            order_id: merchantReference,
            payment_amount: amount,
            payment_status: "SUCCESS",
            payment_method: paymentMode,
            payment_time: new Date().toISOString(),
            bank_reference: null,
            utr: null,
            acquirer_data: {
              rrn: null,
            },
            customer_details: {
              customer_name: customer.name,
              customer_email: customer.email,
              customer_phone: customer.phone,
            },
          },
        },
      };

    case "ADYEN":
      return {
        live: "false",
        notificationItems: [
          {
            NotificationRequestItem: {
              additionalData: {
                authCode: Math.random().toString().substr(2, 6),
                avsResult: "0",
                cvcResult: "0",
                responseCode: "0000",
                totalFraudScore: "0",
              },
              amount: {
                currency: "INR",
                value: amountInPaise,
              },
              eventCode: "AUTHORISATION",
              eventDate: new Date().toISOString(),
              merchantAccountCode: "HlleoCOM",
              merchantReference: merchantReference,
              paymentMethod: paymentMode.toLowerCase(),
              pspReference: `AYDEN_PSP_REF_${Math.random().toString(36).substr(2, 10)}`,
              reason: "0000:Authorised",
              success: "true",
            },
          },
        ],
      };

    case "CHARGEBEE":
      return {
        event_type: "payment_succeeded",
        content: {
          payment: {
            id: `pay_${Math.random().toString(36).substr(2, 10)}`,
            status: "success",
            amount: amountInPaise,
            currency_code: "INR",
            reference_number: merchantReference,
            payment_method: {
              card: {
                last4: null,
                card_type: paymentMode,
              },
            },
            date: new Date().toISOString(),
            authorization_id: null,
            gateway: {
              reference_id: `gateway_${Math.random().toString(36).substr(2, 10)}`,
            },
          },
          invoice: {
            id: merchantReference,
            status: "paid",
            amount: amountInPaise,
            paid_at: new Date().toISOString(),
          },
          customer: {
            id: `cust_${Math.random().toString(36).substr(2, 10)}`,
            email: customer.email,
            name: customer.name,
            phone: customer.phone,
          },
        },
        webhook: {
          id: `webhook_${Math.random().toString(36).substr(2, 10)}`,
          webhook_status: "sent",
          received_at: new Date().toISOString(),
        },
      };

    case "BENNUPAY":
      return {
        id: `mock_${Date.now()}`,
        status: "paid",
        reference: merchantReference,
        client: {
          email: customer.email,
          full_name: customer.name,
          phone: customer.phone,
        },
        purchase: {
          total: amountInPaise,
          currency: "INR",
        },
        transaction_data: {
          payment_method: paymentMode,
        },
        payment: {
          remote_paid_on: new Date().toISOString(),
        },
        is_test: true,
        status_history: [
          {
            status: "created",
            timestamp: new Date(Date.now() - 60000).toISOString(),
          },
          {
            status: "paid",
            timestamp: new Date().toISOString(),
          },
        ],
      };

    case "SABPAISA":
      return {
        paymentId: `sppay_${Math.random().toString(36).substr(2, 10)}`,
        merchantTxnId: merchantReference,
        amount: amountInPaise,
        currency: "INR",
        status: "SUCCESS",
        bankReference: `SBIN${Math.random().toString().substr(2, 9)}`,
        transactionDate: new Date().toISOString(),
        paymentMethod: paymentMode,
        paymentMode: paymentMode,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerName: customer.name,
      };

    case "STRIPE":
      return {
        id: `evt_${Math.random().toString(36).substr(2, 10)}`,
        type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `pi_${Math.random().toString(36).substr(2, 10)}`,
            object: "payment_intent",
            amount: amountInPaise,
            amount_capturable: 0,
            amount_received: amountInPaise,
            currency: "inr",
            status: "succeeded",
            payment_method: `pm_${Math.random().toString(36).substr(2, 10)}`,
            payment_method_types: ["card"],
            receipt_email: customer.email,
            description: `Payment for order ${merchantReference}`,
            metadata: {
              order_id: merchantReference,
              merchant_reference: merchantReference,
            },
            charges: {
              data: [
                {
                  id: `ch_${Math.random().toString(36).substr(2, 10)}`,
                  amount: amountInPaise,
                  currency: "inr",
                  status: "succeeded",
                  payment_method_details: {
                    card: {
                      brand: "visa",
                      last4: "1111",
                      network: "visa",
                    },
                  },
                  receipt_url: `https://pay.stripe.com/receipts/${Math.random().toString(36).substr(2, 10)}`,
                  balance_transaction: `txn_${Math.random().toString(36).substr(2, 10)}`,
                },
              ],
            },
            latest_charge: `ch_${Math.random().toString(36).substr(2, 10)}`,
            customer: `cus_${Math.random().toString(36).substr(2, 10)}`,
          },
        },
        livemode: false,
        pending_webhooks: 0,
        request: {
          id: `req_${Math.random().toString(36).substr(2, 10)}`,
          idempotency_key: `abc${Math.random().toString(36).substr(2, 10)}`,
        },
      };

    case "PAYU":
      return {
        txnid: merchantReference,
        mihpayid: `PayU_Transaction_ID_${Math.random().toString(36).substr(2, 10)}`,
        amount: amount.toFixed(2),
        status: "success",
        mode:
          paymentMode === "CARD" ? "CC" : paymentMode === "UPI" ? "UPI" : "NB",
        unmappedstatus: "captured",
        bank_ref_num: `BANK_REF_${Math.random().toString(36).substr(2, 10)}`,
        bankcode:
          paymentMode === "CARD" ? "CC" : paymentMode === "UPI" ? "UPI" : "NB",
        error: "E000",
        error_Message: "No Error",
        udf1: merchantReference,
        udf2: null,
        udf3: null,
        udf4: null,
        udf5: null,
        udf6: null,
        udf7: null,
        udf8: null,
        udf9: null,
        udf10: null,
        hash: `generated_hash_${Math.random().toString(36).substr(2, 10)}`,
        firstname: customer.name,
        email: customer.email,
        phone: customer.phone.replace(/[^0-9]/g, ""),
      };

    default:
      return null;
  }
}

/**
 * ⭐ UPDATED: Trigger webhook for a pay-in
 */
async function triggerWebhookForPayIn(payInResult, forceStatus = null) {
  const { request, response } = payInResult;
  const { merchantReference, paymentMode, customer } = request;
  const amount = request.amount;

  // ⭐ Detect gateway from intent
  const gateway = detectGateway(response);

  if (!gateway) {
    logError(`❌ Could not detect gateway for ${merchantReference}`);
    logError(`Response: ${JSON.stringify(response)}`);
    return null;
  }

  logInfo(`✅ Gateway detected: ${gateway}`);
  logInfo(`🔔 Triggering ${gateway} webhook for ${merchantReference}...`);

  const webhookPayload = getWebhookPayload(
    gateway,
    merchantReference,
    amount,
    paymentMode,
    customer,
    forceStatus || "SUCCESS",
  );

  if (!webhookPayload) {
    logError(`❌ No webhook payload for ${gateway}`);
    return null;
  }

  const webhookUrls = {
    RAZORPAY: config.API_PATHS.WEBHOOKS.RAZORPAY,
    CASHFREE: config.API_PATHS.WEBHOOKS.CASHFREE,
    ADYEN: config.API_PATHS.WEBHOOKS.ADYEN,
    CHARGEBEE: config.API_PATHS.WEBHOOKS.CHARGEBEE,
    BENNUPAY: config.API_PATHS.WEBHOOKS.BENNUPAY,
    SABPAISA: config.API_PATHS.WEBHOOKS.SABPAISA,
    STRIPE: config.API_PATHS.WEBHOOKS.STRIPE,
    // PAYU: config.API_PATHS.WEBHOOKS.PAYU,
    PAYU: "/webhooks/payu/success",
  };

  const webhookUrl = `${config.BASE_URL}${webhookUrls[gateway]}`;

  logInfo(`📨 Sending webhook to: ${webhookUrl}`);

  try {
    const webhookResponse = await axios.post(webhookUrl, webhookPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });

    logSuccess(`✅ ${gateway} webhook triggered successfully`);
    logInfo(`📊 Response: ${JSON.stringify(webhookResponse.data)}`);

    return {
      gateway,
      status: "SUCCESS",
      success: true,
      response: webhookResponse.data,
    };
  } catch (error) {
    logError(`❌ Webhook failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    return {
      gateway,
      status: "FAILED",
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  triggerWebhookForPayIn,
  detectGateway,
  getWebhookPayload,
};
