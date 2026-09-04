const { Pool } = require("pg");
require("dotenv").config();

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "12345",
  database: process.env.DB_NAME || "",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
  allowExitOnIdle: true,
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err);
});

/**
 * Get routing configuration for specific merchants
 */
async function getRoutingConfig(merchantIds = null) {
  const ids = merchantIds || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");

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
    FROM "Merchant" mp
    JOIN "MerchantRoutingPreference" mrp
      ON mp.id = mrp."merchantId"
    JOIN "MerchantGatewayPriority" mgp
      ON mrp.id = mgp."merchantRoutingPrefId"
    JOIN "Gateway" g
      ON mgp."gatewayId" = g.id
    WHERE mp.id IN (${placeholders})
      AND mp."isActive" = true
      AND mgp."isActive" = true
    ORDER BY mp.id, mgp.priority
  `;

  const client = await pool.connect();
  try {
    const result = await client.query(query, ids);
    return result.rows;
  } catch (error) {
    console.error("❌ Error fetching routing config:", error);
    throw error;
  } finally {
    client.release();
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

    // Parse paymentModes
    let modes = [];
    try {
      if (typeof paymentModes === "string") {
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

    // Har payment mode ke liye array mein push karo
    for (const mode of modes) {
      if (!merchant.paymentModeMap[mode]) {
        merchant.paymentModeMap[mode] = [];
      }
      merchant.paymentModeMap[mode].push({
        gatewayId,
        gatewayName,
        priority,
        enableFailover,
        maxRetries,
      });
    }
  }

  // Har payment mode ke gateways ko priority se sort karo
  for (const merchant of merchantMap.values()) {
    for (const mode in merchant.paymentModeMap) {
      merchant.paymentModeMap[mode].sort((a, b) => a.priority - b.priority);
    }
  }

  return Array.from(merchantMap.values());
}

/**
 * Close database connection
 * Properly closes all connections
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
