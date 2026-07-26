const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const {
  simulateCashfreeWebhook,
  simulateRazorpayWebhook,
  simulateAdyenWebhook,
  getWebhookPayloads,
} = require("../api/webhook");
const {
  randomAmount,
  randomCustomer,
  randomPaymentMode,
} = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
} = require("../utils/logger");

/**
 * Test Webhook Processing
 * Verifies webhooks are processed correctly for each gateway
 */
async function testWebhookProcessing() {
  logSection("TEST 7: WEBHOOK PROCESSING");

  const user = {
    email: "amanpandey@gmail.com",
    password: "12345678",
    merchantId: 1,
  };

  logInfo(`Testing webhook processing for Merchant ${user.merchantId}`);

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];

    // Create a real pay-in request
    const amount = randomAmount(100, 5000);
    const customer = randomCustomer();
    const paymentMode = randomPaymentMode();
    const merchantReference = `ORD-WEBHOOK-${Date.now()}`;

    logInfo(`Creating pay-in: ${merchantReference}`);

    const payInResult = await createPayIn(accessToken, clientSecret, {
      amount,
      paymentMode,
      customer,
      merchantReference,
    });

    const transactionId = payInResult.response.id;
    logInfo(`Transaction ID: ${transactionId}`);

    // Get webhook payloads
    const webhookPayloads = getWebhookPayloads(
      merchantReference,
      amount,
      paymentMode,
      customer,
    );

    // Test each webhook
    const webhookTests = [
      {
        name: "Cashfree",
        payload: webhookPayloads.cashfree,
        simulate: simulateCashfreeWebhook,
      },
      {
        name: "Razorpay",
        payload: webhookPayloads.razorpay,
        simulate: simulateRazorpayWebhook,
      },
      {
        name: "Adyen",
        payload: webhookPayloads.adyen,
        simulate: simulateAdyenWebhook,
      },
    ];

    for (const test of webhookTests) {
      logInfo(`\n📨 Testing ${test.name} webhook...`);

      try {
        const result = await test.simulate(test.payload);

        // Check response
        const isSuccess =
          result && (result.success || result.processed || !result.error);

        results.push({
          gateway: test.name,
          merchantReference,
          transactionId,
          processed: isSuccess,
          response: result,
        });

        if (isSuccess) {
          logSuccess(`  ✅ ${test.name} webhook processed successfully`);
        } else {
          logError(`  ❌ ${test.name} webhook failed`);
        }
      } catch (error) {
        logError(`  ❌ ${test.name} webhook error: ${error.message}`);
        results.push({
          gateway: test.name,
          merchantReference,
          transactionId,
          processed: false,
          error: error.message,
        });
      }
    }

    logSection("WEBHOOK PROCESSING RESULTS");
    const passed = results.filter((r) => r.processed).length;
    console.log(`Total Webhooks: ${results.length}`);
    console.log(`Processed Successfully: ${passed}`);
    console.log(`Failed: ${results.length - passed}`);

    return { results, passed, total: results.length };
  } catch (error) {
    logError(`Webhook processing test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testWebhookProcessing };
