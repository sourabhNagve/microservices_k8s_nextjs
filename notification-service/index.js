import express    from 'express';
import dotenv     from 'dotenv';
import cors       from 'cors';
import helmet     from 'helmet';
import rateLimit  from 'express-rate-limit';

dotenv.config();

// ─── Environment validation ───────────────────────────────────────────────────
const requiredEnvVars = ['JWT_SECRET', 'RABBITMQ_URL', 'NOTIFICATION_DATABASE_URL'];
for (const v of requiredEnvVars) {
  if (!process.env[v]) {
    console.error(`❌ Missing required environment variable: ${v}`);
    process.exit(1);
  }
}
console.log('✅ Environment variables validated');

import { connectRabbitMQ, consumeFromQueue } from './utils/rabbitmq.js';
import { sendOrderConfirmedEmail }           from './utils/emailService.js';
import notificationRoutes                    from './routes/notification.js';
import { connectDB, initTables }             from './database.js';

const app  = express();
const PORT = parseInt(process.env.NOTIFICATION_SERVICE_PORT, 10) || 3008;

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));

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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/notifications', notificationRoutes);

// ─── RabbitMQ consumers ───────────────────────────────────────────────────────
const startConsumers = async () => {
  await connectRabbitMQ();

  // ✅ Listen for order.created → send confirmation email
  await consumeFromQueue('order.created', async (orderData) => {
    const {
      orderNumber,
      items        = [],
      shippingInfo = {},
      totalAmount,
      subtotal,
      taxAmount,
      shippingCost,
    } = orderData;

    // Get recipient email — from shippingInfo or billingInfo
    const to = shippingInfo.email ?? orderData.billingInfo?.email;

    if (!to) {
      console.warn(`⚠️ No email address found for order ${orderNumber} — skipping`);
      return;
    }

    await sendOrderConfirmedEmail({
      to,
      orderNumber,
      items,
      shippingInfo,
      totals: {
        totalAmount,
        subtotal,
        taxAmount,
        shippingCost,
      },
    });
  });
};

// ─── Error handler ────────────────────────────────────────────────────────────
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

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use('/*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();
    await initTables();
    await startConsumers();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Notification service running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    const shutdown = (signal) => {
      console.log(`\n${signal} — shutting down notification service...`);
      server.close(() => { console.log('✅ HTTP server closed'); process.exit(0); });
      setTimeout(() => { console.error('❌ Forced exit after timeout'); process.exit(1); }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start notification service:', error);
    process.exit(1);
  }
};

startServer();