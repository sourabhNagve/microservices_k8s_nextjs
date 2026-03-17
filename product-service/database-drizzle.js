import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './models/schema.js';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.PRODUCT_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

export const db = drizzle(pool, { schema });

export const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to database...');
    console.log('📍 Database URL:', process.env.PRODUCT_DATABASE_URL ? 'Set' : 'Not set');
    
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected successfully');
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.error('🔍 Error details:', {
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });
    
    // Provide specific guidance based on error type
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused. Check if database server is running and accessible.');
    } else if (error.code === '28000') {
      console.error('💡 Authentication failed. Check database credentials.');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist. Check database name.');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Connection timeout. Check network connectivity and firewall settings.');
    } else if (error.message.includes('SSL')) {
      console.error('💡 SSL connection error. Check SSL configuration.');
    }
    
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

process.on('SIGINT', async () => {
  await pool.end();
  console.log('PostgreSQL pool closed');
  process.exit(0);
});
