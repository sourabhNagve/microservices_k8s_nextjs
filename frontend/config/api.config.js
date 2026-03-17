// API Configuration for Microservices
export const API_CONFIG = {
  // Service endpoints
  services: {
    authService: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'http://localhost:3001',
    productService: process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL || 'http://localhost:3003',
    cartService: process.env.NEXT_PUBLIC_CART_SERVICE_URL || 'http://localhost:3007',
    inventoryService: process.env.NEXT_PUBLIC_INVENTORY_SERVICE_URL || 'http://localhost:3005',
  },
  
  // API settings
  timeout: 10000,
  retries: 3,
  
  // Authentication
  auth: {
    tokenKey: 'auth_token',
    refreshTokenKey: 'refresh_token',
  },
};
