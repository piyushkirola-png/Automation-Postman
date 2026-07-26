const { loginUser } = require("../api/auth");
const { createPayIn } = require("../api/payin");
const { randomCustomer } = require("../utils/random");
const {
  logSection,
  logSuccess,
  logError,
  logInfo,
} = require("../utils/logger");
const { triggerWebhookForPayIn } = require("../utils/webhook-trigger");

/**
 * Test MDR/Fee Calculation
 * Verifies fees are calculated correctly based on gateway pricing
 */
async function testMDRCalculation() {
  logSection("TEST 6: MDR/FEE CALCULATION");

  const user = {
    email: "amanpandey@gmail.com",
    password: "12345678",
    merchantId: 1,
  };

  logInfo(`Testing MDR calculation for Merchant ${user.merchantId}`);

  const testCases = [
    {
      amount: 1000,
      paymentMode: "CARD",
      expectedFee: 15,
      expectedCredit: 982.3,
    },
    { amount: 500, paymentMode: "UPI", expectedFee: 9, expectedCredit: 489.38 },
    {
      amount: 2000,
      paymentMode: "CARD",
      expectedFee: 30,
      expectedCredit: 1964.6,
    },
    {
      amount: 100,
      paymentMode: "UPI",
      expectedFee: 1.8,
      expectedCredit: 97.88,
    },
  ];

  try {
    const loginData = await loginUser(user.email, user.password);
    const { accessToken, clientSecret } = loginData;

    const results = [];

    for (const testCase of testCases) {
      const customer = randomCustomer();
      const merchantReference = `ORD-MDR-${Date.now()}`;

      try {
        const result = await createPayIn(accessToken, clientSecret, {
          amount: testCase.amount,
          paymentMode: testCase.paymentMode,
          customer,
          merchantReference,
        });
        // ✅ AUTO-TRIGGER WEBHOOK
        await triggerWebhookForPayIn(result, "SUCCESS");

        const actualFee = parseFloat(result.response.feeAmount) || 0;
        const amountToCredit = parseFloat(result.response.amountToCredit) || 0;
        const expectedCredit = testCase.expectedCredit;

        const feeMatches = Math.abs(actualFee - testCase.expectedFee) < 0.01;
        const creditMatches = Math.abs(amountToCredit - expectedCredit) < 0.01;

        results.push({
          amount: testCase.amount,
          paymentMode: testCase.paymentMode,
          expectedFee: testCase.expectedFee,
          actualFee,
          expectedCredit,
          amountToCredit,
          feeMatches,
          creditMatches,
          passed: feeMatches && creditMatches,
          merchantReference,
        });

        if (feeMatches && creditMatches) {
          logSuccess(
            `  ✅ ${testCase.paymentMode} ₹${testCase.amount} → Fee: ₹${actualFee}, Credit: ₹${amountToCredit} (PASS)`,
          );
        } else {
          logError(
            `  ❌ ${testCase.paymentMode} ₹${testCase.amount} → Expected Fee: ₹${testCase.expectedFee}, Got: ₹${actualFee} | Expected Credit: ₹${expectedCredit}, Got: ₹${amountToCredit} (FAIL)`,
          );
        }
      } catch (error) {
        logError(
          `  ❌ ${testCase.paymentMode} ₹${testCase.amount} → Error: ${error.message}`,
        );
        results.push({
          ...testCase,
          passed: false,
          error: error.message,
        });
      }
    }

    logSection("MDR CALCULATION RESULTS");
    const passed = results.filter((r) => r.passed).length;
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${results.length - passed}`);

    return { results, passed, total: results.length };
  } catch (error) {
    logError(`MDR calculation test failed: ${error.message}`);
    throw error;
  }
}

module.exports = { testMDRCalculation };
