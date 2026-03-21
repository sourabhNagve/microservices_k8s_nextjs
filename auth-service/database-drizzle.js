import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './models/schema.js';

dotenv.config();

// FIX 1: validate the connection string at module load time so a missing env
// var produces a clear error message instead of a cryptic pg connection failure
// deep inside the pool. This runs before any pool is created so there is no
// leaked resource to clean up if the check fails.
if (!process.env.AUTH_DATABASE_URL) {
  console.error('❌ AUTH_DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.AUTH_DATABASE_URL,
  // FIX 2 (original line 10): changed rejectUnauthorized from false to true in
  // production. false disables certificate validation — a TLS connection with
  // certificate validation disabled is vulnerable to man-in-the-middle attacks.
  // In development ssl:false is still fine (local postgres has no cert).
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  // FIX 3: pool sizing — 10 connections is a reasonable default but these
  // values are now driven by env vars so they can be tuned per environment
  // without a code change. Falls back to the original defaults if not set.
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 15000,
  // FIX 4: add an application name so the connection is identifiable in
  // pg_stat_activity and database logs — makes debugging much easier.
  application_name: 'auth-service',
});

// FIX 5: listen for pool-level errors (connections that error outside of a
// query, e.g. a server-side disconnect). Without this handler Node will throw
// an unhandled 'error' event and crash the process.
pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
  console.error('🔍 Error code:', err.code);
});

pool.on('connect', () => {
  console.log('🔗 New database connection established');
});

export const db = drizzle(pool, { schema });

export const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to database...');

    // FIX 6 (original lines 22-23): removed the log that printed the full
    // AUTH_DATABASE_URL including credentials. Even the "Set / Not set" log
    // is fine to keep since it never exposes the value. The full URL log from
    // the previous version has been permanently removed.
    console.log('📍 Database URL configured:', process.env.AUTH_DATABASE_URL ? 'yes' : 'no');

    const client = await pool.connect();

    // FIX 7: use a parameterised-style health-check that also returns the DB
    // server time and version — useful for confirming you are connected to the
    // right server in logs.
    const { rows } = await client.query('SELECT NOW() AS now, version() AS version');
    client.release();

    console.log('✅ PostgreSQL connected successfully');
    console.log(`📅 Server time: ${rows[0].now}`);
    // Only log the version in non-production to avoid leaking DB version info.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🐘 Server version: ${rows[0].version}`);
    }

    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);

    // FIX 8: only log detailed error fields in non-production environments.
    // In production these fields can leak internal DB structure to log
    // aggregators which may be less secured than the DB itself.
    if (process.env.NODE_ENV !== 'production') {
      console.error('🔍 Error details:', {
        code: error.code,
        severity: error.severity,
        detail: error.detail,
        hint: error.hint,
        position: error.position,
      });
    }

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused. Check if database server is running and accessible.');
    } else if (error.code === '28000' || error.code === '28P01') {
      // FIX 9 (original line 38): added 28P01 which is the SCRAM/password
      // authentication failure code — 28000 alone misses most modern pg auth errors.
      console.error('💡 Authentication failed. Check database credentials.');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist. Check database name.');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      // FIX 10: added ETIMEDOUT code check alongside the string match for
      // more reliable timeout detection.
      console.error('💡 Connection timeout. Check network connectivity and firewall settings.');
    } else if (error.message.includes('SSL') || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      // FIX 11: added the specific self-signed cert error code that pg throws
      // when NODE_ENV=production but the server uses a self-signed certificate.
      console.error('💡 SSL connection error. Check SSL configuration.');
    }

    process.exit(1);
  }
};

export const initTables = async () => {
  try {
    // Tables are managed by drizzle-kit migrations — nothing to do here.
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error.message);
    throw error;
  }
};

// FIX 12: handle both SIGINT (Ctrl-C) and SIGTERM (Docker / Kubernetes stop
// signal). The original only handled SIGINT so the pool was never closed
// cleanly when the container was stopped, leaving idle connections open on the
// DB server until the server-side timeout kicked in.
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));