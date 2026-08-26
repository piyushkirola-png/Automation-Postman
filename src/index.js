const { testUnifiedRouting } = require("./tests/unified-routing-test");
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
  ║              Mixed Status | Unified | Stripe+PayU (NEW!)   ║
  ║                                                            ║
  ║     Start Time: ${new Date().toLocaleString()}                     ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
  `);

  const results = {};
  let totalTests = 0;
  let totalPassed = 0;

  try {
    // Unified Routing
    const r10 = await testUnifiedRouting();
    results.unifiedRouting = r10;

    // Calculate unified test stats
    if (r10 && r10.summary) {
      totalTests += r10.summary.totalTransactions || 0;
      totalPassed += r10.summary.passed || 0;
    }

    // Stripe + PayU Routing
    const r11 = await testStripePayuRouting();
    results.stripePayuRouting = r11;

    // Calculate Stripe+PayU test stats
    if (r11 && r11.summary) {
      totalTests += r11.summary.totalTransactions || 0;
      totalPassed += r11.summary.passed || 0;
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
