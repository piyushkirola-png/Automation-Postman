const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const {
  triggerWebhookForPayIn,
  detectGateway,
} = require("../utils/webhook-trigger");
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

// ==================== SIMPLE CONCURRENCY LIMITER ====================
let activeWebhooks = 0;
const MAX_CONCURRENT_WEBHOOKS = 10;

async function withConcurrencyLimit(fn) {
  while (activeWebhooks >= MAX_CONCURRENT_WEBHOOKS) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
  }
  activeWebhooks++;
  try {
    return await fn();
  } finally {
    activeWebhooks--;
  }
}

// ============== CONFIGURATION ==============
const ALLOWED_GATEWAYS = [2, 3, 4, 5, 6, 9, 10];
const ALL_PAYMENT_MODES = ["UPI", "CARD"];
const ITERATIONS_PER_MODE = parseInt(process.env.ITERATIONS_PER_MODE) || 10;
const MIN_AMOUNT = parseInt(process.env.MIN_AMOUNT) || 1000;
const MAX_AMOUNT = parseInt(process.env.MAX_AMOUNT) || 10000;

// Retry function for API calls
async function createPayInWithRetry(
  accessToken,
  clientSecret,
  options,
  maxRetries = 3,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createPayIn(accessToken, clientSecret, options);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * Math.pow(2, attempt - 1);
      logWarning(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

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
 *  Test a single merchant
 */
async function testMerchant(merchantConfig) {
  const { merchantId, merchantName, routingStrategy, paymentModeMap } =
    merchantConfig;

  logSection(
    `🧪 TESTING MERCHANT ${merchantId}: ${merchantName} (${routingStrategy})`,
  );

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

  const { accessToken, clientSecret, user: loggedInUser } = loginData;
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

  for (const paymentMode of ALL_PAYMENT_MODES) {
    const allGateways = paymentModeMap[paymentMode] || [];

    const selectedGateway = allGateways.find((g) =>
      ALLOWED_GATEWAYS.includes(g.gatewayId),
    );

    if (!selectedGateway) {
      logWarning(`⚠️ SKIPPING ${paymentMode} - No allowed gateway found`);
      const skipResult = {
        paymentMode,
        expectedGateway: "N/A",
        expectedGatewayId: null,
        status: "SKIPPED",
        reason: "No allowed gateway found",
        transactions: [],
      };
      allResults.push(skipResult);
      skipped++;
      continue;
    }

    logInfo(
      `\n🔍 Testing ${paymentMode} → Expected: ${selectedGateway.gatewayName} (Priority ${selectedGateway.priority})`,
    );

    const modeResults = [];
    const promises = [];

    for (let i = 0; i < ITERATIONS_PER_MODE; i++) {
      const amount = randomAmountInMultiples(MIN_AMOUNT, MAX_AMOUNT);
      const customer = randomCustomer();
      const merchantReference = `ORD-UNI-${merchantId}-${paymentMode}-${Date.now()}-${i}`;

      const promise = createPayInWithRetry(accessToken, clientSecret, {
        paymentMode,
        amount,
        customer,
        merchantReference,
      })
        .then(async (payInResult) => {
          logInfo(`🔔 Waiting 5 seconds before webhook...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));

          logInfo(`🔔 Triggering webhook for ${merchantReference}...`);

          let webhookSuccess = false;
          let webhookResponse = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const result = await triggerWebhookForPayIn(
                payInResult,
                "SUCCESS",
              );
              if (result && result.success) {
                webhookSuccess = true;
                webhookResponse = result;
                logInfo(
                  `✅ Webhook triggered successfully (attempt ${attempt})`,
                );
                break;
              } else {
                logWarning(`⚠️ Webhook attempt ${attempt} returned failure`);
              }
            } catch (webhookError) {
              logError(
                `❌ Webhook attempt ${attempt} failed: ${webhookError.message}`,
              );
              if (attempt < 3) {
                const waitTime = 1000 * attempt;
                logInfo(`⏳ Waiting ${waitTime}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
              }
            }
          }

          if (!webhookSuccess) {
            logError(
              `❌ Webhook failed after 3 attempts for ${merchantReference}`,
            );
          }

          const gatewayName = detectGateway(payInResult.response);

          logInfo(
            `📍 Detected: ${gatewayName || "Unknown"} | Expected: ${selectedGateway.gatewayName}`,
          );

          const isCorrect =
            gatewayName?.toUpperCase() ===
            selectedGateway.gatewayName?.toUpperCase();

          return {
            success: true,
            iteration: i + 1,
            amount,
            merchantReference,
            transactionId: payInResult.response.id,
            status: payInResult.response.status,
            expectedGateway: selectedGateway.gatewayName,
            actualGateway: gatewayName || "Unknown",
            isCorrect,
            passed: isCorrect && webhookSuccess,
            webhookSuccess: webhookSuccess,
            feeAmount: payInResult.response.feeAmount,
            taxAmount: payInResult.response.taxAmount,
            amountToCredit: payInResult.response.amountToCredit,
            url: payInResult.response.url,
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
            expectedGateway: selectedGateway.gatewayName,
            actualGateway: null,
            isCorrect: false,
            passed: false,
            webhookSuccess: false,
            feeAmount: null,
            taxAmount: null,
            amountToCredit: null,
            url: null,
            error: error.message,
          };
        });

      promises.push(promise);
    }

    const results = await Promise.all(promises);

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
      expectedGateway: selectedGateway.gatewayName,
      expectedGatewayId: selectedGateway.gatewayId,
      priority: selectedGateway.priority,
      status: modeFailed === 0 ? "PASSED" : "FAILED",
      transactions: modeResults,
    });
  }

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
  const startTime = Date.now();

  logSection("🚀 UNIFIED ROUTING TEST - ALL MERCHANTS 1-10");

  console.log(`
  ╔════════════════════════════════════════════════════════════════════╗
  ║  CONFIGURATION                                                    ║
  ║  ├── Gateways: Razorpay, Cashfree, Adyen, Chargebee, Bennupay,   ║
  ║  │              SabPaisa, Stripe, PayU                           ║
  ║  ├── Payment Modes: UPI, CARD                                    ║
  ║  ├── Iterations per mode: ${ITERATIONS_PER_MODE}                                  ║
  ║  ├── Amount range: ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT} (multiples of 1000)           ║
  ║  └── Merchants: 1 to 10                                          ║
  ╚════════════════════════════════════════════════════════════════════╝
  `);

  try {
    logInfo("📡 Fetching routing configuration from database...");
    const rawData = await getRoutingConfig();

    if (rawData.length === 0) {
      logError("❌ No routing configuration found for merchants 1-10");
      await closeDbConnection();
      return { error: "No configuration found" };
    }

    const merchants = buildMerchantConfig(rawData);
    logSuccess(`✅ Found ${merchants.length} merchants with routing config`);

    const merchantPromises = merchants.map((merchant) =>
      testMerchant(merchant),
    );
    const merchantResults = await Promise.all(merchantPromises);

    await closeDbConnection();

    logSection("📊 OVERALL TEST SUMMARY");

    let totalAll = 0,
      passedAll = 0,
      failedAll = 0,
      skippedAll = 0;

    console.log(
      "\n┌────────────────────────────────────────────────────────────────────────────┐",
    );
    console.log(
      "│                    MERCHANT RESULTS                                         │",
    );
    console.log(
      "├────────────────────────────────────────────────────────────────────────────┤",
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
      "├────────────────────────────────────────────────────────────────────────────┤",
    );
    const overallPassRate =
      totalAll > 0 ? ((passedAll / totalAll) * 100).toFixed(1) : 0;
    console.log(
      `│ ${"OVERALL".padEnd(35)} │ Total: ${String(totalAll).padStart(3)} │ Pass: ${String(passedAll).padStart(3)} │ Fail: ${String(failedAll).padStart(3)} │ Skip: ${String(skippedAll).padStart(3)} │ ${overallPassRate}% │`,
    );
    console.log(
      "└────────────────────────────────────────────────────────────────────────────┘",
    );

    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;
    const totalTimeSeconds = totalTimeMs / 1000;
    const tps = totalAll > 0 ? totalAll / totalTimeSeconds : 0;

    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                         📊 TPS PERFORMANCE METRICS                ║
╠════════════════════════════════════════════════════════════════════╣
║  Total Transactions:  ${String(totalAll).padStart(8)}                                           ║
║  Total Time:          ${String(totalTimeSeconds.toFixed(2)).padStart(8)} seconds                                  ║
║  TPS (Average):       ${String(tps.toFixed(2)).padStart(8)} transactions/second                           ║
║  Iterations per mode: ${String(ITERATIONS_PER_MODE).padStart(8)}                                           ║
║  Payment Modes:       ${String(ALL_PAYMENT_MODES.length).padStart(8)}                                           ║
║  Merchants Tested:    ${String(merchantResults.length).padStart(8)}                                           ║
╚════════════════════════════════════════════════════════════════════╝
    `);

    const report = {
      timestamp: new Date().toISOString(),
      configuration: {
        gateways: ALLOWED_GATEWAYS,
        paymentModes: ALL_PAYMENT_MODES,
        iterationsPerMode: ITERATIONS_PER_MODE,
        minAmount: MIN_AMOUNT,
        maxAmount: MAX_AMOUNT,
      },
      tpsMetrics: {
        totalTransactions: totalAll,
        totalTimeSeconds: totalTimeSeconds,
        tps: tps,
        iterationsPerMode: ITERATIONS_PER_MODE,
        paymentModes: ALL_PAYMENT_MODES.length,
        merchants: merchantResults.length,
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
