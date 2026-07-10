// utils/webhook-trigger.js
const axios = require('axios');
const config = require('../config');
const { logInfo, logSuccess, logError } = require('./logger');

/**
 * Detect which gateway was used based on response data
 */
function detectGateway(response) {
  if (!response) return null;

  // Check gatewayId FIRST (most reliable)
  if (response.gatewayId) {
    const gatewayMap = {
      1: 'RAZORPAY',
      2: 'CASHFREE',
      3: 'ADYEN',
      4: 'CHARGEBEE',
      5: 'BENNUPAY'
    };
    return gatewayMap[response.gatewayId] || null;
  }

  // Check intent for gateway identification
  if (response.intent) {
    try {
      // 🔥 FIX: Check if intent is a URL string first
      const intentString = typeof response.intent === 'string'
        ? response.intent
        : JSON.stringify(response.intent);

      // 🔥 CHARGEBEE DETECTION: URL contains chargebee.com
      if (intentString.includes('chargebee.com') ||
        intentString.includes('chargebee') ||
        intentString.includes('invoice_id=')) {
        return 'CHARGEBEE';
      }

      // 🔥 BENNUPAY DETECTION: Check for Bennupay patterns
      // Based on your Bennupay payload structure
      if (intentString.includes('bennupay') ||
        intentString.includes('bp_') ||
        intentString.includes('mock_')) {
        return 'BENNUPAY';
      }

      // Try to parse as JSON for other gateways
      let parsedIntent = null;
      try {
        parsedIntent = typeof response.intent === 'string'
          ? JSON.parse(response.intent)
          : response.intent;
      } catch (e) {
        // Not JSON, continue with string checks
      }

      if (parsedIntent) {
        // Razorpay: has 'key' starting with rzp_test
        if (parsedIntent.key && parsedIntent.key.startsWith('rzp_test')) {
          return 'RAZORPAY';
        }

        // Cashfree: has paymentSessionId
        if (parsedIntent.paymentSessionId) {
          return 'CASHFREE';
        }

        // Adyen: has pspReference or sessionId starting with CS
        if (parsedIntent.pspReference ||
          (parsedIntent.sessionId && parsedIntent.sessionId.startsWith('CS'))) {
          return 'ADYEN';
        }

        // ChargeBee: Check for ChargeBee specific fields
        if (parsedIntent.chargebee_id ||
          parsedIntent.cb_token ||
          parsedIntent.chargebee_session) {
          return 'CHARGEBEE';
        }

        // Bennupay: Check for Bennupay specific fields
        if (parsedIntent.bennupay_token ||
          parsedIntent.bp_session ||
          parsedIntent.bennupay_id) {
          return 'BENNUPAY';
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Check gatewayName field
  if (response.gatewayName) {
    const name = response.gatewayName.toUpperCase();
    if (name.includes('RAZORPAY')) return 'RAZORPAY';
    if (name.includes('CASHFREE')) return 'CASHFREE';
    if (name.includes('ADYEN')) return 'ADYEN';
    if (name.includes('CHARGEBEE')) return 'CHARGEBEE';
    if (name.includes('BENNUPAY')) return 'BENNUPAY';
  }

  return null;
}

/**
 * Get webhook payload for specific gateway
 */
function getWebhookPayload(gateway, merchantReference, amount, paymentMode, customer, status = 'SUCCESS') {
  const amountInPaise = Math.round(amount * 100);

  switch (gateway) {
    case 'RAZORPAY':
      return {
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
              method: paymentMode.toLowerCase(),
              captured: true,
              email: customer.email,
              contact: customer.phone.replace(/[^0-9]/g, ''),
              notes: {
                merchantReference: merchantReference
              },
              created_at: Math.floor(Date.now() / 1000)
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
              status: 'paid',
              attempts: 1,
              created_at: Math.floor(Date.now() / 1000) - 60
            }
          }
        },
        created_at: Math.floor(Date.now() / 1000)
      };

    case 'CASHFREE':
      return {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: {
            order_id: merchantReference,
            order_amount: amount,
            order_currency: 'INR',
            order_status: 'PAID',
            created_at: new Date().toISOString()
          },
          payment: {
            payment_id: `pay_${Math.random().toString(36).substr(2, 10)}`,
            order_id: merchantReference,
            payment_amount: amount,
            payment_status: 'SUCCESS',
            payment_method: paymentMode,
            payment_time: new Date().toISOString(),
            customer_details: {
              customer_name: customer.name,
              customer_email: customer.email,
              customer_phone: customer.phone
            }
          }
        }
      };

    case 'ADYEN':
      return {
        live: 'false',
        notificationItems: [{
          NotificationRequestItem: {
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
        }]
      };

    case 'CHARGEBEE':
      // 🔥 UPDATED: Match your actual Chargebee webhook format
      return {
        event_type: 'payment_succeeded',
        content: {
          payment: {
            id: `pay_${Math.random().toString(36).substr(2, 10)}`,
            status: 'success',
            amount: amountInPaise,
            currency_code: 'INR',
            reference_number: merchantReference,
            payment_method: {
              card: {
                last4: '1111',
                card_type: 'VISA'
              }
            },
            date: Math.floor(Date.now() / 1000),
            authorization_id: `auth_${Math.random().toString(36).substr(2, 10)}`,
            gateway: {
              reference_id: `txn_${Math.random().toString(36).substr(2, 10)}`
            }
          },
          invoice: {
            id: merchantReference,
            status: 'paid',
            amount: amountInPaise,
            paid_at: Math.floor(Date.now() / 1000)
          },
          customer: {
            id: `cust_${Math.random().toString(36).substr(2, 10)}`,
            email: customer.email
          }
        },
        webhook: {
          id: `webhook_${Math.random().toString(36).substr(2, 10)}`,
          webhook_status: 'sent'
        }
      };

    case 'BENNUPAY':
      // 🔥 UPDATED: Match your actual Bennupay webhook format
      return {
        id: `mock_${Date.now()}`,
        status: 'paid',
        reference: merchantReference,
        client: {
          email: customer.email,
          full_name: customer.name,
          phone: customer.phone
        },
        purchase: {
          total: amountInPaise,
          currency: 'INR'
        },
        transaction_data: {
          payment_method: paymentMode
        },
        payment: {
          remote_paid_on: new Date().toISOString()
        },
        is_test: true,
        status_history: [
          {
            status: 'created',
            timestamp: new Date(Date.now() - 60000).toISOString()
          },
          {
            status: 'paid',
            timestamp: new Date().toISOString()
          }
        ]
      };

    default:
      return null;
  }
}

/**
 * Trigger webhook for a pay-in
 */
async function triggerWebhookForPayIn(payInResult, forceStatus = null) {
  const { request, response } = payInResult;
  const { merchantReference, paymentMode, customer } = request;
  const amount = request.amount;

  // Detect gateway
  const gateway = detectGateway(response);

  if (!gateway) {
    logError(`❌ Could not detect gateway for ${merchantReference}`);
    return null;
  }

  logInfo(`🔄 Triggering ${gateway} webhook for ${merchantReference}...`);

  // Get webhook payload
  const webhookPayload = getWebhookPayload(
    gateway,
    merchantReference,
    amount,
    paymentMode,
    customer,
    forceStatus || 'SUCCESS'
  );

  if (!webhookPayload) {
    logError(`❌ No webhook payload for ${gateway}`);
    return null;
  }

  // Get webhook URL - Using config paths
  const webhookUrls = {
    RAZORPAY: config.API_PATHS.WEBHOOKS.RAZORPAY,
    CASHFREE: config.API_PATHS.WEBHOOKS.CASHFREE,
    ADYEN: config.API_PATHS.WEBHOOKS.ADYEN,
    CHARGEBEE: config.API_PATHS.WEBHOOKS.CHARGEBEE,  // 🔥 Use config
    BENNUPAY: config.API_PATHS.WEBHOOKS.BENNUPAY     // 🔥 Use config
  };

  const webhookUrl = `${config.BASE_URL}${webhookUrls[gateway]}`;

  logInfo(`📨 Sending webhook to: ${webhookUrl}`);

  try {
    const webhookResponse = await axios.post(webhookUrl, webhookPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    logSuccess(`✅ ${gateway} webhook triggered successfully`);
    logInfo(`📊 Response: ${JSON.stringify(webhookResponse.data)}`);

    return {
      gateway,
      status: 'SUCCESS',
      success: true,
      response: webhookResponse.data
    };
  } catch (error) {
    logError(`❌ Webhook failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    return {
      gateway,
      status: 'FAILED',
      success: false,
      error: error.message
    };
  }
}

module.exports = { triggerWebhookForPayIn, detectGateway, getWebhookPayload };