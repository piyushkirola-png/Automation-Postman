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










module.exports = {
  // Merchant 1 (Aman Pandey) - Updated to match DB
  1: {
    priorities: [
      { gatewayId: 1, name: "Razorpay", priority: 1, paymentModes: ["UPI"] },
      { gatewayId: 2, name: "Cashfree", priority: 2, paymentModes: ["WALLET"] },
      {
        gatewayId: 3,
        name: "Adyen",
        priority: 3,
        paymentModes: ["NETBANKING"],
      },
      { gatewayId: 2, name: "Cashfree", priority: 4, paymentModes: ["CARD"] },
    ],
    expectedGateway: {
      UPI: { gatewayId: 1, name: "Razorpay" }, // Changed
      WALLET: { gatewayId: 2, name: "Cashfree" }, // Changed
      NETBANKING: { gatewayId: 3, name: "Adyen" }, // Changed
      CARD: { gatewayId: 2, name: "Cashfree" }, // Changed
    },
  },
  // Merchant 2 (Sonia Kalonia) - Updated to match DB
  2: {
    priorities: [
      { gatewayId: 3, name: "Adyen", priority: 1, paymentModes: ["UPI"] },
      { gatewayId: 1, name: "Razorpay", priority: 2, paymentModes: ["CARD"] },
      { gatewayId: 2, name: "Cashfree", priority: 3, paymentModes: ["WALLET"] },
      {
        gatewayId: 1,
        name: "Razorpay",
        priority: 4,
        paymentModes: ["NETBANKING"],
      },
    ],
    expectedGateway: {
      UPI: { gatewayId: 3, name: "Adyen" }, // Changed
      CARD: { gatewayId: 1, name: "Razorpay" }, // Same
      WALLET: { gatewayId: 2, name: "Cashfree" }, // Changed
      NETBANKING: { gatewayId: 1, name: "Razorpay" }, // Added
    },
  },
  // Merchant 3 (Piyush Kirola) - Updated to match DB
  3: {
    priorities: [
      { gatewayId: 2, name: "Cashfree", priority: 1, paymentModes: ["CARD"] },
      {
        gatewayId: 1,
        name: "Razorpay",
        priority: 2,
        paymentModes: ["NETBANKING"],
      },
      { gatewayId: 3, name: "Adyen", priority: 3, paymentModes: ["WALLET"] },
      { gatewayId: 2, name: "Cashfree", priority: 4, paymentModes: ["UPI"] },
    ],
    expectedGateway: {
      CARD: { gatewayId: 2, name: "Cashfree" }, // Changed
      NETBANKING: { gatewayId: 1, name: "Razorpay" }, // Added
      WALLET: { gatewayId: 3, name: "Adyen" }, // Changed
      UPI: { gatewayId: 2, name: "Cashfree" }, // Same
    },
  },
};
