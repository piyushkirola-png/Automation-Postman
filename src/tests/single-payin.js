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

// const USER_EMAIL = "demo@gmail.com";
// const USER_PASSWORD = "12345678";
// const CLIENT_SECRET =
//   "5bd7b9026ada43e5b79ab436e74578ad:75799b04a077dd66cdc9717a6027fa0ad3e38d85d3bc3e0594d3226fde4110bc9e7814f57de3d3f4bfcb91646df77987bb0039ed31c49e75cf16efc416b3d11421e5a493ebb1840e13a31f7215e7ff04";

// TEST CONFIGURATION
const TOTAL_TRANSACTIONS = 1000;
const PAYMENT_MODES = ["UPI","CARD"];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

const DELAY_BETWEEN_PAYINS_MIN = 0;
const DELAY_BETWEEN_PAYINS_MAX = 0;
const CUSTOMER_PAYMENT_MIN = 0;
const CUSTOMER_PAYMENT_MAX = 0;
const GATEWAY_WEBHOOK_MIN = 0;
const GATEWAY_WEBHOOK_MAX = 0;

// const DELAY_BETWEEN_PAYINS_MIN = 500;
// const DELAY_BETWEEN_PAYINS_MAX = 3000;
// const CUSTOMER_PAYMENT_MIN = 5000;
// const CUSTOMER_PAYMENT_MAX = 60000;
// const GATEWAY_WEBHOOK_MIN = 1000;
// const GATEWAY_WEBHOOK_MAX = 10000;

// CONCURRENCY LIMIT
const MAX_CONCURRENT_WEBHOOKS = 10;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomDelay(min, max) {
  const delay = randomInt(min, max);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

function generateSignature(merchantReference, clientSecret) {
  return crypto
    .createHmac("sha256", clientSecret)
    .update(merchantReference)
    .digest("hex");
}

function generateMerchantReference() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `SIMPLE-${timestamp}-${random}`;
}

// Generate random amount between min and max (rounded to nearest 100)
function randomAmountInMultiples(min, max) {
  // Round min up to nearest 100
  const minRounded = Math.ceil(min / 100) * 100;
  // Round max down to nearest 100
  const maxRounded = Math.floor(max / 100) * 100;

  // If min and max are less than 100, handle edge case
  if (maxRounded < 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Generate random amount in multiples of 100
  const randomSteps = Math.floor(
    Math.random() * ((maxRounded - minRounded) / 100 + 1),
  );
  const amount = minRounded + randomSteps * 100;

  // Ensure amount is within bounds
  return Math.min(Math.max(amount, min), max);
}

function randomCustomer() {
  const firstNames = [
    "John",
    "Emma",
    "Michael",
    "Sophia",
    "William",
    "Olivia",
    "James",
    "Ava",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
  ];
  const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(100, 999)}@${domains[Math.floor(Math.random() * domains.length)]}`;
  const phone = `+91${randomInt(7000000000, 9999999999)}`;

  return { name, email, phone };
}

let activeWebhooks = 0;

async function withConcurrencyLimit(fn) {
  while (activeWebhooks >= MAX_CONCURRENT_WEBHOOKS) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  activeWebhooks++;
  try {
    return await fn();
  } finally {
    activeWebhooks--;
  }
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

    logInfo(
      `Creating Pay-In: ${merchantReference} | ${paymentMode} | ₹${amount}`,
    );

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-signature": signature,
      },
    });

    logSuccess(
      `✅ Pay-In created: ID ${response.data.id} | Status: ${response.data.status}`,
    );

    return {
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
    logError(`❌ Pay-In failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// ==================== LAST ID FUNCTIONS ====================

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

// ==================== TEST COUNTER FUNCTIONS ====================

function getTestCounterFilePath() {
  const path = require("path");
  return path.join(__dirname, "../../test-counter.txt");
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
    logWarning(`Could not read test-counter.txt: ${error.message}`);
  }
  return 0;
}

function writeTestCounter(counter) {
  const fs = require("fs");
  const filePath = getTestCounterFilePath();
  try {
    fs.writeFileSync(filePath, String(counter));
  } catch (error) {
    logError(`Failed to write test-counter.txt: ${error.message}`);
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
      if (
        status === "SUCCESS" ||
        status === "COMPLETED" ||
        status === "PAID" ||
        status === "CAPTURED"
      ) {
        counts.SUCCESS += parseInt(row.count);
      } else if (
        status === "FAILED" ||
        status === "ERROR" ||
        status === "DECLINED" ||
        status === "REJECTED"
      ) {
        counts.FAILED += parseInt(row.count);
      } else if (
        status === "PENDING" ||
        status === "INITIATED" ||
        status === "PROCESSING"
      ) {
        counts.PENDING += parseInt(row.count);
      } else {
        counts.PENDING += parseInt(row.count);
      }
      counts.total += parseInt(row.count);
    }

    // Get max ID after test
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

// ==================== APPEND TO FILE WITH COUNTER ====================

function appendToPayinTestFile(summaryText, testNumber) {
  const fs = require("fs");
  const path = require("path");
  const filePath = path.join(__dirname, "../../payin-test.txt");
  const MAX_ENTRIES = 10;

  try {
    // Read existing content
    let content = "";
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf8");
    }

    // Split content by separators to count entries
    const entries = content.split(/={60,}/).filter((entry) => entry.trim());

    // Keep only last (MAX_ENTRIES - 1) entries (since we're adding one more)
    let newContent = "";
    if (entries.length >= MAX_ENTRIES) {
      // Get last MAX_ENTRIES - 1 entries
      const keepEntries = entries.slice(-(MAX_ENTRIES - 1));
      newContent = keepEntries.join(
        "============================================================",
      );
      // Ensure proper separator at the end if there are entries
      if (keepEntries.length > 0) {
        newContent =
          "============================================================" +
          newContent;
      }
    } else {
      newContent = content;
    }

    // Add the new summary with TEST #X
    const separator =
      "============================================================";
    const newEntry = `
${separator}
TEST #${testNumber} - ${new Date().toLocaleString()}
${separator}
${summaryText}
`;

    // Write back only last MAX_ENTRIES
    fs.writeFileSync(filePath, newContent + newEntry);
    logSuccess(
      `📄 Appended TEST #${testNumber} to: payin-test.txt (keeping last ${MAX_ENTRIES})`,
    );
  } catch (error) {
    logError(`Failed to append to payin-test.txt: ${error.message}`);
  }
}

async function runSingleTransaction(accessToken, transactionIndex) {
  const paymentMode = PAYMENT_MODES[transactionIndex % PAYMENT_MODES.length];
  const amount = randomAmountInMultiples(MIN_AMOUNT, MAX_AMOUNT);
  const customer = randomCustomer();
  const merchantReference = generateMerchantReference();

  logInfo(`\n📌 Transaction #${transactionIndex + 1}: ${merchantReference}`);

  try {
    // Step 1: Create Pay-In
    const payInResult = await createPayIn(accessToken, {
      paymentMode,
      amount,
      customer,
      merchantReference,
    });

    // Step 2: Customer pays (FAST - 0.5 to 2 seconds)
    const customerDelay = await randomDelay(
      CUSTOMER_PAYMENT_MIN,
      CUSTOMER_PAYMENT_MAX,
    );
    logInfo(`👤 Customer took ${customerDelay}ms to complete payment...`);

    // Step 3: Detect gateway
    const gateway = detectGateway(payInResult.response);
    if (gateway) {
      logInfo(`✅ Gateway detected: ${gateway}`);
    } else {
      logWarning(`⚠️ Could not detect gateway for ${merchantReference}`);
    }

    // Step 4: Trigger webhook with concurrency limit (FAST - 0.3 to 1 second)
    const webhookResult = await withConcurrencyLimit(async () => {
      return await triggerWebhookForPayIn(
        payInResult,
        "SUCCESS",
        GATEWAY_WEBHOOK_MIN,
        GATEWAY_WEBHOOK_MAX,
      );
    });

    const success = webhookResult && webhookResult.success;

    return {
      success: true,
      passed: success,
      transactionIndex: transactionIndex + 1,
      merchantReference,
      paymentMode,
      amount,
      customer,
      gateway: gateway || "Unknown",
      transactionId: payInResult.response.id,
      customerDelay,
      gatewayDelay: webhookResult?.gatewayDelay || 0,
      webhookSuccess: success,
      error: null,
    };
  } catch (error) {
    logError(
      `❌ Transaction #${transactionIndex + 1} failed: ${error.message}`,
    );
    return {
      success: false,
      passed: false,
      transactionIndex: transactionIndex + 1,
      merchantReference,
      paymentMode,
      amount,
      customer,
      gateway: null,
      transactionId: null,
      customerDelay: 0,
      gatewayDelay: 0,
      webhookSuccess: false,
      error: error.message,
    };
  }
}

async function runSimplePayinWebhookTest() {
  const startTime = Date.now();

  // Read last max ID before test
  const lastMaxId = readLastMaxId();
  logInfo(`📊 Last max ID from previous run: ${lastMaxId}`);

  // Read and increment test counter
  const testCounter = readTestCounter() + 1;
  writeTestCounter(testCounter);
  logInfo(`📊 Test #${testCounter} - Starting...`);

  logSection("🚀 SIMPLE PAY-IN + WEBHOOK TEST (FAST MODE)");

  console.log(`
╔════════════════════════════════════════════════════════════════════════════════════════════╗
║  CONFIGURATION (FAST MODE)                                        ║
║  ├── User:           ${USER_EMAIL}                                  ║
║  ├── Transactions:   ${TOTAL_TRANSACTIONS}                                           ║
║  ├── Payment Modes:  ${PAYMENT_MODES.join(", ")}                                          ║
║  ├── Amount Range:   ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT} (multiples of 100)              ║
║  ├── Customer Delay: ${CUSTOMER_PAYMENT_MIN / 1000}-${CUSTOMER_PAYMENT_MAX / 1000}s (FAST)    ║
║  ├── Gateway Delay:  ${GATEWAY_WEBHOOK_MIN / 1000}-${GATEWAY_WEBHOOK_MAX / 1000}s (FAST)      ║
║  ├── Last Max ID:    ${lastMaxId}                                           ║
║  ├── Test Counter:   ${testCounter}                                           ║
║  └── Max Webhooks:   ${MAX_CONCURRENT_WEBHOOKS}                                           ║
╚════════════════════════════════════════════════════════════════════════════════════════════╝
`);

  try {
    // Step 1: Login
    logInfo("🔐 Logging in...");
    const { accessToken } = await loginUser();

    // Step 2: Run all transactions sequentially with delays
    const results = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
      // Delay between transactions (except first)
      if (i > 0) {
        const delayMs = await randomDelay(
          DELAY_BETWEEN_PAYINS_MIN,
          DELAY_BETWEEN_PAYINS_MAX,
        );
        logInfo(`⏳ Waiting ${delayMs}ms before next transaction...`);
      }

      const result = await runSingleTransaction(accessToken, i);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    // Step 3: Show summary
    const endTime = Date.now();
    const totalTimeSeconds = (endTime - startTime) / 1000;
    const passRate =
      TOTAL_TRANSACTIONS > 0
        ? ((passed / TOTAL_TRANSACTIONS) * 100).toFixed(1)
        : 0;

    // Step 4: Get DB status counts
    logInfo("📡 Fetching DB status counts...");
    const { counts, currentMaxId } = await getDbStatusCounts(lastMaxId);

    logSection("📊 TEST SUMMARY");

    const summaryText = `
Total Transactions:  ${TOTAL_TRANSACTIONS}
Passed:              ${passed}
Failed:              ${failed}
Pass Rate:           ${passRate}%
Total Time:          ${totalTimeSeconds.toFixed(2)} seconds
TPS:                 ${(TOTAL_TRANSACTIONS / totalTimeSeconds).toFixed(2)}

DB Status Count:
Success:             ${counts.SUCCESS}
Failed:              ${counts.FAILED}
Pending:             ${counts.PENDING}
Total New Records:   ${counts.total}
============================================================
`;

    console.log(summaryText);

    // Step 5: Append to payin-test.txt with test counter
    appendToPayinTestFile(summaryText, testCounter);

    // Step 6: Save new max ID
    if (currentMaxId > lastMaxId) {
      writeLastMaxId(currentMaxId);
    }

    // Step 7: Save report JSON
    const fs = require("fs");
    const path = require("path");
    const reportDir = path.join(__dirname, "../../reports");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      type: "SIMPLE PAY-IN + WEBHOOK TEST (FAST MODE)",
      user: USER_EMAIL,
      testCounter: testCounter,
      lastMaxId: lastMaxId,
      currentMaxId: currentMaxId,
      configuration: {
        totalTransactions: TOTAL_TRANSACTIONS,
        paymentModes: PAYMENT_MODES,
        minAmount: MIN_AMOUNT,
        maxAmount: MAX_AMOUNT,
        customerDelay: `${CUSTOMER_PAYMENT_MIN / 1000}-${CUSTOMER_PAYMENT_MAX / 1000}s (FAST)`,
        gatewayDelay: `${GATEWAY_WEBHOOK_MIN / 1000}-${GATEWAY_WEBHOOK_MAX / 1000}s (FAST)`,
        maxConcurrentWebhooks: MAX_CONCURRENT_WEBHOOKS,
      },
      results: results,
      dbStatusCounts: counts,
      summary: {
        total: TOTAL_TRANSACTIONS,
        passed: passed,
        failed: failed,
        passRate: `${passRate}%`,
        totalTimeSeconds: totalTimeSeconds,
        tps: (TOTAL_TRANSACTIONS / totalTimeSeconds).toFixed(2),
      },
    };

    fs.writeFileSync(
      path.join(reportDir, "simple-payin-webhook-report.json"),
      JSON.stringify(report, null, 2),
    );
    logSuccess(`📄 Report saved to: reports/simple-payin-webhook-report.json`);

    return report;
  } catch (error) {
    logError(`❌ Test failed: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  runSimplePayinWebhookTest()
    .then(() => {
      console.log("\n✅ Simple Pay-In + Webhook test completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Test failed:", error.message);
      process.exit(1);
    });
}

module.exports = { runSimplePayinWebhookTest };
