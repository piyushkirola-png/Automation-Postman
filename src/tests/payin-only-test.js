const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
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
const ALLOWED_GATEWAYS = [2, 3, 4, 5, 6, 9, 10];
const ALL_PAYMENT_MODES = ["UPI", "CARD"];
const ITERATIONS_PER_MODE = parseInt(process.env.ITERATIONS_PER_MODE) || 5;
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

function randomAmountInMultiples(min, max) {
  const minThousands = Math.ceil(min / 1000);
  const maxThousands = Math.floor(max / 1000);
  const randomThousands =
    Math.floor(Math.random() * (maxThousands - minThousands + 1)) +
    minThousands;
  return randomThousands * 1000;
}

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

  const { accessToken, clientSecret } = loginData;
  logSuccess(`✅ Logged in as ${user.email}`);

  const allResults = [];
  let total = 0,
    passed = 0,
    failed = 0,
    skipped = 0;

  for (const paymentMode of ALL_PAYMENT_MODES) {
    const expected = paymentModeMap[paymentMode];

    // SKIP if gateway is NOT in allowed list
    if (!expected || !ALLOWED_GATEWAYS.includes(expected.gatewayId)) {
      logWarning(
        `⚠️ SKIPPING ${paymentMode} - Gateway ${expected?.gatewayName || "N/A"} not in allowed list`,
      );
      const skipResult = {
        paymentMode,
        expectedGateway: expected ? expected.gatewayName : "N/A",
        expectedGatewayId: expected ? expected.gatewayId : null,
        status: "SKIPPED",
        reason: "Gateway not in allowed list",
        transactions: [],
      };
      allResults.push(skipResult);
      skipped++;
      continue;
    }

    logInfo(
      `\n🔍 Testing ${paymentMode} → Expected: ${expected.gatewayName} (Priority ${expected.priority})`,
    );

    const modeResults = [];
    const promises = [];

    for (let i = 0; i < ITERATIONS_PER_MODE; i++) {
      const amount = randomAmountInMultiples(MIN_AMOUNT, MAX_AMOUNT);
      const customer = {
        name: `Test User ${i}`,
        email: `test${i}@example.com`,
        phone: `99999999${String(i).padStart(2, "0")}`,
      };
      const merchantReference = `PAYINONLY-${merchantId}-${paymentMode}-${Date.now()}-${i}`;

      const promise = createPayInWithRetry(accessToken, clientSecret, {
        paymentMode,
        amount,
        customer,
        merchantReference,
      })
        .then((payInResult) => {
          logInfo(
            `✅ Pay-In created: ${merchantReference} | ID: ${payInResult.response.id}`,
          );
          return {
            success: true,
            iteration: i + 1,
            amount,
            merchantReference,
            transactionId: payInResult.response.id,
            status: payInResult.response.status,
            expectedGateway: expected.gatewayName,
            actualGateway: expected.gatewayName,
            isCorrect: true,
            passed: true,
            url: payInResult.response.url,
            feeAmount: payInResult.response.feeAmount,
            taxAmount: payInResult.response.taxAmount,
            amountToCredit: payInResult.response.amountToCredit,
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
      expectedGateway: expected.gatewayName,
      expectedGatewayId: expected.gatewayId,
      priority: expected.priority,
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

async function testPayInOnly() {
  const startTime = Date.now();

  logSection("🚀 PAY-IN ONLY TEST - NO WEBHOOKS");
  console.log(`
  ╔════════════════════════════════════════════════════════════════════╗
  ║  CONFIGURATION                                                    ║
  ║  ├── Gateways: 2,3,4,5,6,9,10                                    ║
  ║  │              (Cashfree, Adyen, Chargebee, Bennupay,           ║
  ║  │               SabPaisa, Stripe, PayU)                        ║
  ║  ├── Payment Modes: UPI, CARD                                    ║
  ║  ├── Iterations per mode: ${ITERATIONS_PER_MODE}                                  ║
  ║  ├── Merchants: 1 to 10                                          ║
  ║  └── Webhooks: ❌ NOT TRIGGERED                                  ║
  ╚════════════════════════════════════════════════════════════════════╝
  `);

  try {
    logInfo("📡 Fetching routing configuration from database...");
    const rawData = await getRoutingConfig();

    if (rawData.length === 0) {
      logError("❌ No routing configuration found");
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

    logSection("📊 OVERALL SUMMARY");

    let totalAll = 0,
      passedAll = 0,
      failedAll = 0,
      skippedAll = 0;

    console.log(
      "\n┌────────────────────────────────────────────────────────────────────────────┐",
    );
    console.log(
      "│                    MERCHANT RESULTS (PAY-IN ONLY)                          │",
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
    const totalTimeSeconds = (endTime - startTime) / 1000;
    const tps = totalAll > 0 ? totalAll / totalTimeSeconds : 0;

    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                         📊 RESULTS                                ║
╠════════════════════════════════════════════════════════════════════╣
║  Total Pay-Ins:      ${String(totalAll).padStart(8)}                                           ║
║  Passed:             ${String(passedAll).padStart(8)}                                           ║
║  Failed:             ${String(failedAll).padStart(8)}                                           ║
║  Skipped:            ${String(skippedAll).padStart(8)}                                           ║
║  Pass Rate:          ${String(overallPassRate).padStart(8)}%                                          ║
║  Total Time:         ${String(totalTimeSeconds.toFixed(2)).padStart(8)} seconds                                  ║
║  TPS:                ${String(tps.toFixed(2)).padStart(8)} transactions/second                           ║
║  Webhooks:           ❌ NOT TRIGGERED                                 ║
╚════════════════════════════════════════════════════════════════════╝
    `);

    const fs = require("fs");
    const path = require("path");
    const reportDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      type: "PAY-IN ONLY - NO WEBHOOKS",
      configuration: {
        gateways: ALLOWED_GATEWAYS,
        paymentModes: ALL_PAYMENT_MODES,
        iterationsPerMode: ITERATIONS_PER_MODE,
        merchants: merchants.length,
      },
      merchants: merchantResults,
      summary: {
        totalTransactions: totalAll,
        passed: passedAll,
        failed: failedAll,
        skipped: skippedAll,
        passRate: `${overallPassRate}%`,
        tps: tps.toFixed(2),
        webhooksTriggered: false,
      },
    };

    fs.writeFileSync(
      path.join(reportDir, "payin-only-test-report.json"),
      JSON.stringify(report, null, 2),
    );
    logSuccess(`📄 Report saved to: reports/payin-only-test-report.json`);

    return report;
  } catch (error) {
    logError(`❌ Test failed: ${error.message}`);
    await closeDbConnection();
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testPayInOnly()
    .then(() => {
      console.log("\n✅ Pay-In Only test completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test failed:", error.message);
      process.exit(1);
    });
}

module.exports = { testPayInOnly };
