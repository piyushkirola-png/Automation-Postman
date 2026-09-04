const axios = require("axios");
const config = require("../config");
const { logInfo, logSuccess, logError } = require("./logger");

// ============== HELPER FUNCTIONS ==============
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomDelay(min, max) {
  const delay = randomInt(min, max);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

/**
 * Detect gateway from intent JSON
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

      // CHILLPAY
      if (intent.payLinkId || intent.payLinkToken || intent.PayLinkToken) {
        return "CHILLPAY";
      }

      // SETU - check URL
      if (response.url && response.url.includes("kaypay")) {
        return "SETU";
      }

      // PAYSTACK
      if (intent.accessCode || intent.reference) {
        return "PAYSTACK";
      }

      // MOLLIE
      if (intent.paymentId && intent.paymentId.startsWith("tr_")) {
        return "MOLLIE";
      }

      // FLUTTERWAVE
      if (intent.tx_ref || intent.checkoutUrl?.includes("flutterwave")) {
        return "FLUTTERWAVE";
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
    if (url.includes("chillpay")) return "CHILLPAY";
    if (url.includes("kaypay")) return "SETU";
    if (url.includes("checkout.paystack")) return "PAYSTACK";
    if (url.includes("mollie.com")) return "MOLLIE";
    if (url.includes("flutterwave")) return "FLUTTERWAVE";
  }

  return null;
}

/**
 * Get webhook payload for specific gateway
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

    case "CHILLPAY":
      return {
        OrderNo: merchantReference,
        TransactionId: `CHP-TXN-${Math.random().toString(36).substr(2, 15)}`,
        PaymentStatus: "0",
        Amount: amount * 100,
        BankRefCode: `BANK-REF-${Math.random().toString(36).substr(2, 10)}`,
        PaymentChannel: paymentMode === "CARD" ? "CreditCard" : "UPI",
        PaymentDateTime: new Date()
          .toISOString()
          .replace("T", " ")
          .slice(0, 19),
        Currency: "THB",
        MerchantCode: "M038709",
        PayLinkToken: Math.random().toString(36).substr(2, 10).toUpperCase(),
        PayLinkId: Math.floor(Math.random() * 100000),
        CardNumber: "411111******1111",
        CardBank: "Bangkok Bank",
        CardType: "Visa",
        ChannelCode: "CC",
        Installment: 0,
        InterestType: "Zero",
        InterestRate: 0,
      };

    case "SETU":
      return {
        events: [
          {
            id: `evt_${Math.random().toString(36).substr(2, 15)}`,
            type: "BILL_FULFILMENT_STATUS",
            timeStamp: new Date().toISOString(),
            data: {
              platformBillID: merchantReference,
              billerBillID: merchantReference,
              status: "PAYMENT_SUCCESSFUL",
              amountPaid: {
                value: amount * 100,
                currency: "INR",
              },
              payerVpa: customer.email,
              transactionId: Math.random().toString(36).substr(2, 15),
              transactionNote: `Payment for ${merchantReference}`,
              receiptId: Math.random().toString(36).substr(2, 15),
              additionalInfo: {
                merchantReference: merchantReference,
                customerName: customer.name,
                customerEmail: customer.email,
              },
            },
          },
        ],
        partnerDetails: {
          partnerId: `PARTNER_${Math.random().toString(36).substr(2, 5)}`,
          partnerName: "Test Partner",
        },
      };

    case "PAYSTACK":
      return {
        event: "charge.success",
        data: {
          id: Math.floor(Math.random() * 10000000),
          domain: "live",
          status: "success",
          reference: `${merchantReference}_${Date.now()}`,
          amount: amount * 100,
          message: null,
          gateway_response: "Approved",
          paid_at: new Date(Date.now() + 60000).toISOString(),
          created_at: new Date().toISOString(),
          channel: paymentMode.toLowerCase(),
          currency: "NGN",
          ip_address: "127.0.0.1",
          metadata: {
            merchant_reference: merchantReference,
            customer_name: customer.name,
            customer_email: customer.email,
          },
          authorization: {
            authorization_code: `AUTH_${Math.random().toString(36).substr(2, 10)}`,
            bin: "539999",
            last4: "1234",
            exp_month: "12",
            exp_year: "2028",
            channel: "card",
            card_type: "visa",
            bank: "TEST BANK",
            country_code: "NG",
            brand: "visa",
            reusable: true,
            signature: `SIG_${Math.random().toString(36).substr(2, 10)}`,
          },
          customer: {
            id: Math.floor(Math.random() * 1000000),
            first_name: customer.name.split(" ")[0] || "User",
            last_name: customer.name.split(" ")[1] || "Test",
            email: customer.email,
            customer_code: `CUS_${Math.random().toString(36).substr(2, 10)}`,
            phone: customer.phone,
            risk_action: "default",
          },
        },
      };

    case "MOLLIE":
      return {
        id: `tr_${Math.random().toString(36).substr(2, 10)}`,
        mode: "live",
        createdAt: new Date().toISOString(),
        amount: {
          value: amount.toFixed(2),
          currency: "EUR",
        },
        description: `Payment for ${merchantReference}`,
        method: paymentMode.toLowerCase(),
        status: "paid",
        paidAt: new Date(Date.now() + 60000).toISOString(),
        metadata: {
          merchant_reference: merchantReference,
          order_id: merchantReference,
        },
        details: {
          cardNumber: "**** **** **** 1234",
          cardHolder: customer.name,
          cardAudience: "consumer",
          cardLabel: paymentMode === "CARD" ? "Visa" : "UPI",
          cardCountryCode: "NL",
        },
        _links: {
          self: {
            href: `https://api.mollie.com/v2/payments/tr_${Math.random().toString(36).substr(2, 10)}`,
            type: "application/hal+json",
          },
        },
      };

    case "FLUTTERWAVE":
      return {
        event: "charge.completed",
        data: {
          tx_ref: `${merchantReference}_${Date.now()}`,
          flw_ref: `FLW-TEST-${Math.random().toString(36).substr(2, 10)}`,
          amount: amount,
          currency: "NGN",
          status: "successful",
          meta: {
            merchant_reference: merchantReference,
            customer_name: customer.name,
            customer_email: customer.email,
          },
          customer: {
            email: customer.email,
            name: customer.name,
            phonenumber: customer.phone,
          },
        },
      };

    default:
      return null;
  }
}

/**
 * Trigger webhook for a pay-in
 * @param {object} payInResult - The pay-in result object
 * @param {string} forceStatus - Force status (optional)
 * @param {number} gatewayDelayMin - Minimum gateway delay in ms (default: 1000)
 * @param {number} gatewayDelayMax - Maximum gateway delay in ms (default: 10000)
 */
async function triggerWebhookForPayIn(
  payInResult,
  forceStatus = null,
  gatewayDelayMin = 1000,
  gatewayDelayMax = 10000,
) {
  // ========== REALISTIC: Gateway takes time to send webhook (1-10 seconds) ==========
  const gatewayDelay = await randomDelay(gatewayDelayMin, gatewayDelayMax);
  logInfo(`🌐 Gateway took ${gatewayDelay}ms to send webhook...`);

  const { request, response } = payInResult;
  const { merchantReference, paymentMode, customer } = request;
  const amount = request.amount;

  // Detect gateway from intent
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
    PAYU: config.API_PATHS.WEBHOOKS.PAYU,
    CHILLPAY: config.API_PATHS.WEBHOOKS.CHILLPAY,
    SETU: config.API_PATHS.WEBHOOKS.SETU,
    PAYSTACK: config.API_PATHS.WEBHOOKS.PAYSTACK,
    MOLLIE: config.API_PATHS.WEBHOOKS.MOLLIE,
    FLUTTERWAVE: config.API_PATHS.WEBHOOKS.FLUTTERWAVE,
  };

  const webhookUrl = `${config.BASE_URL}${webhookUrls[gateway]}`;

  logInfo(`📨 Sending webhook to: ${webhookUrl}`);

  try {
    const webhookResponse = await axios.post(webhookUrl, webhookPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    logSuccess(`✅ ${gateway} webhook triggered successfully`);
    logInfo(`📊 Response: ${JSON.stringify(webhookResponse.data)}`);

    return {
      gateway,
      status: "SUCCESS",
      success: true,
      gatewayDelay: gatewayDelay,
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
      gatewayDelay: gatewayDelay,
      error: error.message,
    };
  }
}

module.exports = {
  triggerWebhookForPayIn,
  detectGateway,
  getWebhookPayload,
};
