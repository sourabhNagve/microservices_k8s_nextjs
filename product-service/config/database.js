import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// ─── Connection setup ─────────────────────────────────────────────────────────
// NOTE: This file is legacy and not imported by the main product-service
// (which uses database-drizzle.js instead). Kept for reference or manual use.
const connectionString = process.env.PRODUCT_DATABASE_URL;
if (!connectionString) {
  console.error('❌ PRODUCT_DATABASE_URL environment variable must be set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

const connectDB = async () => {
  try {
    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ PostgreSQL Connected Successfully');
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Initialize database tables
const initTables = async () => {
  try {
    const { Product } = await import('../models/Product.js');
    await Product.createTable();
    await Product.createCategoriesTable();
    console.log('✅ Product service tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await pool.end();
  console.log('PostgreSQL connection closed through app termination');
  process.exit(0);
});

export { 
  connectDB, 
  query, 
  pool,
  initTables
};
