// src/config/db.js
const { Pool } = require("pg");
require("dotenv").config();

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "yourdbname",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err);
});

/**
 * Get routing configuration for merchants 1-10
 */
async function getRoutingConfig() {
  const query = `
    SELECT 
      mp.id AS "merchantId",
      mp.name AS "merchantName",
      mrp."routingStrategy",
      mrp.id AS "routingPrefId",
      mgp."gatewayId",
      mgp.priority,
      mgp."paymentModes",
      mgp."enableFailover",
      mgp."maxRetries",
      g.name AS "gatewayName"
    FROM merchants mp
    JOIN merchant_routing_preferences mrp
      ON mp.id = mrp."merchantId"
    JOIN merchant_gateway_priorities mgp
      ON mrp.id = mgp."merchantRoutingPrefId"
    JOIN gateways g
      ON mgp."gatewayId" = g.id
    WHERE mp.id BETWEEN 1 AND 10
      AND mp."isActive" = true
      AND mgp."isActive" = true
    ORDER BY mp.id, mgp.priority
  `;

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error("❌ Error fetching routing config:", error);
    throw error;
  }
}

/**
 * Build merchant config from raw query results
 */
function buildMerchantConfig(rawData) {
  const merchantMap = new Map();

  for (const row of rawData) {
    const {
      merchantId,
      merchantName,
      routingStrategy,
      routingPrefId,
      gatewayId,
      priority,
      paymentModes,
      enableFailover,
      maxRetries,
      gatewayName,
    } = row;

    if (!merchantMap.has(merchantId)) {
      merchantMap.set(merchantId, {
        merchantId,
        merchantName,
        routingStrategy,
        routingPrefId,
        gateways: [],
        paymentModeMap: {},
      });
    }

    const merchant = merchantMap.get(merchantId);

    // Parse paymentModes (it's stored as JSON array like {UPI} or ["UPI"])
    let modes = [];
    try {
      if (typeof paymentModes === "string") {
        // Handle PostgreSQL array format: {UPI,CARD} or ["UPI","CARD"]
        if (paymentModes.startsWith("{")) {
          modes = paymentModes.replace(/[{}]/g, "").split(",");
        } else {
          modes = JSON.parse(paymentModes);
        }
      } else if (Array.isArray(paymentModes)) {
        modes = paymentModes;
      }
    } catch (e) {
      modes = [];
    }

    const gatewayEntry = {
      gatewayId,
      gatewayName,
      priority,
      paymentModes: modes,
      enableFailover,
      maxRetries,
    };

    merchant.gateways.push(gatewayEntry);

    // Build payment mode map (highest priority for each mode)
    for (const mode of modes) {
      if (
        !merchant.paymentModeMap[mode] ||
        priority < merchant.paymentModeMap[mode].priority
      ) {
        merchant.paymentModeMap[mode] = {
          gatewayId,
          gatewayName,
          priority,
          enableFailover,
          maxRetries,
        };
      }
    }
  }

  return Array.from(merchantMap.values());
}

/**
 * Close database connection
 */
async function closeDbConnection() {
  await pool.end();
  console.log("📴 Database connection closed");
}

module.exports = {
  pool,
  getRoutingConfig,
  buildMerchantConfig,
  closeDbConnection,
};
