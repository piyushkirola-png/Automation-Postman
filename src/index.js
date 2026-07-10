const { testPriorityRouting } = require("./tests/01-priority-routing");
const { testFailoverRouting } = require("./tests/02-failover-routing");
const { testHybridRouting } = require("./tests/03-hybrid-routing");
const { testDefaultRouting } = require("./tests/04-default-routing");
const { testRetryLogic } = require("./tests/05-retry-logic");
const { testMDRCalculation } = require("./tests/06-mdr-calculation");
const { testWebhookProcessing } = require("./tests/07-webhook-processing");
const { testEndToEndFlow } = require("./tests/08-end-to-end-flow");
const { testMixedStatus } = require("./tests/09-mixed-status");
const { testUnifiedRouting } = require("./tests/10-unified-routing-test");
const { logSection, logSuccess, logError, logInfo } = require("./utils/logger");
const fs = require("fs");
const path = require("path");

async function runAllTests() {
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║     🚀 PAY-IN ROUTING LOGIC AUTOMATION TEST SUITE         ║
  ║                                                            ║
  ║     Testing: Priority | Failover | Hybrid | Default        ║
  ║              Retry | MDR | Webhook | End-to-End           ║
  ║              Mixed Status | Unified (NEW!)               ║
  ║                                                            ║
  ║     Start Time: ${new Date().toLocaleString()}                     ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
  `);

  const results = {};
  let totalTests = 0;
  let totalPassed = 0;

  try {
    // Test 1: Priority Routing
    const r1 = await testPriorityRouting();
    results.priorityRouting = r1;
    totalTests += r1.total || 0;
    totalPassed += r1.passed || 0;

    // Test 2: Failover Routing
    const r2 = await testFailoverRouting();
    results.failoverRouting = r2;

    // Test 3: Hybrid Routing
    const r3 = await testHybridRouting();
    results.hybridRouting = r3;
    totalTests += r3.total || 0;
    totalPassed += r3.passed || 0;

    // Test 4: Default Routing
    const r4 = await testDefaultRouting();
    results.defaultRouting = r4;

    // Test 5: Retry Logic
    const r5 = await testRetryLogic();
    results.retryLogic = r5;

    // Test 6: MDR Calculation
    const r6 = await testMDRCalculation();
    results.mdrCalculation = r6;
    totalTests += r6.total || 0;
    totalPassed += r6.passed || 0;

    // Test 7: Webhook Processing
    const r7 = await testWebhookProcessing();
    results.webhookProcessing = r7;
    totalTests += r7.total || 0;
    totalPassed += r7.passed || 0;

    // Test 8: End-to-End Flow
    const r8 = await testEndToEndFlow();
    results.endToEndFlow = r8;

    // Test 9: Mixed Status
    const r9 = await testMixedStatus();
    results.mixedStatus = r9;
    totalTests += r9.total || 0;
    totalPassed += r9.passed || 0;

    // ==============================================
    // TEST 10: UNIFIED ROUTING TEST (NEW!)
    // ==============================================
    const r10 = await testUnifiedRouting();
    results.unifiedRouting = r10;

    // Calculate unified test stats
    if (r10 && r10.summary) {
      totalTests += r10.summary.totalTransactions || 0;
      totalPassed += r10.summary.passed || 0;
    }
    // ==============================================

  } catch (error) {
    logError(`Test suite failed: ${error.message}`);
  }

  // Generate Final Report
  logSection("📊 FINAL TEST REPORT");
  console.log(`
  ┌─────────────────────────────────────────────────────────────────────┐
  │                     TEST SUMMARY                                    │
  ├─────────────────────────────────────────────────────────────────────┤
  │  Total Tests Run:   ${String(totalTests).padStart(5)}                                                  │
  │  Tests Passed:      ${String(totalPassed).padStart(5)}                                                 │
  │  Tests Failed:      ${String(totalTests - totalPassed).padStart(5)}                                    │
  │  Pass Rate:         ${((totalPassed / totalTests) * 100 || 0).toFixed(1).padStart(5)}%                 │
  │                                                                                                        │
  │  Status:            ${totalPassed === totalTests ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}    │
  └─────────────────────────────────────────────────────────────────────┘
  `);

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: totalPassed,
      failed: totalTests - totalPassed,
      passRate: `${((totalPassed / totalTests) * 100 || 0).toFixed(1)}%`,
    },
    results,
  };

  const reportDir = path.join(__dirname, "../reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportDir, "test-report.json"),
    JSON.stringify(report, null, 2),
  );

  logSuccess(`📄 Report saved to: reports/test-report.json`);

  return report;
}

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log("\n✅ Test suite completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test suite failed:", error.message);
      process.exit(1);
    });
}

module.exports = { runAllTests };