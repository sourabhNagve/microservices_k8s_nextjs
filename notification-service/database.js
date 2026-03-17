import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.NOTIFICATION_DATABASE_URL || 'postgresql://postgres:password123@postgres:5432/notification-service',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
    const { Notification } = require('../models/Notification');
    await Notification.createTable();
    await Notification.createTemplatesTable();
    console.log('✅ Notification service tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  const client = await pool.connect();
  
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  } finally {
    client.release();
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
