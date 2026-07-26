const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const {
  randomPaymentMode,
  randomAmount,
  randomCustomer,
} = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
  logWarning,
} = require("../utils/logger");
const routingConfig = require("../config/routing");
const { isRoutingCorrect } = require("../validators/response");
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");

/**
 * Test Priority Routing
 * Verifies that gateway selection follows priority order
 */
async function testPriorityRouting() {
  logSection("TEST 1: PRIORITY ROUTING");

  const users = [
    { email: "amanpandey@gmail.com", password: "12345678", merchantId: 1 },
    { email: "soniakalonia@gmail.com", password: "12345678", merchantId: 2 },
    { email: "piyushkirola@gmail.com", password: "12345678", merchantId: 3 },
  ];

  const results = [];
  const allPaymentModes = ["UPI", "CARD", "WALLET", "NETBANKING"];

  for (const user of users) {
    logInfo(`\nTesting Merchant ${user.merchantId} (${user.email})`);

    try {
      // Login
      const loginData = await loginUser(user.email, user.password);
      const { accessToken, clientSecret } = loginData;

      const merchantResults = [];

      // Test each payment mode
      for (const paymentMode of allPaymentModes) {
        const expected =
          routingConfig[user.merchantId]?.expectedGateway?.[paymentMode];

        if (!expected) {
          logWarning(
            `No expected gateway for ${paymentMode} on Merchant ${user.merchantId}`,
          );
          merchantResults.push({
            paymentMode,
            expected: null,
            actual: null,
            passed: true,
            reason: "No routing expected",
          });
          continue;
        }

        try {
          // Create pay-in with specific payment mode
          const amount = randomAmount(100, 5000);
          const customer = randomCustomer();
          const merchantReference = `ORD-PRIORITY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          const result = await createPayIn(accessToken, clientSecret, {
            paymentMode,
            amount,
            customer,
            merchantReference,
          });
          const webhookResult = await triggerWebhookForPayIn(result, "SUCCESS");

          const isCorrect = isRoutingCorrect(
            result.response,
            expected.gatewayId,
          );

          merchantResults.push({
            paymentMode,
            expected: expected.name,
            actual: isCorrect ? expected.name : "Unknown",
            passed: isCorrect,
            transactionId: result.response.id,
            merchantReference: result.request.merchantReference,
          });

          if (isCorrect) {
            logSuccess(`${paymentMode} → ${expected.name} (PASS)`);
          } else {
            logError(`${paymentMode} → Expected: ${expected.name} (FAIL)`);
          }
        } catch (error) {
          logError(`${paymentMode} → Error: ${error.message}`);
          merchantResults.push({
            paymentMode,
            expected: expected.name,
            actual: "ERROR",
            passed: false,
            error: error.message,
          });
        }
      }

      results.push({
        merchantId: user.merchantId,
        email: user.email,
        results: merchantResults,
      });
    } catch (error) {
      logError(`Failed to test merchant ${user.merchantId}: ${error.message}`);
    }
  }

  // Summary
  logSection("PRIORITY ROUTING SUMMARY");
  let total = 0,
    passed = 0;

  for (const merchant of results) {
    console.log(`\nMerchant ${merchant.merchantId} (${merchant.email}):`);
    for (const r of merchant.results) {
      const status = r.passed ? "PASS" : "FAIL";
      console.log(`  ${r.paymentMode} → ${r.expected || "N/A"} → ${status}`);
      total++;
      if (r.passed) passed++;
    }
  }

  console.log(
    `\nTotal: ${total} | Passed: ${passed} | Failed: ${total - passed}`,
  );
  console.log(`Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);

  return { results, total, passed, failed: total - passed };
}

module.exports = { testPriorityRouting };
