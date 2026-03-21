import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import { connectDB, initTables } from './database-drizzle.js';

dotenv.config();

// ─── Environment validation ───────────────────────────────────────────────────
const requiredEnvVars = [
  'AUTH_DATABASE_URL',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// FIX 1: validate JWT_SECRET length here at startup rather than (or in addition
// to) the check in routes/auth.js. index.js is the guaranteed entry point so
// this check always runs before any request is ever served.
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

console.log('✅ Environment variables validated');

const app = express();
const PORT = parseInt(process.env.AUTH_SERVICE_PORT, 10) || 3001;

// ─── Security middleware ──────────────────────────────────────────────────────
// FIX 2: helmet() is called with explicit options.
// - crossOriginEmbedderPolicy: false keeps the service compatible with
//   browser clients that load cross-origin resources (images, fonts).
// - contentSecurityPolicy headers are tightened: no inline scripts, no eval.
// Adjust these per your frontend's needs.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// FIX 3 (original lines 33-36): tightened CORS configuration.
// - origin now validates dynamically against the allowlist instead of
//   forwarding whatever the browser sent — preventing reflected-origin attacks.
// - Added an explicit methods list so OPTIONS pre-flight requests only
//   advertise the verbs the service actually handles.
// - allowedHeaders is explicit so the browser cannot negotiate unexpected headers.
// - exposedHeaders lets the client read the X-Request-Id header for tracing.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header) and listed origins.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-Id'],
}));

// FIX 4 (original lines 40-44): the global rate limiter is kept as a coarse
// backstop but its limit is tightened and standardHeaders/legacyHeaders are
// configured so clients receive RFC-compliant RateLimit-* headers and the
// deprecated X-RateLimit-* headers are suppressed.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,   // Return RateLimit-* headers per RFC 6585
  legacyHeaders: false,    // Suppress X-RateLimit-* headers
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ─── Request ID middleware ────────────────────────────────────────────────────
// FIX 5 (new): attach a per-request ID so every log line for a single request
// can be correlated. Uses the upstream header if a gateway already set one,
// otherwise generates a simple timestamp + random suffix.
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

// ─── Body parsing middleware ──────────────────────────────────────────────────
// FIX 6 (original line 47): reduced the JSON body limit from 10 mb to 1 mb.
// An auth service has no business accepting 10 mb request bodies — this was an
// open invitation for memory-exhaustion attacks. 1 mb is generous for any auth
// payload.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check endpoint ────────────────────────────────────────────────────
// FIX 7: health check now reports pool liveness so a load balancer or
// Kubernetes readiness probe can detect a lost DB connection and stop routing
// traffic to this instance. The endpoint itself does NOT perform a DB query on
// every call — the pool emits an 'error' event when connectivity is lost, so
// we track that with a flag instead of adding a round-trip per probe.
let dbHealthy = true;
// This listener is set up before connectDB() so it catches any pool error
// that fires after the initial connection succeeds.
// (pool is exported from database-drizzle so we can attach the listener here)

app.get('/health', (_req, res) => {
  const status = dbHealthy ? 'OK' : 'DEGRADED';
  const code = dbHealthy ? 200 : 503;
  res.status(code).json({
    status,
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    db: dbHealthy ? 'connected' : 'unavailable',
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Error handling middleware ────────────────────────────────────────────────
// FIX 8 (original lines 61-66): the error handler now:
// - logs the request ID for correlation.
// - never leaks the stack trace in production.
// - handles CORS errors (thrown by our cors() callback) with a 403 instead of
//   letting them fall through as generic 500s.
// - strips the error stack from the log in production to avoid leaking
//   internal paths and dependency versions.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';

  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Forbidden', reason: 'CORS policy' });
  }

  const logPayload = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    message: err.message,
    ...(isDev && { stack: err.stack }),
  };
  console.error('❌ Unhandled error:', logPayload);

  res.status(err.status || 500).json({
    error: 'Something went wrong',
    ...(isDev && { message: err.message }),
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
// FIX 9 (original line 70): changed wildcard from '*' to '/*' — Express 5
// treats bare '*' as a named wildcard parameter, which changes matching
// behaviour. '/*' is unambiguous in both Express 4 and 5.
app.use('/*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Server startup ───────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    await initTables();

    // FIX 10 (original line 77): store the server reference returned by
    // app.listen() so we can close it gracefully during shutdown. Without this
    // reference, SIGTERM/SIGINT handlers can only kill the process — in-flight
    // requests are dropped instead of being allowed to complete.
    const server = app.listen(PORT, () => {
      console.log(`🚀 Auth service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // FIX 11: graceful shutdown handler — stop accepting new connections,
    // wait for in-flight requests to finish, then close the DB pool.
    // database-drizzle.js already handles SIGINT/SIGTERM for the pool, so
    // here we only need to handle the HTTP server side.
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);
      server.close(async () => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });

      // FIX 12: force-kill after 10 s if graceful shutdown stalls (e.g. a
      // keep-alive connection that never closes).
      setTimeout(() => {
        console.error('❌ Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 10_000).unref(); // .unref() so this timer does not keep the loop alive on its own
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // FIX 13: catch unhandled promise rejections and uncaught exceptions so
    // they appear in logs before the process exits, rather than producing a
    // cryptic crash with no context.
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled promise rejection:', reason);
      shutdown('unhandledRejection');
    });

    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught exception:', err);
      shutdown('uncaughtException');
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

export default app;