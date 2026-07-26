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
 * Test Default Routing
 * Verifies behavior when no specific gateway is assigned
 */
async function testDefaultRouting() {
  logSection("TEST 4: DEFAULT ROUTING");

  // Merchant 3 has no priorities configured
  const user = {
    email: "piyushkirola@gmail.com",
    password: "12345678",
    merchantId: 3,
  };

  logInfo(`Testing default routing for Merchant ${user.merchantId}`);

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];
    const testModes = ["UPI", "CARD", "WALLET"];

    for (const paymentMode of testModes) {
      logInfo(`\nTesting ${paymentMode} with no priority config...`);

      const amount = randomAmount(100, 5000);
      const customer = randomCustomer();
      const merchantReference = `ORD-DEFAULT-${Date.now()}`;

      try {
        const result = await createPayIn(accessToken, clientSecret, {
          paymentMode,
          amount,
          customer,
          merchantReference,
        });
        // AUTO-TRIGGER WEBHOOK
        await triggerWebhookForPayIn(result, "SUCCESS");

        let actualGateway = "Unknown";
        if (result.response.intent) {
          try {
            const intent = JSON.parse(result.response.intent);
            if (intent.key && intent.key.startsWith("rzp_test")) {
              actualGateway = "Razorpay";
            } else if (intent.key && intent.key.includes("cashfree")) {
              actualGateway = "Cashfree";
            } else if (intent.key && intent.key.includes("adyen")) {
              actualGateway = "Adyen";
            }
          } catch (e) {}
        }

        results.push({
          paymentMode,
          actualGateway,
          status: result.response.status,
          success: true,
          merchantReference,
        });

        logInfo(
          `  ${paymentMode} → ${actualGateway} | Status: ${result.response.status}`,
        );
      } catch (error) {
        logError(`  ${paymentMode} → Failed: ${error.message}`);
        results.push({
          paymentMode,
          success: false,
          error: error.message,
        });
      }
    }

    logSection("DEFAULT ROUTING RESULTS");
    console.log(`Merchant ${user.merchantId}: No priorities configured`);
    console.log(
      `Result: ${results.filter((r) => r.success).length}/${results.length} successful`,
    );
    console.log(
      `Gateways Used: ${results
        .filter((r) => r.success)
        .map((r) => r.actualGateway)
        .join(", ")}`,
    );

    return { results };
  } catch (error) {
    logError(`Default routing test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testDefaultRouting };
