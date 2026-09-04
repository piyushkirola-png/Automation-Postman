const axios = require("axios");
const config = require("../config");
const { logger, logSuccess, logError, logInfo } = require("../utils/logger");

async function simulateCashfreeWebhook(data) {
  return simulateWebhook("CASHFREE", data);
}

async function simulateRazorpayWebhook(data) {
  return simulateWebhook("RAZORPAY", data);
}

async function simulateAdyenWebhook(data) {
  return simulateWebhook("ADYEN", data);
}

async function simulateChargebeeWebhook(data) {
  return simulateWebhook("CHARGEBEE", data);
}

async function simulateBennupayWebhook(data) {
  return simulateWebhook("BENNUPAY", data);
}

async function simulateStripeWebhook(data) {
  return simulateWebhook("STRIPE", data);
}

async function simulatePayUWebhook(data) {
  return simulateWebhook("PAYU", data);
}

async function simulateChillpayWebhook(data) {
  return simulateWebhook("CHILLPAY", data);
}

async function simulateSetuWebhook(data) {
  return simulateWebhook("SETU", data);
}

async function simulatePaystackWebhook(data) {
  return simulateWebhook("PAYSTACK", data);
}

async function simulateMollieWebhook(data) {
  return simulateWebhook("MOLLIE", data);
}

async function simulateFlutterwaveWebhook(data) {
  return simulateWebhook("FLUTTERWAVE", data);
}

async function simulateWebhook(gateway, data) {
  try {
    const paths = {
      CASHFREE: config.API_PATHS.WEBHOOKS.CASHFREE,
      RAZORPAY: config.API_PATHS.WEBHOOKS.RAZORPAY,
      ADYEN: config.API_PATHS.WEBHOOKS.ADYEN,
      CHARGEBEE: config.API_PATHS.WEBHOOKS.CHARGEBEE,
      BENNUPAY: config.API_PATHS.WEBHOOKS.BENNUPAY,
      STRIPE: config.API_PATHS.WEBHOOKS.STRIPE,
      PAYU: config.API_PATHS.WEBHOOKS.PAYU,
      CHILLPAY: config.API_PATHS.WEBHOOKS.CHILLPAY,
      SETU: config.API_PATHS.WEBHOOKS.SETU,
      PAYSTACK: config.API_PATHS.WEBHOOKS.PAYSTACK,
      MOLLIE: config.API_PATHS.WEBHOOKS.MOLLIE,
      FLUTTERWAVE: config.API_PATHS.WEBHOOKS.FLUTTERWAVE,
    };

    const url = `${config.BASE_URL}${paths[gateway]}`;

    logInfo(`Simulating ${gateway} webhook...`);

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    logSuccess(`${gateway} webhook processed`);
    return response.data;
  } catch (error) {
    logError(`${gateway} webhook failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

function getWebhookPayloads(merchantReference, amount, paymentMode, customer) {
  const amountInPaise = Math.round(amount * 100);

  // Cashfree payload (existing)
  const cashfreePayload = {
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: {
      order: {
        order_id: merchantReference,
        order_amount: amount,
        order_currency: "INR",
        order_status: "PAID",
        order_expiry_time: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
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
        bank_reference: Math.random().toString().substr(2, 12),
        utr: Math.random().toString().substr(2, 12),
        acquirer_data: {
          rrn: Math.random().toString().substr(2, 12),
        },
        customer_details: {
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
        },
      },
    },
  };

  // Razorpay payload (existing)
  const razorpayPayload = {
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
          bank: "YES Bank",
          wallet: null,
          vpa: paymentMode === "UPI" ? "test@okhdfcbank" : null,
          email: customer.email,
          contact: customer.phone.replace(/[^0-9]/g, ""),
          notes: {
            merchant_order_id: merchantReference,
          },
          fee: 0,
          tax: 0,
          error_code: null,
          error_description: null,
          error_source: null,
          error_step: null,
          error_reason: null,
          acquirer_data: {
            rrn: Math.random().toString().substr(2, 12),
          },
          created_at: Math.floor(Date.now() / 1000),
          bank_reference: Math.random().toString().substr(2, 12),
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
          offer_id: null,
          status: "paid",
          attempts: 1,
          notes: {
            merchant_order_id: merchantReference,
          },
          created_at: Math.floor(Date.now() / 1000) - 60,
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };

  // Adyen payload (existing)
  const adyenPayload = {
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

  // Chargebee payload (existing)
  const chargebeePayload = {
    event: "payment_success",
    customer: {
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
    },
    transaction: {
      id: `ch_${Math.random().toString(36).substr(2, 10)}`,
      amount: amount,
      currency: "INR",
      status: "success",
      reference_id: merchantReference,
      payment_method: paymentMode.toLowerCase(),
    },
    created_at: new Date().toISOString(),
  };

  // Bennupay payload (existing)
  const bennupayPayload = {
    event: "payment.completed",
    data: {
      transaction_id: `bp_${Math.random().toString(36).substr(2, 10)}`,
      merchant_reference: merchantReference,
      amount: amount,
      currency: "INR",
      status: "SUCCESS",
      payment_mode: paymentMode,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      timestamp: new Date().toISOString(),
    },
  };

  // Stripe payload (existing)
  const stripePayload = {
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

  // PayU payload (existing)
  const payuPayload = {
    txnid: merchantReference,
    mihpayid: `PayU_Transaction_ID_${Math.random().toString(36).substr(2, 10)}`,
    amount: amount.toFixed(2),
    status: "success",
    mode: paymentMode === "CARD" ? "CC" : paymentMode === "UPI" ? "UPI" : "NB",
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

  // ========== NEW GATEWAY PAYLOADS ==========

  // FLUTTERWAVE payload
  const flutterwavePayload = {
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

  // MOLLIE payload
  const molliePayload = {
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

  // PAYSTACK payload
  const paystackPayload = {
    event: "charge.success",
    data: {
      id: Math.floor(Math.random() * 10000000),
      domain: "live",
      status: "success",
      reference: `${merchantReference}_${Date.now()}`,
      amount: amount * 100, // Paystack uses kobo
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

  // CHILLPAY payload
  const chillpayPayload = {
    OrderNo: merchantReference,
    TransactionId: `CHP-TXN-${Math.random().toString(36).substr(2, 15)}`,
    PaymentStatus: "0",
    Amount: amount * 100,
    BankRefCode: `BANK-REF-${Math.random().toString(36).substr(2, 10)}`,
    PaymentChannel: paymentMode === "CARD" ? "CreditCard" : "UPI",
    PaymentDateTime: new Date().toISOString().replace("T", " ").slice(0, 19),
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

  // SETU payload
  const setuPayload = {
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
          transactionId: (Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')).slice(-12),
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

  return {
    cashfree: cashfreePayload,
    razorpay: razorpayPayload,
    adyen: adyenPayload,
    chargebee: chargebeePayload,
    bennupay: bennupayPayload,
    stripe: stripePayload,
    payu: payuPayload,
    flutterwave: flutterwavePayload,
    mollie: molliePayload,
    paystack: paystackPayload,
    chillpay: chillpayPayload,
    setu: setuPayload,
  };
}

module.exports = {
  simulateCashfreeWebhook,
  simulateRazorpayWebhook,
  simulateAdyenWebhook,
  simulateChargebeeWebhook,
  simulateBennupayWebhook,
  simulateStripeWebhook,
  simulatePayUWebhook,
  simulateChillpayWebhook,
  simulateSetuWebhook,
  simulatePaystackWebhook,
  simulateMollieWebhook,
  simulateFlutterwaveWebhook,
  simulateWebhook,
  getWebhookPayloads,
};
