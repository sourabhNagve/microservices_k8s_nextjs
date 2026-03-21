import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import cartRoutes from './routes/cart.js';
import { connectDB, initTables, getRedisHealthy, getUseRedis } from './database.js';

dotenv.config();

// ─── Environment validation ───────────────────────────────────────────────────
// FIX 1 (original: none): the cart service had no env-var validation at all.
// JWT_SECRET is required because the auth middleware in routes/cart.js verifies
// tokens with it. Without this check, the service starts and silently accepts
// any token (jwt.verify with undefined secret throws on every request).
const requiredEnvVars = ['JWT_SECRET'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`❌ Missing required environment variable: ${v}`);
    process.exit(1);
  }
}
console.log('✅ Environment variables validated');

const app = express();
const PORT = parseInt(process.env.CART_SERVICE_PORT, 10) || 3004;

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// FIX 2 (original lines 17-20): use a validated CORS origin callback instead
// of a static array, consistent with auth-service. The original array mode
// also did not trim whitespace from the env var, so
// "http://a.com, http://b.com" silently blocked http://b.com.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// FIX 3 (original lines 23-26): added standardHeaders/legacyHeaders and
// reduced the body limit to 1mb (an e-commerce cart payload is never 10mb).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// FIX 4 (original line 30): reduced from 10mb to 1mb.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
// FIX 5 (original lines 33-38): health check now reports Redis status so a
// load balancer / Kubernetes readiness probe can route away from instances
// where Redis is down. Returns 503 when the storage layer is unhealthy.
app.get('/health', (_req, res) => {
  const isUsingRedis = getUseRedis();
  const storageOk    = isUsingRedis ? getRedisHealthy() : true;
  const status       = storageOk ? 'OK' : 'DEGRADED';
  const code         = storageOk ? 200  : 503;

  res.status(code).json({
    status,
    service:   'cart-service',
    timestamp: new Date().toISOString(),
    storage:   isUsingRedis
      ? (getRedisHealthy() ? 'redis:connected' : 'redis:unavailable')
      : 'memory',
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/cart', cartRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
// FIX 6 (original lines 43-48): handle CORS errors with 403, never leak the
// stack trace in production, and log a structured error object.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden', reason: 'CORS policy' });
  }

  console.error('❌ Unhandled error:', {
    method:  req.method,
    path:    req.path,
    message: err.message,
    ...(isDev && { stack: err.stack }),
  });

  res.status(err.status || 500).json({
    error: 'Something went wrong',
    ...(isDev && { message: err.message }),
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
// FIX 7 (original line 52): changed '*' to '/*' for Express 4/5 compatibility.
app.use('/*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Server startup ───────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    await initTables();

    // FIX 8 (original line 58): store the server reference for graceful shutdown.
    const server = app.listen(PORT, () => {
      console.log(`🚀 Cart service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // FIX 9: graceful shutdown — stop accepting new connections, let in-flight
    // requests finish, then exit. database.js handles Redis shutdown via its
    // own SIGINT/SIGTERM listeners so we only close the HTTP server here.
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down cart service...`);
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
      // Force-exit after 10 s if keep-alive connections stall the close.
      setTimeout(() => {
        console.error('❌ Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });

    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught exception:', err);
      shutdown('uncaughtException');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();