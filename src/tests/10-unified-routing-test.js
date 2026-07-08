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
const ALLOWED_GATEWAYS = [1, 2, 3]; // Razorpay, Cashfree, Adyen
const ALL_PAYMENT_MODES = ["UPI", "CARD", "WALLET", "NETBANKING"];
const ITERATIONS_PER_MODE = parseInt(process.env.ITERATIONS_PER_MODE) || 10;
const MIN_AMOUNT = parseInt(process.env.MIN_AMOUNT) || 1000;
const MAX_AMOUNT = parseInt(process.env.MAX_AMOUNT) || 50000;

// ==========================================

/**
 * Get random amount in multiples of 1000
 */
function randomAmountInMultiples(min, max) {
  const minThousands = Math.ceil(min / 1000);
  const maxThousands = Math.floor(max / 1000);
  const randomThousands =
    Math.floor(Math.random() * (maxThousands - minThousands + 1)) +
    minThousands;
  return randomThousands * 1000;
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

  // 1. Check intent field
  if (response.intent) {
    try {
      const intent =
        typeof response.intent === "string"
          ? JSON.parse(response.intent)
          : response.intent;

      // Razorpay: key starts with rzp_test
      if (intent.key && intent.key.startsWith("rzp_test")) {
        return "Razorpay";
      }

      // Cashfree: paymentSessionId or appId
      if (intent.paymentSessionId) {
        return "Cashfree";
      }
      if (intent.appId && intent.appId.startsWith("TEST")) {
        return "Cashfree";
      }

      // Adyen: sessionId, pspReference, or clientKey
      if (intent.sessionId && intent.sessionId.startsWith("CS")) {
        return "Adyen";
      }
      if (intent.pspReference) {
        return "Adyen";
      }
      if (intent.clientKey && intent.clientKey.startsWith("test_")) {
        return "Adyen";
      }
    } catch (e) {}
  }

  // 2. Check gatewayId
  if (response.gatewayId) {
    const gatewayMap = { 1: "Razorpay", 2: "Cashfree", 3: "Adyen" };
    return gatewayMap[response.gatewayId] || null;
  }

  // 3. Check gatewayName
  if (response.gatewayName) {
    const name = response.gatewayName.toUpperCase();
    if (name.includes("RAZORPAY")) return "Razorpay";
    if (name.includes("CASHFREE")) return "Cashfree";
    if (name.includes("ADYEN")) return "Adyen";
  }

  // 4. Check paymentGateway field
  if (response.paymentGateway) {
    const name = response.paymentGateway.toUpperCase();
    if (name.includes("RAZORPAY")) return "Razorpay";
    if (name.includes("CASHFREE")) return "Cashfree";
    if (name.includes("ADYEN")) return "Adyen";
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
  console.log(
    "🔑 Access Token (first 20 chars):",
    accessToken ? accessToken.substring(0, 20) + "..." : "MISSING!",
  );
  console.log(
    "🔑 Client Secret (first 20 chars):",
    clientSecret ? clientSecret.substring(0, 20) + "..." : "MISSING!",
  );
  logSuccess(`✅ Logged in as ${user.email}`);

  const allResults = [];
  let total = 0,
    passed = 0,
    failed = 0,
    skipped = 0;

  // Test each payment mode
  for (const paymentMode of ALL_PAYMENT_MODES) {
    const expected = paymentModeMap[paymentMode];

    // Check if this payment mode is mapped to allowed gateways (1, 2, 3)
    if (!expected || !ALLOWED_GATEWAYS.includes(expected.gatewayId)) {
      logWarning(
        `⚠️ SKIPPING ${paymentMode} - Not configured for gateways 1-3`,
      );

      const skipResult = {
        paymentMode,
        expectedGateway: expected ? expected.gatewayName : "N/A",
        expectedGatewayId: expected ? expected.gatewayId : null,
        status: "SKIPPED",
        reason: "Not configured for gateways 1, 2, or 3",
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
      const amount = randomAmountInMultiples(MIN_AMOUNT, MAX_AMOUNT);
      const customer = randomCustomer();
      const merchantReference = `ORD-UNI-${merchantId}-${paymentMode}-${Date.now()}-${i}`;

      const promise = createPayIn(accessToken, clientSecret, {
        paymentMode,
        amount,
        customer,
        merchantReference,
      })
        .then(async (payInResult) => {
          // 🔥 TRIGGER WEBHOOK AND WAIT FOR IT
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

          // NOW detect gateway from response (after webhook)
          let gatewayName = null;

          // Method 1: From intent
          if (payInResult.response.intent) {
            try {
              const intent =
                typeof payInResult.response.intent === "string"
                  ? JSON.parse(payInResult.response.intent)
                  : payInResult.response.intent;
              if (intent.key && intent.key.startsWith("rzp_test")) {
                gatewayName = "Razorpay";
              }
            } catch (e) {}
          }

          // Method 2: From gatewayId
          if (!gatewayName && payInResult.response.gatewayId) {
            const gwMap = { 1: "Razorpay", 2: "Cashfree", 3: "Adyen" };
            gatewayName = gwMap[payInResult.response.gatewayId] || null;
          }

          // Method 3: From gatewayName
          if (!gatewayName && payInResult.response.gatewayName) {
            const name = payInResult.response.gatewayName.toUpperCase();
            if (name.includes("RAZORPAY")) gatewayName = "Razorpay";
            else if (name.includes("CASHFREE")) gatewayName = "Cashfree";
            else if (name.includes("ADYEN")) gatewayName = "Adyen";
          }

          // Log detection
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

    // Wait for all pay-ins to complete (webhooks already triggered in background)
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
 * Main unified test function
 */
async function testUnifiedRouting() {
  logSection("🚀 UNIFIED ROUTING TEST - ALL MERCHANTS 1-10");

  console.log(`
  ╔═══════════════════════════════════════════════════════════════════╗
  ║  CONFIGURATION                                                  ║
  ║  ├── Gateways: Razorpay (1), Cashfree (2), Adyen (3)           ║
  ║  ├── Payment Modes: UPI, CARD, WALLET, NETBANKING              ║
  ║  ├── Iterations per mode: ${ITERATIONS_PER_MODE}                              ║
  ║  ├── Amount range: ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT} (multiples of 1000)       ║
  ║  └── Merchants: 1 to 10                                        ║
  ╚═══════════════════════════════════════════════════════════════════╝
  `);

  try {
    // 1. Fetch routing config from database
    logInfo("📡 Fetching routing configuration from database...");
    const rawData = await getRoutingConfig();

    if (rawData.length === 0) {
      logError(
        "❌ No routing configuration found for merchants 1-10 with gateways 1-3",
      );
      await closeDbConnection();
      return { error: "No configuration found" };
    }

    // 2. Build merchant config
    const merchants = buildMerchantConfig(rawData);
    logSuccess(`✅ Found ${merchants.length} merchants with routing config`);

    // 3. Test each merchant
    const merchantResults = [];
    for (const merchant of merchants) {
      const result = await testMerchant(merchant);
      merchantResults.push(result);
    }

    // 4. Close database connection
    await closeDbConnection();

    // 5. Generate overall summary
    logSection("📊 OVERALL TEST SUMMARY");

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
      configuration: {
        gateways: ALLOWED_GATEWAYS,
        paymentModes: ALL_PAYMENT_MODES,
        iterationsPerMode: ITERATIONS_PER_MODE,
        minAmount: MIN_AMOUNT,
        maxAmount: MAX_AMOUNT,
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
      path.join(reportDir, "unified-test-report.json"),
      JSON.stringify(report, null, 2),
    );
    logSuccess(`📄 Detailed report saved to: reports/unified-test-report.json`);

    return report;
  } catch (error) {
    logError(`❌ Test failed: ${error.message}`);
    await closeDbConnection();
    throw error;
  }
}

module.exports = { testUnifiedRouting };
