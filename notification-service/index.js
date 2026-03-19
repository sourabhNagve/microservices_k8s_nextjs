import express    from 'express';
import dotenv     from 'dotenv';
import cors       from 'cors';
import helmet     from 'helmet';

dotenv.config();

import { connectRabbitMQ, consumeFromQueue } from './utils/rabbitmq.js';
import { sendOrderConfirmedEmail }           from './utils/emailService.js';

const app  = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3008;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'notification-service', timestamp: new Date().toISOString() });
});

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

// ─── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await startConsumers();
    app.listen(PORT, () => {
      console.log(`🚀 Notification service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start notification service:', error);
    process.exit(1);
  }
};

startServer();