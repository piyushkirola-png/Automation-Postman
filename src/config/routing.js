// // Expected routing rules based on database
// module.exports = {
//   // Merchant 1 (Aman Pandey)
//   1: {
//     priorities: [
//       { gatewayId: 1, name: 'Razorpay', priority: 1, paymentModes: ['CARD', 'WALLET'] },
//       { gatewayId: 2, name: 'Cashfree', priority: 2, paymentModes: ['UPI', 'CARD', 'WALLET'] },
//       { gatewayId: 3, name: 'Adyen', priority: 3, paymentModes: ['UPI', 'WALLET'] }
//     ],
//     expectedGateway: {
//       'CARD': { gatewayId: 1, name: 'Razorpay' },
//       'WALLET': { gatewayId: 1, name: 'Razorpay' },
//       'UPI': { gatewayId: 2, name: 'Cashfree' },
//       'NETBANKING': { gatewayId: 1, name: 'Razorpay' }
//     }
//   },
//   // Merchant 2 (Sonia Kalonia)
//   2: {
//     priorities: [
//       { gatewayId: 1, name: 'Razorpay', priority: 1, paymentModes: ['CARD'] },
//       { gatewayId: 2, name: 'Cashfree', priority: 2, paymentModes: ['UPI', 'CARD', 'WALLET'] },
//       { gatewayId: 3, name: 'Adyen', priority: 3, paymentModes: ['UPI', 'WALLET'] }
//     ],
//     expectedGateway: {
//       'CARD': { gatewayId: 1, name: 'Razorpay' },
//       'UPI': { gatewayId: 2, name: 'Cashfree' },
//       'WALLET': { gatewayId: 3, name: 'Adyen' },
//       'NETBANKING': null,
//     }
//   },
//   // Merchant 3 (Piyush Kirola) - No priorities configured (Default)
//   3: {
//     priorities: [],
//     expectedGateway: {
//       'CARD': { gatewayId: 1, name: 'Razorpay' },
//       'UPI': { gatewayId: 2, name: 'Cashfree' },
//       'WALLET': { gatewayId: 1, name: 'Razorpay' },
//       'NETBANKING': null
//     }
//   }
// };










// config/routing.js
module.exports = {
  merchants: {
    '1': {
      id: 1,
      name: 'Merchant1',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 1, name: 'Razorpay', priority: 1, maxRetries: 3 },
        { id: 2, name: 'Cashfree', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    },
    '2': {
      id: 2,
      name: 'Merchant2',
      routingStrategy: 'HYBRID',
      gateways: [
        { id: 3, name: 'Adyen', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 2, name: 'Cashfree', priority: 3, maxRetries: 3 }
      ]
    },
    '3': {
      id: 3,
      name: 'Merchant3',
      routingStrategy: 'HYBRID',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    },
    '4': {
      id: 4,
      name: 'Merchant4',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 2, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 3, maxRetries: 3 }
      ]
    },
    '5': {
      id: 5,
      name: 'Merchant5',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 1, name: 'Razorpay', priority: 1, maxRetries: 3 },
        { id: 2, name: 'Cashfree', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    },
    '6': {
      id: 6,
      name: 'Merchant6',
      routingStrategy: 'FAILOVER',
      gateways: [
        { id: 3, name: 'Adyen', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 2, name: 'Cashfree', priority: 3, maxRetries: 3 }
      ]
    },
    '7': {
      id: 7,
      name: 'Merchant7',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 2, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 3, maxRetries: 3 }
      ]
    },
    '8': {
      id: 8,
      name: 'Merchant8',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    },
    '9': {
      id: 9,
      name: 'Merchant9',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    },
    '10': {
      id: 10,
      name: 'Merchant10',
      routingStrategy: 'PRIORITY',
      gateways: [
        { id: 2, name: 'Cashfree', priority: 1, maxRetries: 3 },
        { id: 1, name: 'Razorpay', priority: 2, maxRetries: 3 },
        { id: 3, name: 'Adyen', priority: 3, maxRetries: 3 }
      ]
    }
  },
  // Helper function to get merchant by ID
  getMerchant: function(id) {
    return this.merchants[id];
  },
  // Helper function to get gateways for merchant
  getGateways: function(merchantId) {
    const merchant = this.merchants[merchantId];
    return merchant ? merchant.gateways : [];
  },
  // Helper function to get routing strategy
  getStrategy: function(merchantId) {
    const merchant = this.merchants[merchantId];
    return merchant ? merchant.routingStrategy : null;
  }
};