// ============================================================
// FILE: test-all-payment-modes.js
// LOCATION: C:\Users\DELL\Desktop\Automation\src\
// ============================================================

const axios = require("axios");
require("dotenv").config();
const { loginUser } = require("./api/auth");
const { triggerWebhookForPayIn } = require("./utils/webhook-trigger");
const { randomAmount, randomCustomer } = require("./utils/random");
const { logSection, logSuccess, logError, logInfo } = require("./utils/logger");
const config = require("./config");
const {
  generateSignature,
  generateMerchantReference,
} = require("./utils/crypto");

// ============================================================
// 🔥 READ CONFIGURATION FROM .env
// ============================================================

// ✅ Number of transactions per payment mode
const TRANSACTIONS_PER_MODE = parseInt(process.env.ITERATIONS_PER_MODE) || 1;

// ✅ Payment modes to test
const PAYMENT_MODES = (
  process.env.PAYMENT_MODES || "UPI,CARD,WALLET,NETBANKING"
).split(",");

// ✅ Amount range
const MIN_AMOUNT = parseInt(process.env.MIN_AMOUNT) || 1000;
const MAX_AMOUNT = parseInt(process.env.MAX_AMOUNT) || 10000;

// ✅ Merchants to test
const MERCHANTS = [
  {
    merchantId: 1,
    email: "amanpandey@gmail.com",
    password: "12345678",
    expectedGateway: "Razorpay",
  },
  {
    merchantId: 2,
    email: "soniakalonia@gmail.com",
    password: "12345678",
    expectedGateway: "Adyen",
  },
  {
    merchantId: 3,
    email: "piyushkirola@gmail.com",
    password: "12345678",
    expectedGateway: "Razorpay",
  },
  {
    merchantId: 4,
    email: "rajeshkhanna@gmail.com",
    password: "12345678",
    expectedGateway: "Cashfree",
  },
  {
    merchantId: 5,
    email: "raghunathmishra@gmail.com",
    password: "12345678",
    expectedGateway: "Razorpay",
  },
];

// ============================================================
// DISPLAY CONFIGURATION
// ============================================================
console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║  📋 TEST CONFIGURATION                                          ║
╠═══════════════════════════════════════════════════════════════════╣
║  BASE_URL:              ${config.BASE_URL}                       ║
║  Transactions per mode: ${TRANSACTIONS_PER_MODE}                 ║
║  Payment Modes:         ${PAYMENT_MODES.join(", ")}              ║
║  Amount Range:          ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT}          ║
║  Merchants:             ${MERCHANTS.map((m) => m.merchantId).join(", ")}    ║
║  Total Transactions:    ${MERCHANTS.length * PAYMENT_MODES.length * TRANSACTIONS_PER_MODE}    ║
╚═══════════════════════════════════════════════════════════════════╝
`);

// ============================================================
// 🔥 CUSTOM PAY-IN FUNCTION
// ============================================================
async function createCustomPayIn(accessToken, clientSecret, options = {}) {
  const url = `${config.BASE_URL}${config.API_PATHS.PAYIN}`;

  const merchantReference =
    options.merchantReference || generateMerchantReference();
  const signature = generateSignature(merchantReference, clientSecret);
  const customer = options.customer || randomCustomer();
  const amount = options.amount || randomAmount(MIN_AMOUNT, MAX_AMOUNT);
  const currency = options.currency || "INR";
  const paymentMode = options.paymentMode || "UPI";

  // Build base payload
  const payload = {
    amount,
    currency,
    merchantReference,
    paymentMode,
    customer,
  };

  // Add mode-specific details
  if (paymentMode === "CARD" && options.cardDetails) {
    payload.card = {
      number: options.cardDetails.cardNumber,
      expiryMonth: options.cardDetails.cardExpiryMonth,
      expiryYear: options.cardDetails.cardExpiryYear,
      cvv: options.cardDetails.cardCvv,
      holderName: options.cardDetails.cardHolderName || customer.name,
    };
  }

  if (paymentMode === "UPI" && options.upiDetails) {
    payload.upi = {
      vpa: options.upiDetails.vpa || "test@okhdfcbank",
      name: options.upiDetails.name || customer.name,
    };
  }

  if (paymentMode === "WALLET" && options.walletDetails) {
    payload.wallet = {
      provider: options.walletDetails.provider || "Paytm",
      phone: options.walletDetails.phone || customer.phone,
    };
  }

  if (paymentMode === "NETBANKING" && options.netbankingDetails) {
    payload.netbanking = {
      bankCode: options.netbankingDetails.bankCode || "SBIN",
      bankName: options.netbankingDetails.bankName || "State Bank of India",
    };
  }

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

  return {
    request: { payload, merchantReference, amount, paymentMode, customer },
    response: response.data,
  };
}

// ============================================================
// 🔥 GENERATE MOCK DETAILS FOR EACH PAYMENT MODE
// ============================================================
function getMockCardDetails() {
  const cardNetworks = ["Visa", "Mastercard", "Amex", "RuPay"];
  const network = cardNetworks[Math.floor(Math.random() * cardNetworks.length)];
  const cardNumbers = {
    Visa: "4111111111111111",
    Mastercard: "5555555555554444",
    Amex: "378282246310005",
    RuPay: "6521310000000000",
  };
  return {
    cardNumber: cardNumbers[network] || "4111111111111111",
    cardExpiryMonth: String(Math.floor(Math.random() * 12) + 1).padStart(
      2,
      "0",
    ),
    cardExpiryYear: String(2026 + Math.floor(Math.random() * 5)),
    cardCvv: String(Math.floor(Math.random() * 900) + 100),
    cardHolderName: "Test User",
    cardNetwork: network,
  };
}

function getMockUpiDetails() {
  const upiProviders = ["okhdfcbank", "okicici", "oksbi", "paytm", "gpay"];
  const provider =
    upiProviders[Math.floor(Math.random() * upiProviders.length)];
  const name = ["test", "pay", "user", "merchant", "customer"][
    Math.floor(Math.random() * 5)
  ];
  return {
    vpa: `${name}${Math.floor(Math.random() * 1000)}@${provider}`,
    name: "Test User",
  };
}

function getMockWalletDetails() {
  const providers = [
    "Paytm",
    "Google Pay",
    "PhonePe",
    "Amazon Pay",
    "Mobikwik",
  ];
  return {
    provider: providers[Math.floor(Math.random() * providers.length)],
    phone: `+91${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
  };
}

function getMockNetbankingDetails() {
  const banks = [
    { code: "SBIN", name: "State Bank of India" },
    { code: "HDFC", name: "HDFC Bank" },
    { code: "ICICI", name: "ICICI Bank" },
    { code: "AXIS", name: "Axis Bank" },
    { code: "KOTAK", name: "Kotak Mahindra Bank" },
  ];
  const bank = banks[Math.floor(Math.random() * banks.length)];
  return {
    bankCode: bank.code,
    bankName: bank.name,
  };
}

function getModeDetails(paymentMode) {
  switch (paymentMode) {
    case "CARD":
      return { cardDetails: getMockCardDetails() };
    case "UPI":
      return { upiDetails: getMockUpiDetails() };
    case "WALLET":
      return { walletDetails: getMockWalletDetails() };
    case "NETBANKING":
      return { netbankingDetails: getMockNetbankingDetails() };
    default:
      return {};
  }
}

// ============================================================
// MAIN TEST FUNCTION
// ============================================================
async function testAllPaymentModes() {
  console.log(`
  ╔═══════════════════════════════════════════════════════════════════╗
  ║                                                                   ║
  ║     💳 ALL PAYMENT MODES TEST - 5 GATEWAYS + WEBHOOKS           ║
  ║                                                                   ║
  ║     Testing: ${PAYMENT_MODES.join(" | ")}                        ║
  ║     Gateways: Razorpay | Cashfree | Adyen | Chargebee | Bennupay ║
  ║     Transactions per mode: ${TRANSACTIONS_PER_MODE}               ║
  ║     Amount Range: ₹${MIN_AMOUNT} - ₹${MAX_AMOUNT}                 ║
  ║                                                                   ║
  ╚═══════════════════════════════════════════════════════════════════╝
  `);

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  for (const merchant of MERCHANTS) {
    logSection(
      `🧪 TESTING MERCHANT ${merchant.merchantId} → Expected: ${merchant.expectedGateway}`,
    );

    try {
      const loginData = await loginUser(merchant.email, merchant.password);
      const { accessToken, clientSecret } = loginData;
      logSuccess(`✅ Logged in successfully`);

      const merchantResults = [];

      // Loop through ALL payment modes
      for (const paymentMode of PAYMENT_MODES) {
        logInfo(`\n📌 Testing ${paymentMode}...`);

        const modeTransactions = [];
        let modePassed = 0;
        let modeFailed = 0;

        // 🔥 Use TRANSACTIONS_PER_MODE from .env
        for (let i = 0; i < TRANSACTIONS_PER_MODE; i++) {
          const amount = randomAmount(MIN_AMOUNT, MAX_AMOUNT);
          const customer = randomCustomer();
          const merchantReference = `${paymentMode}-${merchant.merchantId}-${Date.now()}-${i}`;
          const modeDetails = getModeDetails(paymentMode);

          logInfo(
            `  📝 Transaction ${i + 1}: ${paymentMode} payment of ₹${amount}`,
          );

          try {
            const payInResult = await createCustomPayIn(
              accessToken,
              clientSecret,
              {
                amount,
                customer,
                merchantReference,
                paymentMode,
                ...modeDetails,
              },
            );

            logInfo(`    Transaction ID: ${payInResult.response.id}`);
            logInfo(`    Status: ${payInResult.response.status}`);

            // Trigger webhook
            logInfo(`    📨 Triggering webhook...`);
            const webhookResult = await triggerWebhookForPayIn(
              payInResult,
              "SUCCESS",
            );

            // Detect gateway
            let actualGateway = "Unknown";
            let detectedGatewayId = null;

            if (payInResult.response.gatewayId) {
              detectedGatewayId = payInResult.response.gatewayId;
              const gatewayMap = {
                1: "Razorpay",
                2: "Cashfree",
                3: "Adyen",
                4: "Chargebee",
                5: "Bennupay",
              };
              actualGateway = gatewayMap[detectedGatewayId] || "Unknown";
            } else if (payInResult.response.intent) {
              try {
                const intent = JSON.parse(payInResult.response.intent);
                if (intent.key && intent.key.startsWith("rzp_test")) {
                  actualGateway = "Razorpay";
                  detectedGatewayId = 1;
                } else if (intent.paymentSessionId) {
                  actualGateway = "Cashfree";
                  detectedGatewayId = 2;
                } else if (intent.pspReference) {
                  actualGateway = "Adyen";
                  detectedGatewayId = 3;
                } else if (intent.chargebee_id || intent.cb_token) {
                  actualGateway = "Chargebee";
                  detectedGatewayId = 4;
                } else if (intent.bennupay_token || intent.bp_session) {
                  actualGateway = "Bennupay";
                  detectedGatewayId = 5;
                }
              } catch (e) {}
            }

            const isCorrect = actualGateway === merchant.expectedGateway;
            const webhookSuccess = webhookResult && webhookResult.success;

            const transactionResult = {
              success: true,
              paymentMode,
              iteration: i + 1,
              amount,
              merchantReference,
              transactionId: payInResult.response.id,
              expectedGateway: merchant.expectedGateway,
              actualGateway,
              isRoutingCorrect: isCorrect,
              webhookTriggered: webhookSuccess,
              passed: isCorrect && webhookSuccess,
            };

            modeTransactions.push(transactionResult);

            if (isCorrect && webhookSuccess) {
              logSuccess(
                `    ✅ ${paymentMode} → ${actualGateway} | Webhook: ✅ | PASS`,
              );
              modePassed++;
              totalPassed++;
            } else {
              logError(
                `    ❌ ${paymentMode} → Expected: ${merchant.expectedGateway}, Got: ${actualGateway} | Webhook: ${webhookSuccess ? "✅" : "❌"} | FAIL`,
              );
              modeFailed++;
              totalFailed++;
            }
          } catch (error) {
            logError(`    ❌ Transaction ${i + 1} failed: ${error.message}`);
            modeTransactions.push({
              success: false,
              paymentMode,
              iteration: i + 1,
              error: error.message,
              passed: false,
            });
            modeFailed++;
            totalFailed++;
          }
        }

        merchantResults.push({
          paymentMode,
          transactions: modeTransactions,
          summary: {
            total: modeTransactions.length,
            passed: modePassed,
            failed: modeFailed,
          },
        });

        const modePassRate =
          modeTransactions.length > 0
            ? ((modePassed / modeTransactions.length) * 100).toFixed(0)
            : 0;
        logInfo(
          `  📊 ${paymentMode}: ${modePassed}/${modeTransactions.length} PASSED (${modePassRate}%)`,
        );
      }

      results.push({
        merchantId: merchant.merchantId,
        expectedGateway: merchant.expectedGateway,
        results: merchantResults,
        summary: {
          total: merchantResults.reduce((sum, m) => sum + m.summary.total, 0),
          passed: merchantResults.reduce((sum, m) => sum + m.summary.passed, 0),
          failed: merchantResults.reduce((sum, m) => sum + m.summary.failed, 0),
        },
      });
    } catch (error) {
      logError(
        `❌ Merchant ${merchant.merchantId} test failed: ${error.message}`,
      );
      results.push({
        merchantId: merchant.merchantId,
        error: error.message,
        summary: { total: 0, passed: 0, failed: 0 },
      });
    }
  }

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  logSection("📊 FINAL SUMMARY - ALL PAYMENT MODES");

  console.log(
    "\n┌─────────────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│                    MERCHANT RESULTS                                   │",
  );
  console.log(
    "├─────────────────────────────────────────────────────────────────────┤",
  );

  for (const result of results) {
    if (result.error) {
      console.log(
        `│ Merchant ${result.merchantId} → ERROR: ${result.error.padEnd(30)} │`,
      );
      continue;
    }
    const status = result.summary.failed === 0 ? "✅ PASS" : "❌ FAIL";
    console.log(
      `│ Merchant ${result.merchantId} → ${result.expectedGateway.padEnd(12)} │ Total: ${String(result.summary.total).padStart(3)} │ Pass: ${String(result.summary.passed).padStart(3)} │ Fail: ${String(result.summary.failed).padStart(3)} │ ${status} │`,
    );
  }

  console.log(
    "├─────────────────────────────────────────────────────────────────────┤",
  );
  console.log(
    "│                    BREAKDOWN BY PAYMENT MODE                        │",
  );
  console.log(
    "├─────────────────────────────────────────────────────────────────────┤",
  );

  const modeTotals = {};
  for (const result of results) {
    if (result.results) {
      for (const modeResult of result.results) {
        const mode = modeResult.paymentMode;
        if (!modeTotals[mode]) {
          modeTotals[mode] = { total: 0, passed: 0, failed: 0 };
        }
        modeTotals[mode].total += modeResult.summary.total;
        modeTotals[mode].passed += modeResult.summary.passed;
        modeTotals[mode].failed += modeResult.summary.failed;
      }
    }
  }

  for (const [mode, totals] of Object.entries(modeTotals)) {
    const status = totals.failed === 0 ? "✅" : "❌";
    const passRate =
      totals.total > 0 ? ((totals.passed / totals.total) * 100).toFixed(1) : 0;
    console.log(
      `│ ${mode.padEnd(12)} │ Total: ${String(totals.total).padStart(3)} │ Pass: ${String(totals.passed).padStart(3)} │ Fail: ${String(totals.failed).padStart(3)} │ ${passRate}% │ ${status} │`,
    );
  }

  console.log(
    "├─────────────────────────────────────────────────────────────────────┤",
  );

  const totalTests = totalPassed + totalFailed;
  const passRate =
    totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
  console.log(
    `│ ${"OVERALL".padEnd(45)} │ Total: ${String(totalTests).padStart(3)} │ Pass: ${String(totalPassed).padStart(3)} │ Fail: ${String(totalFailed).padStart(3)} │ ${passRate}% │`,
  );
  console.log(
    "└─────────────────────────────────────────────────────────────────────┘",
  );

  // Save report
  const fs = require("fs");
  const path = require("path");

  const report = {
    timestamp: new Date().toISOString(),
    testName: "All Payment Modes Test",
    config: {
      baseUrl: config.BASE_URL,
      transactionsPerMode: TRANSACTIONS_PER_MODE,
      paymentModes: PAYMENT_MODES,
      minAmount: MIN_AMOUNT,
      maxAmount: MAX_AMOUNT,
      merchants: MERCHANTS.map((m) => m.merchantId),
    },
    results: results,
    modeTotals: modeTotals,
    summary: {
      totalTests,
      passed: totalPassed,
      failed: totalFailed,
      passRate: `${passRate}%`,
    },
  };

  const reportDir = path.join(__dirname, "../reports");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, "all-payment-modes-report.json"),
    JSON.stringify(report, null, 2),
  );
  logSuccess(`\n📄 Report saved to: reports/all-payment-modes-report.json`);

  return report;
}

// ============================================================
// RUN THE TEST
// ============================================================
if (require.main === module) {
  testAllPaymentModes()
    .then(() => {
      console.log("\n✅ ALL PAYMENT MODES test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error.message);
      process.exit(1);
    });
}

module.exports = { testAllPaymentModes };
