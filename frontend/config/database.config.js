// Database Configuration for Microservices
export const DATABASE_CONFIG = {
  // Shared database settings
  shared: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    name: process.env.DATABASE_NAME || 'microservices_db',
  },
  
  // Service-specific databases
  services: {
    user: {
      table: 'users',
      connectionPool: 10,
    },
    product: {
      table: 'products',
      connectionPool: 5,
    },
    order: {
      table: 'orders',
      connectionPool: 8,
    },
  },
};
