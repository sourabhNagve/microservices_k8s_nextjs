import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

// ─── Connection setup ─────────────────────────────────────────────────────────
const connectionString = process.env.NOTIFICATION_DATABASE_URL;
if (!connectionString) {
  console.error('❌ NOTIFICATION_DATABASE_URL environment variable must be set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

// Catch pool-level errors so they don't crash the process as unhandled events.
pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL pool error:', err.message);
});

const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to database...');
    const client = await pool.connect();
    const { rows } = await client.query('SELECT NOW() AS now');
    client.release();

    console.log('✅ PostgreSQL Connected Successfully');
    console.log(`📅 Server time: ${rows[0].now}`);
    return pool;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

// Initialize database tables (uses dynamic import to avoid require() in ESM)
const initTables = async () => {
  try {
    const { Notification } = await import('./models/Notification.js');
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
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log('Executed query', { duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Query error:', error.message);
    throw error;
  }
};

export { 
  connectDB, 
  query, 
  pool,
  initTables
};
