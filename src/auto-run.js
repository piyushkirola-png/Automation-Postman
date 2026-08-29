const { exec } = require("child_process");
const path = require("path");

// ==================== CONFIGURATION ====================
const COOLDOWN_MS = 60000; // 1 minute (60,000 ms)
// const COOLDOWN_MS = 5000; // 5 seconds (for testing)

// ==================== CODE ====================
let isRunning = false;
let runCount = 0;

function runTest() {
  // Prevent overlapping runs
  if (isRunning) {
    console.log("⏳ Test already running, skipping...");
    return;
  }

  isRunning = true;
  runCount++;
  const startTime = Date.now();

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `🚀 RUN #${runCount} - Starting test at ${new Date().toLocaleString()}`,
  );
  console.log(`${"=".repeat(60)}\n`);

  const testProcess = exec("npm run test:unified", {
    cwd: path.join(__dirname, ".."), // Go to project root
    env: process.env,
  });

  // Pipe output to console in real-time
  testProcess.stdout.on("data", (data) => {
    console.log(data);
  });

  testProcess.stderr.on("data", (data) => {
    console.error(data);
  });

  testProcess.on("close", (code) => {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n${"=".repeat(60)}`);
    console.log(
      `✅ RUN #${runCount} completed in ${duration.toFixed(2)} seconds`,
    );
    console.log(`📅 Completed at: ${new Date().toLocaleString()}`);
    console.log(`📊 Exit code: ${code}`);
    console.log(`${"=".repeat(60)}`);

    isRunning = false;

    // Start cooldown timer
    console.log(
      `\n⏳ Waiting ${COOLDOWN_MS / 1000} seconds before next run...`,
    );
    console.log(
      `🔄 Next run will start at: ${new Date(Date.now() + COOLDOWN_MS).toLocaleString()}`,
    );
    console.log(`${"-".repeat(60)}\n`);

    // Schedule next run after cooldown
    setTimeout(runTest, COOLDOWN_MS);
  });

  // Handle process errors
  testProcess.on("error", (error) => {
    console.error(`❌ Process error: ${error.message}`);
    isRunning = false;
    setTimeout(runTest, COOLDOWN_MS);
  });
}

// ==================== START ====================
console.log(`
${"=".repeat(60)}
🚀 AUTO-TEST RUNNER STARTED
${"=".repeat(60)}
📋 Will run: npm run test:unified
⏳ Cooldown between runs: ${COOLDOWN_MS / 1000} seconds
🔄 Mode: Continuous loop (runs forever)
${"=".repeat(60)}
💡 Press Ctrl+C to stop the runner
${"=".repeat(60)}
`);

// Start the first run immediately
runTest();

// Keep the process alive
process.stdin.resume();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n\n${"=".repeat(60)}`);
  console.log(`👋 Stopping auto-test runner...`);
  console.log(`📊 Total runs executed: ${runCount}`);
  console.log(`${"=".repeat(60)}\n`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n\n👋 Stopping auto-test runner...`);
  console.log(`📊 Total runs executed: ${runCount}`);
  process.exit(0);
});
