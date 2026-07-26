const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
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
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");

/**
 * Test Retry Logic
 * Verifies retry mechanism works correctly
 */
async function testRetryLogic() {
  logSection("TEST 5: RETRY LOGIC");

  const user = {
    email: "amanpandey@gmail.com",
    password: "12345678",
    merchantId: 1,
  };

  logInfo(`Testing retry logic for Merchant ${user.merchantId}`);

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];

    // Create multiple transactions and check retry behavior
    for (let i = 0; i < 5; i++) {
      const amount = randomAmount(100, 5000);
      const customer = randomCustomer();
      const paymentMode = randomPaymentMode();
      const merchantReference = `ORD-RETRY-${Date.now()}-${i}`;

      try {
        const result = await createPayIn(accessToken, clientSecret, {
          paymentMode,
          amount,
          customer,
          merchantReference,
        });
        // ✅ AUTO-TRIGGER WEBHOOK
        await triggerWebhookForPayIn(result, "SUCCESS");

        // Check if retryCount exists in response
        const retryCount = result.response.retryCount || 0;
        const maxRetries = result.response.maxRetries || 3;

        results.push({
          transaction: i + 1,
          merchantReference,
          status: result.response.status,
          retryCount,
          maxRetries,
          success: true,
        });

        logInfo(
          `  Txn ${i + 1}: Status: ${result.response.status}, Retries: ${retryCount}/${maxRetries}`,
        );
      } catch (error) {
        logError(`  Txn ${i + 1}: Failed - ${error.message}`);
        results.push({
          transaction: i + 1,
          success: false,
          error: error.message,
        });
      }
    }

    logSection("RETRY LOGIC RESULTS");
    const successful = results.filter((r) => r.success);
    console.log(`Total Transactions: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${results.length - successful.length}`);

    if (successful.length > 0) {
      const avgRetries =
        successful.reduce((sum, r) => sum + r.retryCount, 0) /
        successful.length;
      console.log(`Average Retry Count: ${avgRetries.toFixed(1)}`);
      console.log(`Max Retries Limit: ${successful[0].maxRetries}`);
    }

    return { results };
  } catch (error) {
    logError(`Retry logic test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testRetryLogic };
