const axios = require('axios');
const config = require('../config');
const { logger, logSuccess, logError, logInfo } = require('../utils/logger');

/**
 * Simulate Cashfree webhook
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateCashfreeWebhook(data) {
  return simulateWebhook('CASHFREE', data);
}

/**
 * Simulate Razorpay webhook
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateRazorpayWebhook(data) {
  return simulateWebhook('RAZORPAY', data);
}

/**
 * Simulate Adyen webhook
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateAdyenWebhook(data) {
  return simulateWebhook('ADYEN', data);
}

/**
 * Simulate Chargebee webhook
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateChargebeeWebhook(data) {
  return simulateWebhook('CHARGEBEE', data);
}

/**
 * Simulate Bennupay webhook
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateBennupayWebhook(data) {
  return simulateWebhook('BENNUPAY', data);
}

/**
 * Simulate any webhook
 * @param {string} gateway - 'CASHFREE', 'RAZORPAY', 'ADYEN','CHARGEBEE','BENNUPAY'
 * @param {object} data - Webhook payload
 * @returns {Promise<object>}
 */
async function simulateWebhook(gateway, data) {
  try {
    const paths = {
      CASHFREE: config.API_PATHS.WEBHOOKS.CASHFREE,
      RAZORPAY: config.API_PATHS.WEBHOOKS.RAZORPAY,
      ADYEN: config.API_PATHS.WEBHOOKS.ADYEN,
      CHARGEBEE: config.API_PATHS.WEBHOOKS.CHARGEBEE,
      BENNUPAY: config.API_PATHS.WEBHOOKS.BENNUPAY
    };

    const url = `${config.BASE_URL}${paths[gateway]}`;

    logInfo(`Simulating ${gateway} webhook...`);

    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
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

/**
 * Get sample webhook payloads
 * @param {string} merchantReference - The merchant reference
 * @param {number} amount - Payment amount
 * @param {string} paymentMode - Payment mode
 * @param {object} customer - Customer details
 * @returns {object}
 */
function getWebhookPayloads(merchantReference, amount, paymentMode, customer) {
  const amountInPaise = Math.round(amount * 100);

  // Cashfree payload
  const cashfreePayload = {
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: merchantReference,
        order_amount: amount,
        order_currency: 'INR',
        order_status: 'PAID',
        order_expiry_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        order_note: `Payment for order ${merchantReference}`,
        created_at: new Date().toISOString()
      },
      payment: {
        payment_id: `pay_${Math.random().toString(36).substr(2, 10)}`,
        order_id: merchantReference,
        payment_amount: amount,
        payment_status: 'SUCCESS',
        payment_method: paymentMode,
        payment_time: new Date().toISOString(),
        bank_reference: Math.random().toString().substr(2, 12),
        utr: Math.random().toString().substr(2, 12),
        acquirer_data: {
          rrn: Math.random().toString().substr(2, 12)
        },
        customer_details: {
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone
        }
      }
    }
  };

  // Razorpay payload
  const razorpayPayload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: `pay_${Math.random().toString(36).substr(2, 10)}`,
          entity: 'payment',
          amount: amountInPaise,
          currency: 'INR',
          status: 'captured',
          order_id: `order_${Math.random().toString(36).substr(2, 10)}`,
          invoice_id: null,
          international: false,
          method: paymentMode.toLowerCase(),
          amount_refunded: 0,
          refund_status: null,
          captured: true,
          description: `Payment for ${merchantReference}`,
          card_id: null,
          bank: 'YES Bank',
          wallet: null,
          vpa: paymentMode === 'UPI' ? 'test@okhdfcbank' : null,
          email: customer.email,
          contact: customer.phone.replace(/[^0-9]/g, ''),
          notes: {
            merchant_order_id: merchantReference
          },
          fee: 0,
          tax: 0,
          error_code: null,
          error_description: null,
          error_source: null,
          error_step: null,
          error_reason: null,
          acquirer_data: {
            rrn: Math.random().toString().substr(2, 12)
          },
          created_at: Math.floor(Date.now() / 1000),
          bank_reference: Math.random().toString().substr(2, 12)
        }
      },
      order: {
        entity: {
          id: `order_${Math.random().toString(36).substr(2, 10)}`,
          entity: 'order',
          amount: amountInPaise,
          amount_paid: amountInPaise,
          amount_due: 0,
          currency: 'INR',
          receipt: merchantReference,
          offer_id: null,
          status: 'paid',
          attempts: 1,
          notes: {
            merchant_order_id: merchantReference
          },
          created_at: Math.floor(Date.now() / 1000) - 60
        }
      }
    },
    created_at: Math.floor(Date.now() / 1000)
  };

  // Adyen payload
  const adyenPayload = {
    live: 'false',
    notificationItems: [
      {
        NotificationRequestItem: {
          additionalData: {
            authCode: Math.random().toString().substr(2, 6),
            avsResult: '0',
            cvcResult: '0',
            responseCode: '0000',
            totalFraudScore: '0'
          },
          amount: {
            currency: 'INR',
            value: amountInPaise
          },
          eventCode: 'AUTHORISATION',
          eventDate: new Date().toISOString(),
          merchantAccountCode: 'HlleoCOM',
          merchantReference: merchantReference,
          paymentMethod: paymentMode.toLowerCase(),
          pspReference: `AYDEN_PSP_REF_${Math.random().toString(36).substr(2, 10)}`,
          reason: '0000:Authorised',
          success: 'true'
        }
      }
    ]
  };

  // Chargebee payload
  const chargebeePayload = {
    event: 'payment_success',
    customer: {
      email: customer.email,
      name: customer.name,
      phone: customer.phone
    },
    transaction: {
      id: `ch_${Math.random().toString(36).substr(2, 10)}`,
      amount: amount,
      currency: 'INR',
      status: 'success',
      reference_id: merchantReference,
      payment_method: paymentMode.toLowerCase()
    },
    created_at: new Date().toISOString()
  };

  // Bennupay payload
  const bennupayPayload = {
    event: 'payment.completed',
    data: {
      transaction_id: `bp_${Math.random().toString(36).substr(2, 10)}`,
      merchant_reference: merchantReference,
      amount: amount,
      currency: 'INR',
      status: 'SUCCESS',
      payment_mode: paymentMode,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      },
      timestamp: new Date().toISOString()
    }
  };

  return {
    cashfree: cashfreePayload,
    razorpay: razorpayPayload,
    adyen: adyenPayload,
    chargebee: chargebeePayload,
    bennupay: bennupayPayload
  };
}

module.exports = {
  simulateCashfreeWebhook,
  simulateRazorpayWebhook,
  simulateAdyenWebhook,
  simulateChargebeeWebhook,
  simulateBennupayWebhook,
  simulateWebhook,
  getWebhookPayloads
};