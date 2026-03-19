export const API_CONFIG = {
  services: {
    authService:      process.env.NEXT_PUBLIC_AUTH_SERVICE_URL      || 'http://localhost:3001',
    productService:   process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL   || 'http://localhost:3003',
    cartService:      process.env.NEXT_PUBLIC_CART_SERVICE_URL      || 'http://localhost:3004', // ✅ was 3007, cart-service runs on 3004
    inventoryService: process.env.NEXT_PUBLIC_INVENTORY_SERVICE_URL || 'http://localhost:3005',
    orderService:     process.env.NEXT_PUBLIC_ORDER_SERVICE_URL     || 'http://localhost:3006',
    paymentService:   process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL   || 'http://localhost:3007', // ✅ payment is on 3007
  },
  timeout: 10000,
  retries: 3,
  auth: {
    tokenKey:        'auth_token',
    refreshTokenKey: 'refresh_token',
  },
};