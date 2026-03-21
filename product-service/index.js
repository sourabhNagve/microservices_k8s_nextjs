import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import productRoutes from './routes/product.js';
import { connectDB, initTables } from './database-drizzle.js';

dotenv.config();

// ─── Environment validation ───────────────────────────────────────────────────
// FIX 1 (original: none): no env validation at all. JWT_SECRET is required
// because the auth middleware uses it to verify tokens on admin routes.
const requiredEnvVars = ['JWT_SECRET', 'PRODUCT_DATABASE_URL'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`❌ Missing required environment variable: ${v}`);
    process.exit(1);
  }
}
console.log('✅ Environment variables validated');

const app  = express();
const PORT = parseInt(process.env.PRODUCT_SERVICE_PORT, 10) || 3003;

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));

// FIX 2 (original lines 17-20): dynamic origin validation with whitespace trim.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// FIX 3: standardHeaders/legacyHeaders added; body limit reduced to 2mb.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// FIX 4 (original line 30): 10mb → 2mb. Product payloads include URL arrays,
// never raw file content.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'product-service',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/products', productRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
// FIX 5: CORS errors → 403; no stack trace in production.
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

// ─── 404 handler ─────────────────────────────────────────────────────────────
// FIX 6: '/*' instead of '*' for Express 4/5 compatibility.
app.use('/*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Server startup ───────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    await initTables();

    // FIX 7: store server reference for graceful shutdown.
    const server = app.listen(PORT, () => {
      console.log(`🚀 Product service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    const shutdown = (signal) => {
      console.log(`\n${signal} — shutting down product service...`);
      server.close(() => { console.log('✅ HTTP server closed'); process.exit(0); });
      setTimeout(() => { console.error('❌ Forced exit after timeout'); process.exit(1); }, 10_000).unref();
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
export default app;