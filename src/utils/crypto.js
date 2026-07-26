const crypto = require("crypto");

/**
 * Generate HMAC SHA-256 signature
 * @param {string} merchantReference - The merchant reference/order ID
 * @param {string} clientSecret - The client secret key
 * @returns {string} - Hex signature
 */
function generateSignature(merchantReference, clientSecret) {
  return crypto
    .createHmac("sha256", clientSecret)
    .update(merchantReference)
    .digest("hex");
}

/**
 * Generate unique merchant reference
 * Format: ORD-{7 digit random number}
 * @returns {string} - e.g., ORD-3848934
 */
function generateMerchantReference() {
  const random7Digits = Math.floor(1000000 + Math.random() * 9000000);
  return `ORD-${random7Digits}`;
}

/**
 * Generate unique merchant reference with timestamp (alternative)
 * @returns {string} - e.g., ORD-1735123456789
 */
function generateMerchantReferenceWithTimestamp() {
  return `ORD-${Date.now()}`;
}

module.exports = {
  generateSignature,
  generateMerchantReference,
  generateMerchantReferenceWithTimestamp,
};
