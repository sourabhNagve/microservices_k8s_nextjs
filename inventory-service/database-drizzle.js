import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './models/schema.js';

dotenv.config();

// FIX 1 (original): no env-var check — if INVENTORY_DATABASE_URL is missing
// the pool silently uses `undefined` as the connection string and every query
// fails with a cryptic error. Fail fast instead.
if (!process.env.INVENTORY_DATABASE_URL) {
  console.error('❌ INVENTORY_DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString:        process.env.INVENTORY_DATABASE_URL,
  ssl:                     process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max:                     parseInt(process.env.DB_POOL_MAX,         10) || 10,
  min:                     parseInt(process.env.DB_POOL_MIN,         10) || 2,
  idleTimeoutMillis:       parseInt(process.env.DB_IDLE_TIMEOUT,     10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT,  10) || 15000,
  application_name: 'inventory-service',
});

// FIX 2: pool-level error listener — without this an unexpected connection
// error fires an unhandled 'error' event and crashes the process.
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

    // FIX 3 (original): no error-code hints. Added common pg error codes.
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused — is the database server running?');
    } else if (error.code === '28000' || error.code === '28P01') {
      console.error('💡 Authentication failed — check database credentials.');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist — check database name.');
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error('💡 Connection timeout — check network and firewall settings.');
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

// FIX 4 (original): the gracefulShutdown function called pool.end() and
// process.exit(0) but did not handle the case where pool.end() throws.
// Also extracted to a named function shared by both signal handlers.
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