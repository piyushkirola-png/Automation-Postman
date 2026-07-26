const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");
const { randomAmount, randomCustomer } = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
  logWarning,
} = require("../utils/logger");
const usersConfig = require("../config/users");
const {
  getRoutingConfig,
  buildMerchantConfig,
  closeDbConnection,
} = require("../config/db");

// ============== CONFIGURATION ==============
const ALLOWED_GATEWAYS = [9, 10];
const ALL_PAYMENT_MODES = ["UPI", "CARD", "WALLET", "NETBANKING"];
const ITERATIONS_PER_MODE = parseInt(process.env.ITERATIONS_PER_MODE) || 5;
const MIN_AMOUNT = parseInt(process.env.MIN_AMOUNT) || 100;
const MAX_AMOUNT = parseInt(process.env.MAX_AMOUNT) || 1000;

// Merchants 11-17
const MERCHANT_IDS = [11, 12, 13, 14, 15, 16, 17];

/**
 * Get random amount
 */
function randomAmountInRange(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/**
 * Get user credentials for a merchant
 */
function getUserForMerchant(merchantId) {
  for (const [key, user] of Object.entries(usersConfig.users)) {
    if (user.merchantId === merchantId) {
      return {
        email: user.email,
        password: "12345678",
        userId: user.id,
        merchantId: user.merchantId,
        name: user.name,
      };
    }
  }
  return null;
}

/**
 * Detect gateway from pay-in response
 */
function detectGatewayFromResponse(response) {
  if (!response) return null;

  // 1. Check gatewayId
  if (response.gatewayId) {
    const gatewayMap = {
      9: "Stripe",
      10: "PayU",
    };
    return gatewayMap[response.gatewayId] || null;
  }

  // 2. Check intent field
  if (response.intent) {
    try {
      const intent =
        typeof response.intent === "string"
          ? JSON.parse(response.intent)
          : response.intent;

      // Stripe detection
      if (
        intent.client_secret ||
        intent.payment_intent ||
        intent.publishableKey ||
        intent.stripe_id
      ) {
        return "Stripe";
      }

      // PayU detection
      if (
        intent.txnid ||
        intent.mihpayid ||
        intent.payu_id ||
        intent.payu_token
      ) {
        return "PayU";
      }
    } catch (e) {}
  }

  // 3. Check gatewayName
  if (response.gatewayName) {
    const name = response.gatewayName.toUpperCase();
    if (name.includes("STRIPE")) return "Stripe";
    if (name.includes("PAYU")) return "PayU";
  }

  return null;
}

/**
 * Test a single merchant
 */
async function testMerchant(merchantConfig) {
  const { merchantId, merchantName, routingStrategy, paymentModeMap } =
    merchantConfig;

  logSection(
    `🧪 TESTING MERCHANT ${merchantId}: ${merchantName} (${routingStrategy})`,
  );

  // Get user credentials
  const user = getUserForMerchant(merchantId);
  if (!user) {
    logError(`❌ No user found for merchant ${merchantId}`);
    return {
      merchantId,
      merchantName,
      routingStrategy,
      error: "No user found",
      results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    };
  }

  logInfo(`👤 User: ${user.name} (${user.email})`);

  let loginData;
  try {
    loginData = await loginUser(user.email, user.password);
  } catch (error) {
    logError(`❌ Login failed: ${error.message}`);
    return {
      merchantId,
      merchantName,
      routingStrategy,
      error: `Login failed: ${error.message}`,
      results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    };
  }

  const { accessToken, clientSecret } = loginData;
  logSuccess(`✅ Logged in as ${user.email}`);

  const allResults = [];
  let total = 0,
    passed = 0,
    failed = 0,
    skipped = 0;

  // Test each payment mode
  for (const paymentMode of ALL_PAYMENT_MODES) {
    const expected = paymentModeMap[paymentMode];

    // Check if this payment mode is mapped to Stripe or PayU
    if (!expected || !ALLOWED_GATEWAYS.includes(expected.gatewayId)) {
      logWarning(
        `⚠️ SKIPPING ${paymentMode} - Not configured for Stripe or PayU`,
      );

      const skipResult = {
        paymentMode,
        expectedGateway: expected ? expected.gatewayName : "N/A",
        expectedGatewayId: expected ? expected.gatewayId : null,
        status: "SKIPPED",
        reason: "Not configured for Stripe or PayU",
        transactions: [],
      };
      allResults.push(skipResult);
      skipped++;
      continue;
    }

    logInfo(
      `\n🔄 Testing ${paymentMode} → Expected: ${expected.gatewayName} (Priority ${expected.priority})`,
    );

    const modeResults = [];
    const promises = [];

    // Create all pay-ins in parallel
    for (let i = 0; i < ITERATIONS_PER_MODE; i++) {
      const amount = randomAmountInRange(MIN_AMOUNT, MAX_AMOUNT);
      const customer = randomCustomer();
      const merchantReference = `ORD-SP-${merchantId}-${paymentMode}-${Date.now()}-${i}`;

      const promise = createPayIn(accessToken, clientSecret, {
        paymentMode,
        amount,
        customer,
        merchantReference,
      })
        .then(async (payInResult) => {
          // Trigger webhook
          logInfo(`🔄 Triggering webhook for ${merchantReference}...`);

          try {
            const webhookResult = await triggerWebhookForPayIn(
              payInResult,
              "SUCCESS",
            );
            logInfo(
              `✅ Webhook triggered: ${webhookResult ? "Success" : "Failed"}`,
            );
          } catch (webhookError) {
            logError(`❌ Webhook failed: ${webhookError.message}`);
          }

          // Detect gateway from response
          let gatewayName = detectGatewayFromResponse(payInResult.response);

          // Fallback to detecting from intent
          if (!gatewayName && payInResult.response.intent) {
            try {
              const intent =
                typeof payInResult.response.intent === "string"
                  ? JSON.parse(payInResult.response.intent)
                  : payInResult.response.intent;
              if (intent.client_secret || intent.payment_intent) {
                gatewayName = "Stripe";
              } else if (intent.txnid || intent.mihpayid) {
                gatewayName = "PayU";
              }
            } catch (e) {}
          }

          logInfo(
            `📍 Detected: ${gatewayName || "Unknown"} | Expected: ${expected.gatewayName}`,
          );

          const isCorrect = gatewayName === expected.gatewayName;

          return {
            success: true,
            iteration: i + 1,
            amount,
            merchantReference,
            transactionId: payInResult.response.id,
            status: payInResult.response.status,
            expectedGateway: expected.gatewayName,
            actualGateway: gatewayName || "Unknown",
            isCorrect,
            passed: isCorrect,
            error: null,
          };
        })
        .catch((error) => {
          return {
            success: false,
            iteration: i + 1,
            amount,
            merchantReference,
            transactionId: null,
            status: null,
            expectedGateway: expected.gatewayName,
            actualGateway: null,
            isCorrect: false,
            passed: false,
            error: error.message,
          };
        });

      promises.push(promise);
    }

    // Wait for all pay-ins to complete
    const results = await Promise.all(promises);

    // Analyze results
    let modePassed = 0,
      modeFailed = 0;
    for (const result of results) {
      modeResults.push(result);
      if (result.passed) {
        modePassed++;
        passed++;
      } else {
        modeFailed++;
        failed++;
      }
      total++;
    }

    // Log mode summary
    const passRate =
      modeResults.length > 0
        ? ((modePassed / modeResults.length) * 100).toFixed(0)
        : 0;
    if (modeFailed === 0) {
      logSuccess(
        `  ✅ ${paymentMode}: ${modePassed}/${modeResults.length} PASSED (${passRate}%)`,
      );
    } else {
      logError(
        `  ❌ ${paymentMode}: ${modePassed}/${modeResults.length} PASSED (${passRate}%)`,
      );
    }

    allResults.push({
      paymentMode,
      expectedGateway: expected.gatewayName,
      expectedGatewayId: expected.gatewayId,
      priority: expected.priority,
      status: modeFailed === 0 ? "PASSED" : "FAILED",
      transactions: modeResults,
    });
  }

  // Merchant summary
  logSection(`📊 MERCHANT ${merchantId} SUMMARY`);
  console.log(
    `  Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`,
  );
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;
  console.log(`  Pass Rate: ${passRate}%`);

  return {
    merchantId,
    merchantName,
    routingStrategy,
    results: allResults,
    summary: { total, passed, failed, skipped, passRate },
  };
}

/**
 * Main test function
 */
async function testStripePayuRouting() {
  logSection("🚀 TEST 11: STRIPE & PAYU ROUTING - MERCHANTS 11-17");

  console.log(`
  ╔═══════════════════════════════════════════════════════════════════╗
  ║  CONFIGURATION                                                  ║
  ║  ├── Gateways: Stripe (9), PayU (10)                           ║
  ║  ├── Payment Modes: UPI, CARD, WALLET, NETBANKING              ║
  ║  ├── Iterations per mode: ${ITERATIONS_PER_MODE}                              ║
  ║  ├── Amount range: ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT}                           ║
  ║  └── Merchants: 11 to 17                                       ║
  ╚═══════════════════════════════════════════════════════════════════╝
  `);

  try {
    // 1. Fetch routing config from database
    logInfo("📡 Fetching routing configuration from database...");
    const rawData = await getRoutingConfig(MERCHANT_IDS);

    if (rawData.length === 0) {
      logError("❌ No routing configuration found");
      await closeDbConnection();
      return { error: "No configuration found" };
    }

    // 2. Build merchant config
    const allMerchants = buildMerchantConfig(rawData);

    // Filter to merchants 11-17
    const merchants = allMerchants.filter((m) =>
      MERCHANT_IDS.includes(m.merchantId),
    );

    logSuccess(
      `✅ Found ${merchants.length} merchants with routing config (11-17)`,
    );

    // 3. Test each merchant
    const merchantResults = [];
    for (const merchant of merchants) {
      const result = await testMerchant(merchant);
      merchantResults.push(result);
    }

    // 4. Close database connection
    await closeDbConnection();

    // 5. Generate overall summary
    logSection("📊 OVERALL TEST SUMMARY - STRIPE & PAYU");

    let totalAll = 0,
      passedAll = 0,
      failedAll = 0,
      skippedAll = 0;

    console.log(
      "\n┌─────────────────────────────────────────────────────────────────────┐",
    );
    console.log(
      "│                    MERCHANT RESULTS                                 │",
    );
    console.log(
      "├─────────────────────────────────────────────────────────────────────┤",
    );

    for (const mr of merchantResults) {
      const { merchantId, merchantName, routingStrategy, summary } = mr;
      const status = summary.failed === 0 ? "✅ PASS" : "❌ FAIL";
      const passRate =
        summary.total > 0
          ? ((summary.passed / summary.total) * 100).toFixed(1)
          : 0;

      console.log(
        `│ ${merchantId}. ${merchantName.padEnd(15)} ${routingStrategy.padEnd(10)} │ Total: ${String(summary.total).padStart(3)} │ Pass: ${String(summary.passed).padStart(3)} │ Fail: ${String(summary.failed).padStart(3)} │ Skip: ${String(summary.skipped).padStart(3)} │ ${status} │`,
      );

      totalAll += summary.total;
      passedAll += summary.passed;
      failedAll += summary.failed;
      skippedAll += summary.skipped;
    }

    console.log(
      "├─────────────────────────────────────────────────────────────────────┤",
    );
    const overallPassRate =
      totalAll > 0 ? ((passedAll / totalAll) * 100).toFixed(1) : 0;
    console.log(
      `│ ${"OVERALL".padEnd(35)} │ Total: ${String(totalAll).padStart(3)} │ Pass: ${String(passedAll).padStart(3)} │ Fail: ${String(failedAll).padStart(3)} │ Skip: ${String(skippedAll).padStart(3)} │ ${overallPassRate}% │`,
    );
    console.log(
      "└─────────────────────────────────────────────────────────────────────┘",
    );

    // 6. Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      testName: "Stripe & PayU Routing Test",
      configuration: {
        gateways: ALLOWED_GATEWAYS,
        gatewayNames: ["Stripe (9)", "PayU (10)"],
        paymentModes: ALL_PAYMENT_MODES,
        iterationsPerMode: ITERATIONS_PER_MODE,
        minAmount: MIN_AMOUNT,
        maxAmount: MAX_AMOUNT,
        merchants: MERCHANT_IDS,
      },
      merchants: merchantResults,
      summary: {
        totalTransactions: totalAll,
        passed: passedAll,
        failed: failedAll,
        skipped: skippedAll,
        passRate: `${overallPassRate}%`,
      },
    };

    const fs = require("fs");
    const path = require("path");
    const reportDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(reportDir, "stripe-payu-test-report.json"),
      JSON.stringify(report, null, 2),
    );
    logSuccess(
      `📄 Detailed report saved to: reports/stripe-payu-test-report.json`,
    );

    return report;
  } catch (error) {
    logError(`❌ Test failed: ${error.message}`);
    await closeDbConnection();
    throw error;
  }
}

module.exports = { testStripePayuRouting };
