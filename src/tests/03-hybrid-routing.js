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
 * Test Hybrid Routing
 * Verifies when multiple gateways support same payment mode,
 * the highest priority is selected
 */
async function testHybridRouting() {
  logSection("TEST 3: HYBRID ROUTING");

  const user = {
    email: "soniakalonia@gmail.com",
    password: "12345678",
    merchantId: 2,
  };

  logInfo(`Testing hybrid routing for Merchant ${user.merchantId}`);

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];
    const testModes = ["UPI", "CARD", "WALLET"];
    const expectedGatewayMap = {
      UPI: "Cashfree", // Cashfree priority 2, Adyen priority 3
      CARD: "Razorpay", // Razorpay priority 1
      WALLET: "Adyen", // Adyen priority 3 (only one supporting WALLET after Razorpay removed)
    };

    for (const paymentMode of testModes) {
      logInfo(`\nTesting ${paymentMode}...`);

      // Run 3 transactions for each mode
      const modeResults = [];
      for (let i = 0; i < 3; i++) {
        const amount = randomAmount(100, 5000);
        const customer = randomCustomer();
        const merchantReference = `ORD-HYBRID-${Date.now()}-${i}`;

        try {
          const result = await createPayIn(accessToken, clientSecret, {
            paymentMode,
            amount,
            customer,
            merchantReference,
          });
          // ✅ AUTO-TRIGGER WEBHOOK
          await triggerWebhookForPayIn(result, 'SUCCESS');

          let actualGateway = "Unknown";
          if (result.response.intent) {
            try {
              const intent = JSON.parse(result.response.intent);
              if (intent.key && intent.key.startsWith("rzp_test")) {
                actualGateway = "Razorpay";
              } else if (intent.paymentSessionId) {
                actualGateway = "Cashfree";
              } else if (intent.pspReference) {
                actualGateway = "Adyen";
              }
            } catch (e) {}
          }

          const isCorrect = actualGateway === expectedGatewayMap[paymentMode];
          modeResults.push({
            success: true,
            actual: actualGateway,
            expected: expectedGatewayMap[paymentMode],
            passed: isCorrect,
            merchantReference,
          });

          if (isCorrect) {
            logSuccess(`  ✅ ${paymentMode} → ${actualGateway} (PASS)`);
          } else {
            logError(
              `  ❌ ${paymentMode} → Expected: ${expectedGatewayMap[paymentMode]}, Got: ${actualGateway} (FAIL)`,
            );
          }
        } catch (error) {
          logError(`  ❌ ${paymentMode} → Error: ${error.message}`);
          modeResults.push({
            success: false,
            expected: expectedGatewayMap[paymentMode],
            passed: false,
            error: error.message,
          });
        }
      }

      results.push({
        paymentMode,
        expected: expectedGatewayMap[paymentMode],
        results: modeResults,
      });
    }

    // Summary
    logSection("HYBRID ROUTING SUMMARY");
    let total = 0,
      passed = 0;
    for (const mode of results) {
      console.log(`\n${mode.paymentMode} (Expected: ${mode.expected}):`);
      for (const r of mode.results) {
        const status = r.passed ? "✅ PASS" : "❌ FAIL";
        console.log(`  ${r.actual || "ERROR"} → ${status}`);
        total++;
        if (r.passed) passed++;
      }
    }

    console.log(
      `\n📊 Total: ${total} | Passed: ${passed} | Failed: ${total - passed}`,
    );

    return { results, total, passed };
  } catch (error) {
    logError(`Hybrid routing test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testHybridRouting };
