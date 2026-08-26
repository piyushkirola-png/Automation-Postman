require("dotenv").config();

module.exports = {
  BASE_URL: process.env.BASE_URL || "http://localhost:4000",
  API_PATHS: {
    LOGIN: "/api/auth/user/login",
    PAYIN: "/api/payin-requests",
    WEBHOOKS: {
      CASHFREE: "/api/webhooks/cashfree",
      RAZORPAY: "/api/webhooks/razorpay",
      ADYEN: "/api/webhooks/adyen",
      CHARGEBEE: "/api/webhooks/chargebee",
      BENNUPAY: "/api/webhooks/bennupay",
      STRIPE: "/api/webhooks/stripe",
      PAYU: "/api/webhooks/payu",
      SABPAISA: "/api/webhooks/sabpaisa",
    },
  },
  TEST_CONFIG: {
    TRANSACTIONS_PER_USER: parseInt(process.env.TRANSACTIONS_PER_USER),
    MIN_AMOUNT: parseFloat(process.env.MIN_AMOUNT) || 1000,
    MAX_AMOUNT: parseFloat(process.env.MAX_AMOUNT) || 5000,
    PAYMENT_MODES: (
      process.env.PAYMENT_MODES || "UPI,CARD"
    ).split(","),
  },
  GATEWAY_IDS: {
    RAZORPAY: 1,
    CASHFREE: 2,
    ADYEN: 3,
    CHARGEBEE: 4,
    BENNUPAY: 5,
    SABPAISA: 6,
    STRIPE: 9,
    PAYU: 10,
  },
};
