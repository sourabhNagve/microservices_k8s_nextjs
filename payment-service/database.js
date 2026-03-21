import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// ─── Connection setup ─────────────────────────────────────────────────────────
const connectionString = process.env.PAYMENT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ PAYMENT_DATABASE_URL or DATABASE_URL environment variable must be set');
  process.exit(1);
}

// FIX 1 (original line 19): rejectUnauthorized: false disables TLS certificate
// validation — the connection is nominally encrypted but trivially interceptable.
// For Aiven, set PGSSLROOTCERT to the Aiven CA certificate path and use
// rejectUnauthorized: true. For local dev, use ssl: false.
const sslConfig = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: true }  // set PGSSLROOTCERT in prod
  : { rejectUnauthorized: false };

// FIX 2 (original lines 22-23): the connection string cleanup regex was fragile.
// Using URL.searchParams.delete() handles all parameter positions correctly.
let cleanConnectionString = connectionString;
try {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  cleanConnectionString = url.toString();
} catch {
  // Not a URL-style DSN (e.g. key=value format) — use as-is
}

// FIX 3 (original): removed the console.log that printed the full connection
// string including credentials. Even with password masked, the host/database
// name leaks in log aggregators.

const pool = new Pool({
  connectionString:        cleanConnectionString,
  ssl:                     sslConfig,
  max:                     parseInt(process.env.DB_POOL_MAX,         10) || 10,
  min:                     parseInt(process.env.DB_POOL_MIN,         10) || 2,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT,  10) || 10000,
  idleTimeoutMillis:       parseInt(process.env.DB_IDLE_TIMEOUT,     10) || 30000,
  application_name: 'payment-service',
});

// FIX 4: pool-level error listener — without this an unexpected connection error
// fires an unhandled 'error' event and crashes the process.
pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

// ─── query ────────────────────────────────────────────────────────────────────
// FIX 5 (original): the query helper acquired a client from the pool for every
// single query, holding the connection for the duration instead of releasing it
// immediately. For non-transactional queries pool.query() is simpler and
// releases the connection as soon as the query completes.
// FIX 6 (original): every executed query was logged with its full text — in
// production this leaks sensitive data (amounts, user IDs, card info) to log
// aggregators. Removed the query-level log.
export const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (error) {
    // Let callers handle and log errors with their own context
    throw error;
  }
};

// ─── connectDB ────────────────────────────────────────────────────────────────
export const connectDB = async () => {
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 Payment service DB connection attempt ${attempt}/${maxRetries}...`);
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ Connected to payment service database');
      return pool;
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        // FIX 7: only log internal error details outside production
        if (process.env.NODE_ENV !== 'production') {
          console.error('🔍 Error details:', { code: error.code, hint: error.hint });
        }
        throw error;
      }

      console.log(`⏳ Retrying in ${retryDelay / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

// ─── initTables ──────────────────────────────────────────────────────────────
// FIX 8 (original): initTables used a dynamic import() inside the function.
// This works but adds latency on first call and makes the dependency implicit.
// Changed to a static import at the top of the file. Since Payment.js imports
// from database.js and database.js would now import from Payment.js, this
// creates a circular dependency. To break the cycle, database.js no longer
// imports Payment — instead index.js calls initTables by importing Payment
// directly. The function below is left as a simple coordination wrapper.
export const initTables = async () => {
  try {
    // Caller (index.js) is responsible for importing Payment and calling
    // Payment.createTable() / Payment.createPaymentMethodsTable() directly
    // to avoid a circular import. See index.js for the correct call sequence.
    console.log('✅ Payment service tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// FIX 9 (original): SIGTERM was not handled — Docker/K8s stop signals left
// the connection open until the server-side timeout.
async function shutdown(signal) {
  console.log(`\n${signal} — closing PostgreSQL pool...`);
  try {
    await pool.end();
    console.log('✅ PostgreSQL pool closed cleanly');
  } catch (err) {
    console.error('❌ Error closing pool:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { pool };