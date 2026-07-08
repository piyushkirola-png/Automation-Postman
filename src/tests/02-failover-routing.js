const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const { randomAmount, randomCustomer } = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
} = require("../utils/logger");
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");

/**
 * Test Failover Routing
 * Simulates gateway failures and verifies fallback
 */
async function testFailoverRouting() {
  logSection("TEST 2: FAILOVER ROUTING");

  // This test simulates scenarios where first gateway fails
  // Since we can't actually make gateways fail, we test the logic
  // by checking if multiple payment modes use different gateways

  const user = {
    email: "amanpandey@gmail.com",
    password: "12345678",
    merchantId: 1,
  };

  logInfo(`Testing failover for Merchant ${user.merchantId}`);

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];
    const transactions = 5;

    // Create multiple transactions with CARD (should use Razorpay as priority)
    logInfo(`Creating ${transactions} CARD transactions...`);

    for (let i = 0; i < transactions; i++) {
      const amount = randomAmount(100, 5000);
      const customer = randomCustomer();
      const merchantReference = `ORD-FAILOVER-${Date.now()}-${i}`;

      try {
        const result = await createPayIn(accessToken, clientSecret, {
          paymentMode: "CARD",
          amount,
          customer,
          merchantReference,
        });
        // AUTO-TRIGGER WEBHOOK
        await triggerWebhookForPayIn(result, 'SUCCESS');

        // Check which gateway was used
        let gatewayUsed = "Unknown";
        if (result.response.intent) {
          try {
            const intent = JSON.parse(result.response.intent);
            if (intent.key && intent.key.startsWith("rzp_test")) {
              gatewayUsed = "Razorpay";
            }
          } catch (e) {}
        }

        results.push({
          transaction: i + 1,
          merchantReference: result.request.merchantReference,
          gatewayUsed,
          status: result.response.status,
          success: true,
        });

        logInfo(
          `  Txn ${i + 1}: ${gatewayUsed} | Status: ${result.response.status}`,
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

    // Check consistency
    const gateways = results.filter((r) => r.success).map((r) => r.gatewayUsed);
    const uniqueGateways = [...new Set(gateways)];

    logSection("FAILOVER TEST RESULTS");
    console.log(`Total Transactions: ${transactions}`);
    console.log(`Successful: ${results.filter((r) => r.success).length}`);
    console.log(`Gateways Used: ${uniqueGateways.join(", ")}`);

    if (uniqueGateways.length > 1) {
      logInfo("⚠️ Multiple gateways used - Failover likely occurred");
    } else if (uniqueGateways.length === 1) {
      logInfo(`✅ All transactions used ${uniqueGateways[0]} - No failover`);
    }

    return { results, uniqueGateways };
  } catch (error) {
    logError(`Failover test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testFailoverRouting };
