const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const { randomAmount, randomCustomer } = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
  logWarning,
} = require("../utils/logger");
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");

/**
 * Test PENDING and FAILED Transaction Statuses
 */
async function testMixedStatus() {
  logSection("TEST 9: PENDING & FAILED TRANSACTION STATUSES");

  const user = {
    email: "amanpandey@gmail.com",
    password: "12345678",
    merchantId: 1,
  };

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];

    // Test cases for PENDING and FAILED statuses only
    const testCases = [
      {
        status: "FAILED",
        description: "Failed Payment",
        paymentMode: "UPI",
      },
      {
        status: "PENDING",
        description: "Pending Payment",
        paymentMode: "WALLET",
      },
    ];

    for (const testCase of testCases) {
      logInfo(
        `\nTesting ${testCase.status}: ${testCase.description} (${testCase.paymentMode})`,
      );

      const amount = randomAmount(100, 5000);
      const customer = randomCustomer();
      const merchantReference = `ORD-${testCase.status}-${Date.now()}`;

      try {
        // Create pay-in with specific payment mode that has gateway
        const payInResult = await createPayIn(accessToken, clientSecret, {
          amount,
          paymentMode: testCase.paymentMode,
          customer,
          merchantReference,
        });

        logInfo(`  Transaction ID: ${payInResult.response.id}`);
        logInfo(`  Status: ${payInResult.response.status}`);

        // Trigger webhook with appropriate status
        const webhookResult = await triggerWebhookForPayIn(
          payInResult,
          testCase.status,
        );

        if (testCase.status === "PENDING") {
          // Pending should NOT trigger webhook
          if (webhookResult && !webhookResult.webhookTriggered) {
            logSuccess(`  ✅ PENDING correctly skipped webhook trigger`);
            results.push({
              status: testCase.status,
              paymentMode: testCase.paymentMode,
              transactionId: payInResult.response.id,
              webhookTriggered: false,
              passed: true,
              reason: "Webhook correctly skipped for pending transaction",
            });
          } else {
            logError(`  ❌ PENDING incorrectly triggered webhook`);
            results.push({
              status: testCase.status,
              paymentMode: testCase.paymentMode,
              transactionId: payInResult.response.id,
              webhookTriggered: true,
              passed: false,
              error: "Webhook should not trigger for pending",
            });
          }
        } else if (testCase.status === "FAILED") {
          // FAILED should trigger webhook
          if (webhookResult && webhookResult.success) {
            logSuccess(`  ✅ FAILED webhook triggered successfully`);
            results.push({
              status: testCase.status,
              paymentMode: testCase.paymentMode,
              transactionId: payInResult.response.id,
              webhookTriggered: true,
              webhookSuccess: true,
              passed: true,
            });
          } else {
            logError(`  ❌ FAILED webhook failed`);
            results.push({
              status: testCase.status,
              paymentMode: testCase.paymentMode,
              transactionId: payInResult.response.id,
              webhookTriggered: true,
              webhookSuccess: false,
              passed: false,
              error: webhookResult?.error || "Webhook failed",
            });
          }
        }
      } catch (error) {
        logError(`  ❌ Error: ${error.message}`);
        if (error.response) {
          logError(`  Response: ${JSON.stringify(error.response.data)}`);
        }
        results.push({
          status: testCase.status,
          paymentMode: testCase.paymentMode,
          success: false,
          passed: false,
          error: error.message,
        });
      }
    }

    // Summary
    logSection("PENDING & FAILED STATUS RESULTS");
    const passed = results.filter((r) => r.passed).length;
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${results.length - passed}`);

    // Show details
    results.forEach((r) => {
      const status = r.passed ? "✅" : "❌";
      console.log(
        `${status} ${r.status} (${r.paymentMode}): ${r.passed ? "PASSED" : r.error || "FAILED"}`,
      );
    });

    return { results, passed, total: results.length };
  } catch (error) {
    logError(`Mixed status test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testMixedStatus };
