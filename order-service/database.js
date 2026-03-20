import dotenv from 'dotenv';
import { Pool } from 'pg';


// Load root environment file

dotenv.config();

// Database connection
const connectionString = process.env.ORDER_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('ORDER_DATABASE_URL or DATABASE_URL environment variable must be set');
}

// Aiven database SSL configuration
const sslConfig = {
  rejectUnauthorized: false, // Allow self-signed certificates for Aiven
};

// Remove sslmode from connection string and handle via SSL config
const cleanConnectionString = connectionString.replace(/sslmode=[^&]*&?/, '').replace(/\?$/, '');

console.log('🔗 Attempting database connection to:', cleanConnectionString.replace(/password=[^&]+/, 'password=***'));

const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: sslConfig,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Helper function to execute queries
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`Query executed in ${duration}ms`);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Helper function to execute transactions
export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔒 Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
    console.log('🔓 Client released');
  }
};

// Initialize database tables
export const connectDB = async () => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔌 Database connection attempt ${attempt}/${maxRetries}...`);
      
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Connected to Aiven order service database');
      return;
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('💀 All database connection attempts failed');
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

// Initialize tables
export const initTables = async () => {
  try {
    await createOrdersTable();
    await createOrderItemsTable();
    await createOrderStatusTable();
    console.log('✅ All order tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

// Create orders table
const createOrdersTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      order_number VARCHAR(50) UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
      subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
      tax_amount DECIMAL(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
      shipping_cost DECIMAL(10,2) DEFAULT 0 CHECK (shipping_cost >= 0),
      total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
      currency VARCHAR(3) DEFAULT 'USD',
      
      -- Shipping information
      shipping_first_name VARCHAR(100) NOT NULL,
      shipping_last_name VARCHAR(100) NOT NULL,
      shipping_email VARCHAR(255) NOT NULL,
      shipping_phone VARCHAR(20),
      shipping_address_line1 VARCHAR(255) NOT NULL,
      shipping_address_line2 VARCHAR(255),
      shipping_city VARCHAR(100) NOT NULL,
      shipping_state VARCHAR(100) NOT NULL,
      shipping_postal_code VARCHAR(20) NOT NULL,
      shipping_country VARCHAR(100) NOT NULL,
      shipping_method VARCHAR(50) DEFAULT 'standard',
      
      -- Billing information
      billing_first_name VARCHAR(100),
      billing_last_name VARCHAR(100),
      billing_email VARCHAR(255),
      billing_phone VARCHAR(20),
      billing_address_line1 VARCHAR(255),
      billing_address_line2 VARCHAR(255),
      billing_city VARCHAR(100),
      billing_state VARCHAR(100),
      billing_postal_code VARCHAR(20),
      billing_country VARCHAR(100),
      
      -- Tracking and timestamps
      tracking_number VARCHAR(100),
      carrier VARCHAR(50),
      estimated_delivery_date TIMESTAMP,
      actual_delivery_date TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
  `;

  await query(createTableQuery);
};

// Create order items table
const createOrderItemsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id UUID NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      product_sku VARCHAR(100),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
      total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
  `;

  await query(createTableQuery);
};

// Create order status history table
const createOrderStatusTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS order_status_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_order_status_order_id ON order_status_history(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_status_created_at ON order_status_history(created_at);
  `;

  await query(createTableQuery);
};

export default pool;
