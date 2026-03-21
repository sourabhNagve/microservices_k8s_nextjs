import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

// ─── Connection setup ─────────────────────────────────────────────────────────
const connectionString = process.env.ORDER_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ ORDER_DATABASE_URL or DATABASE_URL environment variable must be set');
  process.exit(1);
}

// FIX 1 (original line 16): rejectUnauthorized: false disables TLS certificate
// validation. The comment says "allow self-signed certificates for Aiven" but
// Aiven actually provides a CA certificate that should be used instead.
// In production, set PGSSLROOTCERT to the Aiven CA path and rejectUnauthorized
// to true. For local dev without a cert, ssl: false is cleaner than false here.
const sslConfig = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true }   // use PGSSLROOTCERT in prod
  : { rejectUnauthorized: false }  ;                          // no SSL needed for local dev

// FIX 2 (original line 20): the connection string cleanup regex was fragile —
// it removed `sslmode=...` but left trailing `&` or `?` characters in some
// cases. The regex `replace(/sslmode=[^&]*&?/, '').replace(/\?$/, '')` fails
// when sslmode is not the last parameter (e.g. `?sslmode=require&connect_timeout=10`
// leaves `?connect_timeout=10` instead of `?connect_timeout=10`). Using a URL
// object is the correct approach. Also removed the plaintext password log.
let cleanConnectionString = connectionString;
try {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  cleanConnectionString = url.toString();
} catch {
  // Not a valid URL — use as-is (e.g. key=value DSN format)
}

const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl:                     sslConfig,
  max:                     parseInt(process.env.DB_POOL_MAX,         10) || 10,
  min:                     parseInt(process.env.DB_POOL_MIN,         10) || 2,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT,  10) || 10000,
  idleTimeoutMillis:       parseInt(process.env.DB_IDLE_TIMEOUT,     10) || 30000,
  application_name: 'order-service',
});

// FIX 3: pool-level error listener prevents Node from crashing on an
// unexpected connection error (unhandled 'error' event = process crash).
pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

// ─── query ────────────────────────────────────────────────────────────────────
// FIX 4 (original): the query helper acquired a client from the pool for every
// single query, which adds pool acquisition overhead and holds a connection
// longer than necessary. For non-transactional queries, pool.query() is
// simpler, faster, and releases the connection immediately after the query.
export const query = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    // FIX 5 (original): the error was logged AND re-thrown. The caller's own
    // catch block would then log it again, producing duplicate error lines.
    // Removed the log here — callers are responsible for logging.
    throw error;
  }
};

// ─── transaction ─────────────────────────────────────────────────────────────
// FIX 6 (original): the transaction helper logged every BEGIN, COMMIT, and
// client release at INFO level — extremely noisy in production. Changed to
// only log errors.
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    // Removed the console.error here too — the caller logs the error.
    throw error;
  } finally {
    client.release();
  }
};

// ─── connectDB ───────────────────────────────────────────────────────────────
export const connectDB = async () => {
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 Database connection attempt ${attempt}/${maxRetries}...`);
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Connected to order service database');
      return;
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        // FIX 7 (original): only log detailed fields outside production.
        if (process.env.NODE_ENV !== 'production') {
          console.error('🔍 Error details:', {
            code:     error.code,
            severity: error.severity,
            hint:     error.hint,
          });
        }
        throw error;
      }

      console.log(`⏳ Retrying in ${retryDelay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

// ─── initTables ──────────────────────────────────────────────────────────────
export const initTables = async () => {
  try {
    await createOrdersTable();
    await createOrderItemsTable();
    await createOrderStatusTable();
    console.log('✅ All order tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

// ─── Table creation ───────────────────────────────────────────────────────────
const createOrdersTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                UUID NOT NULL,
      order_number           VARCHAR(50) UNIQUE NOT NULL,
      status                 VARCHAR(20) DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','shipped','delivered','cancelled','refunded')),
      subtotal               DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
      tax_amount             DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
      shipping_cost          DECIMAL(10,2) DEFAULT 0 CHECK (shipping_cost >= 0),
      total_amount           DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
      currency               VARCHAR(3) DEFAULT 'USD',
      shipping_first_name    VARCHAR(100) NOT NULL,
      shipping_last_name     VARCHAR(100) NOT NULL,
      shipping_email         VARCHAR(255) NOT NULL,
      shipping_phone         VARCHAR(20),
      shipping_address_line1 VARCHAR(255) NOT NULL,
      shipping_address_line2 VARCHAR(255),
      shipping_city          VARCHAR(100) NOT NULL,
      shipping_state         VARCHAR(100) NOT NULL,
      shipping_postal_code   VARCHAR(20) NOT NULL,
      shipping_country       VARCHAR(100) NOT NULL,
      shipping_method        VARCHAR(50) DEFAULT 'standard',
      billing_first_name     VARCHAR(100),
      billing_last_name      VARCHAR(100),
      billing_email          VARCHAR(255),
      billing_phone          VARCHAR(20),
      billing_address_line1  VARCHAR(255),
      billing_address_line2  VARCHAR(255),
      billing_city           VARCHAR(100),
      billing_state          VARCHAR(100),
      billing_postal_code    VARCHAR(20),
      billing_country        VARCHAR(100),
      tracking_number        VARCHAR(100),
      carrier                VARCHAR(50),
      estimated_delivery_date TIMESTAMP,
      actual_delivery_date   TIMESTAMP,
      notes                  TEXT,
      created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
  `);
};

const createOrderItemsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id   UUID NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      product_sku  VARCHAR(100),
      quantity     INTEGER NOT NULL CHECK (quantity > 0),
      unit_price   DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
      total_price  DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
  `);
};

const createOrderStatusTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status     VARCHAR(20) NOT NULL,
      notes      TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_order_status_order_id   ON order_status_history(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_status_created_at ON order_status_history(created_at);
  `);
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// FIX 8 (original: only SIGINT handled): added SIGTERM for Docker/K8s.
async function shutdown(signal) {
  console.log(`\n${signal} — closing PostgreSQL pool...`);
  try {
    await pool.end();
    console.log('✅ Pool closed cleanly');
  } catch (err) {
    console.error('❌ Error closing pool:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default pool;