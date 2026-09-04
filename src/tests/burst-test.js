const axios = require("axios");
const crypto = require("crypto");
const config = require("../config");
const {
  triggerWebhookForPayIn,
  detectGateway,
} = require("../utils/webhook-trigger");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
  logWarning,
} = require("../utils/logger");
const { pool } = require("../config/db");

// USER CREDENTIALS
const USER_EMAIL = "snehamehta@gmail.com";
const USER_PASSWORD = "12345678";
const CLIENT_SECRET =
  "1e323eb4aff43a9fd38d7636d098d3af07834715dc1bc40c2c2a97974b67fd6b";

// TEST CONFIGURATION
const TOTAL_TRANSACTIONS = 1000;
const PAYMENT_MODES = ["UPI", "CARD"];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

// BURST MODE: no artificial delays, no concurrency cap — genuinely simultaneous
const PAYIN_BURST_CONCURRENCY = TOTAL_TRANSACTIONS; // fire all pay-ins at once
const WEBHOOK_BURST_CONCURRENCY = 20; // fire all webhooks at once

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSignature(merchantReference, clientSecret) {
  return crypto
    .createHmac("sha256", clientSecret)
    .update(merchantReference)
    .digest("hex");
}

function generateMerchantReference(index) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `BURST-${timestamp}-${index}-${random}`;
}

function randomAmountInMultiples(min, max) {
  const minRounded = Math.ceil(min / 100) * 100;
  const maxRounded = Math.floor(max / 100) * 100;

  if (maxRounded < 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  const randomSteps = Math.floor(
    Math.random() * ((maxRounded - minRounded) / 100 + 1),
  );
  const amount = minRounded + randomSteps * 100;

  return Math.min(Math.max(amount, min), max);
}

function randomCustomer() {
  const firstNames = [
    "John", "Emma", "Michael", "Sophia", "William", "Olivia", "James", "Ava",
  ];
  const lastNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  ];
  const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(100, 999)}@${domains[Math.floor(Math.random() * domains.length)]}`;
  const phone = `+91${randomInt(7000000000, 9999999999)}`;

  return { name, email, phone };
}

async function loginUser() {
  try {
    const url = `${config.BASE_URL}/api/auth/user/login`;
    const payload = { email: USER_EMAIL, password: USER_PASSWORD };

    logInfo(`Logging in: ${USER_EMAIL}`);

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.data.success) {
      const data = response.data.data;
      const accessToken = data.accessToken;
      logSuccess(`✅ Login successful for ${USER_EMAIL}`);
      return { accessToken };
    } else {
      throw new Error(response.data.message || "Login failed");
    }
  } catch (error) {
    logError(`❌ Login failed: ${error.message}`);
    throw error;
  }
}

async function createPayIn(accessToken, options) {
  const startTime = Date.now();
  try {
    const url = `${config.BASE_URL}/api/payin-requests`;
    const { paymentMode, amount, customer, merchantReference } = options;
    const signature = generateSignature(merchantReference, CLIENT_SECRET);

    const payload = {
      amount,
      currency: "INR",
      merchantReference,
      paymentMode,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-signature": signature,
      },
    });

    const responseTimeMs = Date.now() - startTime;

    return {
      success: true,
      responseTimeMs,
      request: {
        payload,
        signature,
        merchantReference,
        amount,
        paymentMode,
        customer,
      },
      response: response.data,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      success: false,
      responseTimeMs,
      merchantReference: options.merchantReference,
      error: error.message,
      status: error.response?.status || null,
      errorData: error.response?.data || null,
    };
  }
}

async function fireWebhookBurst(accessToken, payInResult, index) {
  const startTime = Date.now();
  try {
    const gateway = detectGateway(payInResult.response);
    const webhookResult = await triggerWebhookForPayIn(
      payInResult,
      "SUCCESS",
      0,
      0,
    );
    const responseTimeMs = Date.now() - startTime;

    return {
      index,
      success: !!(webhookResult && webhookResult.success),
      responseTimeMs,
      gateway: gateway || "Unknown",
      merchantReference: payInResult.response.merchantReference,
      transactionId: payInResult.response.id,
      error: null,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return {
      index,
      success: false,
      responseTimeMs,
      gateway: null,
      merchantReference: payInResult?.response?.merchantReference || null,
      transactionId: payInResult?.response?.id || null,
      error: error.message,
    };
  }
}

// ==================== CONCURRENCY BATCHING (still parallel, just chunked) ====================

async function runInParallelBatches(items, concurrency, workerFn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, idx) => workerFn(item, i + idx)),
    );
    results.push(...batchResults);
  }
  return results;
}

// ==================== LAST ID / TEST COUNTER (same as before) ====================

function getLastIdFilePath() {
  const path = require("path");
  return path.join(__dirname, "../../last-id.txt");
}

function readLastMaxId() {
  const fs = require("fs");
  const filePath = getLastIdFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8").trim();
      return parseInt(content) || 0;
    }
  } catch (error) {
    logWarning(`Could not read last-id.txt: ${error.message}`);
  }
  return 0;
}

function writeLastMaxId(id) {
  const fs = require("fs");
  const filePath = getLastIdFilePath();
  try {
    fs.writeFileSync(filePath, String(id));
    logInfo(`📝 Saved last max ID: ${id}`);
  } catch (error) {
    logError(`Failed to write last-id.txt: ${error.message}`);
  }
}

function getTestCounterFilePath() {
  const path = require("path");
  return path.join(__dirname, "../../burst-test-counter.txt");
}

function readTestCounter() {
  const fs = require("fs");
  const filePath = getTestCounterFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8").trim();
      return parseInt(content) || 0;
    }
  } catch (error) {
    logWarning(`Could not read burst-test-counter.txt: ${error.message}`);
  }
  return 0;
}

function writeTestCounter(counter) {
  const fs = require("fs");
  const filePath = getTestCounterFilePath();
  try {
    fs.writeFileSync(filePath, String(counter));
  } catch (error) {
    logError(`Failed to write burst-test-counter.txt: ${error.message}`);
  }
}

// ==================== DB STATUS QUERY ====================

async function getDbStatusCounts(lastMaxId) {
  try {
    const query = `
      SELECT status, COUNT(*) as count
      FROM "PayInRequest"
      WHERE id > $1
      GROUP BY status
    `;
    const result = await pool.query(query, [lastMaxId]);

    const counts = {
      SUCCESS: 0,
      FAILED: 0,
      PENDING: 0,
      PROCESSING: 0,
      total: 0,
    };

    for (const row of result.rows) {
      const status = row.status.toUpperCase();
      if (["SUCCESS", "COMPLETED", "PAID", "CAPTURED"].includes(status)) {
        counts.SUCCESS += parseInt(row.count);
      } else if (["FAILED", "ERROR", "DECLINED", "REJECTED"].includes(status)) {
        counts.FAILED += parseInt(row.count);
      } else if (["PENDING", "INITIATED", "PROCESSING"].includes(status)) {
        counts.PENDING += parseInt(row.count);
      } else {
        counts.PENDING += parseInt(row.count);
      }
      counts.total += parseInt(row.count);
    }

    const maxIdQuery = `SELECT MAX(id) as maxId FROM "PayInRequest"`;
    const maxIdResult = await pool.query(maxIdQuery);
    const currentMaxId = maxIdResult.rows[0]?.maxid || 0;

    return { counts, currentMaxId };
  } catch (error) {
    logError(`❌ DB query failed: ${error.message}`);
    return {
      counts: { SUCCESS: 0, FAILED: 0, PENDING: 0, total: 0 },
      currentMaxId: 0,
    };
  }
}

// ==================== RACE CONDITION CHECK (wallet ledger consistency) ====================

async function checkWalletRaceConditions() {
  try {
    const query = `
      SELECT COUNT(*) AS race_conditions
      FROM (
          SELECT
              "id",
              "openingBalance",
              LAG("closingBalance") OVER (
                  PARTITION BY "merchantId", "userId"
                  ORDER BY "id"
              ) AS prev_closing
          FROM public."PayInWallet"
      ) t
      WHERE prev_closing IS NOT NULL
        AND "openingBalance" <> prev_closing;
    `;
    const result = await pool.query(query);
    return parseInt(result.rows[0]?.race_conditions || 0);
  } catch (error) {
    logError(`❌ Race condition check failed: ${error.message}`);
    return null;
  }
}

// ==================== SUMMARY FILE APPEND ====================

function appendToBurstTestFile(summaryText, testNumber) {
  const fs = require("fs");
  const path = require("path");
  const filePath = path.join(__dirname, "../../burst-test.txt");
  const MAX_ENTRIES = 10;

  try {
    let content = "";
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf8");
    }

    const entries = content.split(/={60,}/).filter((entry) => entry.trim());

    let newContent = "";
    if (entries.length >= MAX_ENTRIES) {
      const keepEntries = entries.slice(-(MAX_ENTRIES - 1));
      newContent = keepEntries.join(
        "============================================================",
      );
      if (keepEntries.length > 0) {
        newContent =
          "============================================================" +
          newContent;
      }
    } else {
      newContent = content;
    }

    const separator =
      "============================================================";
    const newEntry = `
${separator}
BURST TEST #${testNumber} - ${new Date().toLocaleString()}
${separator}
${summaryText}
`;

    fs.writeFileSync(filePath, newContent + newEntry);
    logSuccess(
      `📄 Appended BURST TEST #${testNumber} to: burst-test.txt (keeping last ${MAX_ENTRIES})`,
    );
  } catch (error) {
    logError(`Failed to append to burst-test.txt: ${error.message}`);
  }
}

// ==================== STATS HELPERS ====================

function computeResponseTimeStats(results) {
  const times = results.map((r) => r.responseTimeMs).filter((t) => typeof t === "number");
  if (times.length === 0) return { min: 0, max: 0, avg: 0, p95: 0 };

  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const p95Index = Math.floor(times.length * 0.95);

  return {
    min: times[0],
    max: times[times.length - 1],
    avg: Math.round(sum / times.length),
    p95: times[Math.min(p95Index, times.length - 1)],
  };
}

// ==================== MAIN BURST TEST ====================

async function runBurstTest() {
  const startTime = Date.now();

  const lastMaxId = readLastMaxId();
  logInfo(`📊 Last max ID from previous run: ${lastMaxId}`);

  const testCounter = readTestCounter() + 1;
  writeTestCounter(testCounter);
  logInfo(`📊 Burst Test #${testCounter} - Starting...`);

  logSection("💥 BURST LOAD TEST (WORST-CASE SIMULTANEOUS SPIKE)");

  console.log(`
╔════════════════════════════════════════════════════════════════════════════════════════════╗
║  CONFIGURATION (BURST MODE - NO DELAYS, NO THROTTLE)              ║
║  ├── User:                ${USER_EMAIL}                             ║
║  ├── Transactions:        ${TOTAL_TRANSACTIONS}                                      ║
║  ├── Payment Modes:       ${PAYMENT_MODES.join(", ")}                                     ║
║  ├── Amount Range:        ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT}                           ║
║  ├── Pay-In Concurrency:  ${PAYIN_BURST_CONCURRENCY} (all at once)                        ║
║  ├── Webhook Concurrency: ${WEBHOOK_BURST_CONCURRENCY} (all at once)                        ║
║  ├── Last Max ID:         ${lastMaxId}                                       ║
║  └── Test Counter:        ${testCounter}                                       ║
╚════════════════════════════════════════════════════════════════════════════════════════════╝
`);

  try {
    logInfo("🔐 Logging in...");
    const { accessToken } = await loginUser();

    // ---------- PHASE 1: Fire ALL pay-in requests simultaneously ----------
    logSection(`🚀 PHASE 1: Firing ${TOTAL_TRANSACTIONS} pay-ins simultaneously`);
    const phase1Start = Date.now();

    const payInOptions = Array.from({ length: TOTAL_TRANSACTIONS }, (_, i) => ({
      paymentMode: PAYMENT_MODES[i % PAYMENT_MODES.length],
      amount: randomAmountInMultiples(MIN_AMOUNT, MAX_AMOUNT),
      customer: randomCustomer(),
      merchantReference: generateMerchantReference(i),
    }));

    const payInResults = await runInParallelBatches(
      payInOptions,
      PAYIN_BURST_CONCURRENCY,
      (options) => createPayIn(accessToken, options),
    );

    const phase1TimeSeconds = (Date.now() - phase1Start) / 1000;
    const payInSuccesses = payInResults.filter((r) => r.success);
    const payInFailures = payInResults.filter((r) => !r.success);
    const payInStats = computeResponseTimeStats(payInResults);

    logSuccess(
      `✅ Phase 1 done: ${payInSuccesses.length}/${TOTAL_TRANSACTIONS} pay-ins succeeded in ${phase1TimeSeconds.toFixed(2)}s`,
    );
    if (payInFailures.length > 0) {
      logWarning(`⚠️ ${payInFailures.length} pay-ins failed`);
      payInFailures.slice(0, 10).forEach((f) => {
        logError(`   ${f.merchantReference}: ${f.error} (status ${f.status})`);
      });
    }

    // ---------- PHASE 2: Fire ALL webhooks simultaneously (only for successful pay-ins) ----------
    logSection(`🚀 PHASE 2: Firing ${payInSuccesses.length} webhooks simultaneously`);
    const phase2Start = Date.now();

    const webhookResults = await runInParallelBatches(
      payInSuccesses,
      WEBHOOK_BURST_CONCURRENCY,
      (payInResult, idx) => fireWebhookBurst(accessToken, payInResult, idx),
    );

    const phase2TimeSeconds = (Date.now() - phase2Start) / 1000;
    const webhookSuccesses = webhookResults.filter((r) => r.success);
    const webhookFailures = webhookResults.filter((r) => !r.success);
    const webhookStats = computeResponseTimeStats(webhookResults);

    logSuccess(
      `✅ Phase 2 done: ${webhookSuccesses.length}/${payInSuccesses.length} webhooks succeeded in ${phase2TimeSeconds.toFixed(2)}s`,
    );
    if (webhookFailures.length > 0) {
      logWarning(`⚠️ ${webhookFailures.length} webhooks failed`);
      webhookFailures.slice(0, 10).forEach((f) => {
        logError(`   ${f.merchantReference}: ${f.error}`);
      });
    }

    // ---------- PHASE 3: DB verification ----------
    logInfo("📡 Fetching DB status counts...");
    const { counts, currentMaxId } = await getDbStatusCounts(lastMaxId);

    logInfo("🔍 Checking wallet ledger for race conditions...");
    const raceConditions = await checkWalletRaceConditions();

    const endTime = Date.now();
    const totalTimeSeconds = (endTime - startTime) / 1000;

    logSection("📊 BURST TEST SUMMARY");

    const summaryText = `
Total Transactions Attempted:  ${TOTAL_TRANSACTIONS}

--- PHASE 1: Pay-In Burst ---
Succeeded:            ${payInSuccesses.length}
Failed:               ${payInFailures.length}
Time Taken:           ${phase1TimeSeconds.toFixed(2)}s
Effective TPS:        ${(TOTAL_TRANSACTIONS / phase1TimeSeconds).toFixed(2)}
Response Time (ms):   min=${payInStats.min} max=${payInStats.max} avg=${payInStats.avg} p95=${payInStats.p95}

--- PHASE 2: Webhook Burst ---
Succeeded:            ${webhookSuccesses.length}
Failed:               ${webhookFailures.length}
Time Taken:           ${phase2TimeSeconds.toFixed(2)}s
Effective TPS:        ${(payInSuccesses.length / phase2TimeSeconds).toFixed(2)}
Response Time (ms):   min=${webhookStats.min} max=${webhookStats.max} avg=${webhookStats.avg} p95=${webhookStats.p95}

--- DB STATUS (records with id > ${lastMaxId}) ---
Success:              ${counts.SUCCESS}
Failed:               ${counts.FAILED}
Pending:              ${counts.PENDING}
Total New Records:    ${counts.total}

--- WALLET RACE CONDITION CHECK ---
Inconsistent Rows:    ${raceConditions === null ? "CHECK FAILED" : raceConditions}
${raceConditions > 0 ? "⚠️  RACE CONDITION DETECTED — wallet openingBalance mismatches prior closingBalance" : raceConditions === 0 ? "✅ No race conditions detected in wallet ledger" : ""}

Total Wall Time:      ${totalTimeSeconds.toFixed(2)}s
============================================================
`;

    console.log(summaryText);
    appendToBurstTestFile(summaryText, testCounter);

    if (currentMaxId > lastMaxId) {
      writeLastMaxId(currentMaxId);
    }

    const fs = require("fs");
    const path = require("path");
    const reportDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      type: "BURST LOAD TEST (WORST-CASE SIMULTANEOUS SPIKE)",
      user: USER_EMAIL,
      testCounter,
      lastMaxId,
      currentMaxId,
      configuration: {
        totalTransactions: TOTAL_TRANSACTIONS,
        paymentModes: PAYMENT_MODES,
        minAmount: MIN_AMOUNT,
        maxAmount: MAX_AMOUNT,
        payInBurstConcurrency: PAYIN_BURST_CONCURRENCY,
        webhookBurstConcurrency: WEBHOOK_BURST_CONCURRENCY,
      },
      phase1_payins: {
        attempted: TOTAL_TRANSACTIONS,
        succeeded: payInSuccesses.length,
        failed: payInFailures.length,
        timeSeconds: phase1TimeSeconds,
        effectiveTps: TOTAL_TRANSACTIONS / phase1TimeSeconds,
        responseTimeStats: payInStats,
        failures: payInFailures.map((f) => ({
          merchantReference: f.merchantReference,
          error: f.error,
          status: f.status,
        })),
      },
      phase2_webhooks: {
        attempted: payInSuccesses.length,
        succeeded: webhookSuccesses.length,
        failed: webhookFailures.length,
        timeSeconds: phase2TimeSeconds,
        effectiveTps: payInSuccesses.length / phase2TimeSeconds,
        responseTimeStats: webhookStats,
        failures: webhookFailures.map((f) => ({
          merchantReference: f.merchantReference,
          error: f.error,
        })),
      },
      dbStatusCounts: counts,
      raceConditionsDetected: raceConditions,
      totalTimeSeconds,
    };

    fs.writeFileSync(
      path.join(reportDir, "burst-test-report.json"),
      JSON.stringify(report, null, 2),
    );
    logSuccess(`📄 Report saved to: reports/burst-test-report.json`);

    return report;
  } catch (error) {
    logError(`❌ Burst test failed: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  runBurstTest()
    .then(() => {
      console.log("\n✅ Burst load test completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Burst test failed:", error.message);
      process.exit(1);
    });
}

module.exports = { runBurstTest };