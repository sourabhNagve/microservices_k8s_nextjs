// ════════════════════════════════════════════════════════════════════════════
// index.js — payment service entry point
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import paymentRoutes from './routes/payment.js';
import { connectDB } from './database.js';
import { Payment } from './models/Payment.js';

dotenv.config();

// ─── Environment validation ───────────────────────────────────────────────────
// FIX 1 (original: none): no env validation — service started silently even
// when JWT_SECRET or STRIPE_SECRET_KEY were missing.
const requiredEnvVars = ['JWT_SECRET', 'STRIPE_SECRET_KEY'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`❌ Missing required environment variable: ${v}`);
    process.exit(1);
  }
}
console.log('✅ Environment variables validated');

const app  = express();
const PORT = parseInt(process.env.PAYMENT_SERVICE_PORT || process.env.PORT, 10) || 3007;

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));

// FIX 2: dynamic CORS origin validation with whitespace trim.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// FIX 3: payment endpoints should have a stricter rate limit than other
// services — brute-forcing payment amounts is a real attack vector.
const limiter = rateLimit({
  windowMs:      15 * 60 * 1000,
  max:           60,   // tighter than other services
  standardHeaders: true,
  legacyHeaders:   false,
  message:       { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ─── Stripe webhook MUST receive raw body ─────────────────────────────────────
// FIX 4: this must be registered BEFORE express.json() so the webhook handler
// gets the raw buffer that Stripe signs — not the parsed JSON object.
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// ─── Body parsing ─────────────────────────────────────────────────────────────
// FIX 5 (original): reduced from 10mb to 2mb. Payment payloads never need
// 10mb — the large limit is an invitation for memory-exhaustion attacks.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'payment-service', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/payments', paymentRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
// FIX 6: CORS errors → 403; no stack trace in production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden', reason: 'CORS policy' });
  }
  console.error('❌ Unhandled error:', {
    method: req.method, path: req.path, message: err.message,
    ...(isDev && { stack: err.stack }),
  });
  res.status(err.status || 500).json({
    error: 'Something went wrong',
    ...(isDev && { message: err.message }),
  });
});

// FIX 7: '/*' instead of '*' for Express 4/5 compatibility.
app.use('/*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    // FIX 8 (original): initTables used a dynamic import() inside database.js
    // creating a circular dep. Call Payment methods directly from index.js.
    await Payment.createTable();
    await Payment.createPaymentMethodsTable();
    console.log('✅ Payment service tables initialized');

    // FIX 9: store server reference for graceful HTTP shutdown.
    const server = app.listen(PORT, () => {
      console.log(`🚀 Payment service running on port ${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    const shutdown = (signal) => {
      console.log(`\n${signal} — shutting down payment service...`);
      server.close(() => { console.log('✅ HTTP server closed'); process.exit(0); });
      setTimeout(() => { console.error('❌ Forced exit'); process.exit(1); }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('unhandledRejection', (r) => { console.error('❌ Unhandled rejection:', r); shutdown('unhandledRejection'); });
    process.on('uncaughtException',  (e) => { console.error('❌ Uncaught exception:', e);  shutdown('uncaughtException'); });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();