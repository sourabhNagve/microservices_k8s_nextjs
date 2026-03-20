import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './models/schema.js';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.INVENTORY_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

export const db = drizzle(pool, { schema });

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected successfully');
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

export const initTables = async () => {
  try {
    // Tables are created through migrations
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error.message);
    throw error;
  }
};

async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  await pool.end();
  console.log('PostgreSQL pool closed');
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT',  gracefulShutdown);