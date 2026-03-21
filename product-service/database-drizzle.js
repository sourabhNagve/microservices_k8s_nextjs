import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './models/schema.js';

dotenv.config();

// FIX 1 (original database.js line 7): the legacy database.js hard-coded a
// fallback connection string including a plaintext password. If PRODUCT_DATABASE_URL
// is unset the app silently connected to that hard-coded URL — a security and
// reliability hazard. Fail fast instead.
if (!process.env.PRODUCT_DATABASE_URL) {
  console.error('❌ PRODUCT_DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.PRODUCT_DATABASE_URL,
  // FIX 2 (original database.js line 9): rejectUnauthorized was false in
  // production — disables TLS certificate validation entirely, making the
  // "encrypted" connection trivially interceptable. Changed to true.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max:                    parseInt(process.env.DB_POOL_MAX,         10) || 10,
  min:                    parseInt(process.env.DB_POOL_MIN,         10) || 2,
  idleTimeoutMillis:      parseInt(process.env.DB_IDLE_TIMEOUT,     10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 15000,
  application_name: 'product-service',
});

// FIX 3: catch pool-level errors (connections that error outside of a query).
// Without this listener Node emits an unhandled 'error' event and crashes.
pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

export const db = drizzle(pool, { schema });

export const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to database...');

    const client = await pool.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    client.release();

    console.log('✅ PostgreSQL connected successfully');
    console.log(`📅 Server time: ${rows[0].now}`);
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);

    // FIX 4 (original): only log detailed error fields outside production to
    // avoid leaking internal DB structure to log aggregators.
    if (process.env.NODE_ENV !== 'production') {
      console.error('🔍 Error details:', {
        code:     error.code,
        severity: error.severity,
        detail:   error.detail,
        hint:     error.hint,
      });
    }

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused — is the database server running?');
    } else if (error.code === '28000' || error.code === '28P01') {
      // FIX 5: added 28P01 (SCRAM/password auth failure) alongside 28000.
      console.error('💡 Authentication failed — check database credentials.');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist — check database name.');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('💡 Connection timeout — check network and firewall settings.');
    } else if (error.message.includes('SSL') || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      console.error('💡 SSL error — check SSL configuration.');
    }

    process.exit(1);
  }
};

export const initTables = async () => {
  try {
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error.message);
    throw error;
  }
};

// FIX 6 (original): replaced the two separate process.on handlers with a
// single shared function so the shutdown logic is not duplicated.
async function shutdown(signal) {
  console.log(`\n${signal} received — closing PostgreSQL pool...`);
  try {
    await pool.end();
    console.log('✅ PostgreSQL pool closed cleanly');
  } catch (err) {
    console.error('❌ Error closing pool:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));