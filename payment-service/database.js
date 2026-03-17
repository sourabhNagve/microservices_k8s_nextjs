import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load root environment file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Database connection
const connectionString = process.env.PAYMENT_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:password123@postgres:5432/payment-service';

// Aiven database SSL configuration
const sslConfig = {
  rejectUnauthorized: false, // Allow self-signed certificates for Aiven
};

// Remove sslmode from connection string and handle via SSL config
const cleanConnectionString = connectionString.replace(/sslmode=[^&]*&?/, '').replace(/\?$/, '');

console.log('🔗 Payment service attempting database connection to:', cleanConnectionString.replace(/password=[^&]+/, 'password=***'));

const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: sslConfig,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

const connectDB = async () => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 Payment service database connection attempt ${attempt}/${maxRetries}...`);
      
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Connected to Aiven payment service database');
      return pool;
      
    } catch (error) {
      console.error(`❌ Payment service database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('💀 All payment service database connection attempts failed');
        console.error('🔍 Error details:', {
          code: error.code,
          severity: error.severity,
          hint: error.hint,
          routine: error.routine
        });
        throw error;
      }
      
      console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

// Initialize database tables
const initTables = async () => {
  try {
    const { Payment } = await import('./models/Payment.js');
    await Payment.createTable();
    await Payment.createPaymentMethodsTable();
    console.log('✅ Payment service tables initialized');
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
