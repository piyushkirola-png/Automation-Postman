const { loginUser } = require('../api/auth');
const { createPayIn } = require('../api/payin');
const { simulateRazorpayWebhook, getWebhookPayloads } = require('../api/webhook');
const { randomAmount, randomCustomer } = require('../utils/random');
const { logSection, logSuccess, logError, logInfo } = require('../utils/logger');

/**
 * Test End-to-End Flow for ALL Merchants
 */
async function testEndToEndFlow() {
  logSection('TEST 8: END-TO-END FLOW (ALL MERCHANTS)');
  
  const users = [
    { email: 'amanpandey@gmail.com', password: '12345678', merchantId: 1 },
    { email: 'soniakalonia@gmail.com', password: '12345678', merchantId: 2 },
    { email: 'piyushkirola@gmail.com', password: '12345678', merchantId: 3 }
  ];

  const results = [];

  for (const user of users) {
    logInfo(`\nTesting Merchant ${user.merchantId} (${user.email})`);
    
    try {
      // Step 1: Login
      logInfo('  Step 1: Logging in...');
      const loginData = await loginUser(user.email, user.password);
      const { accessToken, clientSecret } = loginData;
      logSuccess(`Logged in as ${user.email}`);
      
      // Step 2: Create Pay-In
      logInfo('  Step 2: Creating pay-in...');
      const amount = randomAmount(100, 5000);
      const customer = randomCustomer();
      const paymentMode = 'CARD';
      const merchantReference = `ORD-E2E-${user.merchantId}-${Date.now()}`;
      
      const payInResult = await createPayIn(accessToken, clientSecret, {
        amount,
        paymentMode,
        customer,
        merchantReference
      });
      
      const transactionId = payInResult.response.id;
      const status = payInResult.response.status;
      logSuccess(`Pay-In created: ID ${transactionId}, Status: ${status}`);
      
      // Step 3: Simulate Webhook (NO RE-LOGIN NEEDED)
      logInfo('  Step 3: Simulating webhook...');
      const webhookPayloads = getWebhookPayloads(merchantReference, amount, paymentMode, customer);
      const webhookResult = await simulateRazorpayWebhook(webhookPayloads.razorpay);
      
      const webhookSuccess = webhookResult && (webhookResult.success || webhookResult.processed);
      logSuccess(`Webhook ${webhookSuccess ? 'processed' : 'failed'}`);
      
      results.push({
        merchantId: user.merchantId,
        email: user.email,
        transactionId,
        merchantReference,
        amount,
        paymentMode,
        initialStatus: status,
        webhookProcessed: webhookSuccess,
        success: status === 'PENDING' && webhookSuccess
      });
      
    } catch (error) {
      logError(`Failed for ${user.email}: ${error.message}`);
      results.push({
        merchantId: user.merchantId,
        email: user.email,
        success: false,
        error: error.message
      });
    }
  }

  // Summary
  logSection('END-TO-END FLOW RESULTS (ALL MERCHANTS)');
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  console.log(`\nTotal Merchants Tested: ${total}`);
  console.log(`Success: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Pass Rate: ${((passed/total)*100).toFixed(1)}%`);
  
  return results;
}

module.exports = { testEndToEndFlow };