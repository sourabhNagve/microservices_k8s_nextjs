import express from 'express';
import { Payment } from '../models/Payment.js';
import { validatePayment, validatePaymentMethod } from '../utils/validation.js';
import Stripe from 'stripe';

const router = express.Router();

// FIX 1 (original): STRIPE_SECRET_KEY check was placed at module-scope and
// threw a bare Error — the thrown error was not caught by Express so it crashed
// the process. Kept the fast-fail check but as a clear startup guard that
// exits with a message rather than an uncaught exception.
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is not set');
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── Auth middleware ──────────────────────────────────────────────────────────
// FIX 2: every route was unauthenticated. Payment data is highly sensitive —
// any anonymous caller could read any user's payment history, trigger refunds,
// or save payment methods under another user's account. Added JWT auth
// middleware to all routes and ownership checks where the route acts on a
// specific user's data.
import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Ownership guard — caller must be the resource owner or an admin
function assertOwnership(req, res, resourceUserId) {
  if (String(req.user.userId) !== String(resourceUserId) && !req.user.isAdmin) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

// ─── POST /api/payments/payment-intent — authenticated ───────────────────────
// FIX 3 (original): amount was accepted as-is and passed to Stripe without
// validation against a reasonable maximum. A bug or malicious caller could
// create a payment intent for an arbitrary amount. Added a max cap and ensured
// the amount is a positive integer (Stripe requires amounts in smallest currency
// units — cents, not dollars).
router.post('/payment-intent', authenticate, async (req, res) => {
  try {
    const { amount, currency = 'usd', savePaymentMethod = false } = req.body;

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    // FIX 3: cap at $999,999.99 (Stripe's maximum for most currencies)
    const amountCents = Math.round(amount);
    if (amountCents > 99_999_999) {
      return res.status(400).json({ error: 'amount exceeds maximum allowed value' });
    }

    const paymentIntentParams = {
      amount:   amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
    };

    if (savePaymentMethod) {
      paymentIntentParams.setup_future_usage = 'off_session';
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.json({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: 'Failed to create payment intent', type: error.type, code: error.code });
  }
});

// ─── POST /api/payments/verify-and-record — authenticated ────────────────────
// FIX 4: must be declared BEFORE /:paymentId so Express does not match
// 'verify-and-record' as a paymentId parameter.
router.post('/verify-and-record', authenticate, async (req, res) => {
  try {
    const { paymentIntentId, orderId, userId, amount } = req.body;

    if (!paymentIntentId || !orderId || !userId) {
      return res.status(400).json({ error: 'paymentIntentId, orderId and userId are required' });
    }

    // FIX 5: caller can only record a payment for themselves
    if (!assertOwnership(req, res, userId)) return;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment not completed. Status: ${paymentIntent.status}` });
    }

    // FIX 6 (original): amount was taken from req.body without cross-checking
    // against the actual amount Stripe charged. A client could send amount=0.01
    // for a $100 intent and record a fraudulently low amount in the DB.
    // Always trust the amount from Stripe, not the client.
    const verifiedAmount = paymentIntent.amount / 100; // Stripe uses cents

    const payment = await Payment.create({
      orderId,
      userId,
      paymentMethod:         'card',
      provider:              'stripe',
      providerTransactionId: paymentIntentId,
      amount:                verifiedAmount,  // FIX 6
      currency:              paymentIntent.currency.toUpperCase(),
      status:                'completed',
      processedAt:           new Date().toISOString(),
      gatewayResponse: {
        id:            paymentIntent.id,
        status:        paymentIntent.status,
        paymentMethod: paymentIntent.payment_method,
        amount:        paymentIntent.amount,
        currency:      paymentIntent.currency,
      },
    });

    res.status(201).json({ message: 'Payment verified and recorded successfully', payment });
  } catch (error) {
    console.error('Verify and record payment error:', error);
    res.status(500).json({ error: 'Failed to verify and record payment' });
  }
});

// ─── POST /api/payments/methods — authenticated ───────────────────────────────
// FIX 4 (continued): must be before /:paymentId.
router.post('/methods', authenticate, async (req, res) => {
  try {
    const { error } = validatePaymentMethod(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }

    const { userId } = req.body;
    if (!assertOwnership(req, res, userId)) return;

    const paymentMethod = await Payment.savePaymentMethod(userId, req.body);
    res.status(201).json({ message: 'Payment method saved successfully', paymentMethod });
  } catch (error) {
    if (error.message?.includes('expired card')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Save payment method error:', error);
    res.status(500).json({ error: 'Failed to save payment method' });
  }
});

// ─── POST /api/payments/ — authenticated (admin) ────────────────────────────
// FIX 4 (continued): must be before /:paymentId.
// FIX 7: direct payment creation is an admin-only operation — a user should
// not be able to create an arbitrary payment record.
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validatePayment(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }
    const payment = await Payment.create(req.body);
    res.status(201).json({ message: 'Payment created successfully', payment });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// ─── GET /api/payments/admin/all — admin only ────────────────────────────────
// FIX 4 (continued): must be before /:paymentId.
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const status = req.query.status || null;

    const result = await Payment.findAll(page, limit, status);
    res.json({
      payments: result.payments,
      total:    result.total,
      pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
    });
  } catch (error) {
    console.error('Admin get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// ─── GET /api/payments/user/:userId — owner or admin ────────────────────────
// FIX 4 (continued): must be before /:paymentId.
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!assertOwnership(req, res, userId)) return;

    const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const status = req.query.status || null;

    const result = await Payment.findByUserId(userId, page, limit, status);

    res.json({
      payments: result.payments,
      total:    result.total,
      pagination: {
        page, limit,
        total:      result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// ─── GET /api/payments/order/:orderId — authenticated ────────────────────────
// FIX 4 (continued): must be before /:paymentId.
router.get('/order/:orderId', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const payments = await Payment.findByOrderId(orderId);

    // FIX 8: confirm the caller owns at least one of the payments for this
    // order (or is admin). Without this, any authenticated user could read
    // another user's payment history by guessing an orderId.
    if (!req.user.isAdmin && payments.length > 0) {
      const ownerUserId = String(payments[0].user_id);
      if (!assertOwnership(req, res, ownerUserId)) return;
    }

    res.json({ orderId, payments });
  } catch (error) {
    console.error('Get order payments error:', error);
    res.status(500).json({ error: 'Failed to fetch order payments' });
  }
});

// ─── GET /api/payments/methods/:userId — owner or admin ─────────────────────
// FIX 4 (continued): must be before /:paymentId.
router.get('/methods/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!assertOwnership(req, res, userId)) return;

    const paymentMethods = await Payment.getUserPaymentMethods(userId);
    res.json({ paymentMethods });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// ─── Stripe webhook — raw body, no auth (Stripe signs the request) ────────────
// FIX 9 (route ordering): the webhook route must come BEFORE the body-parsing
// middleware in index.js (already handled with express.raw()). Placing it here
// in the router is fine because the raw() middleware is registered at the app
// level for this specific path before express.json().
router.post('/webhook/stripe', async (req, res) => {
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Webhook configuration missing' });
  }

  let event;
  try {
    // FIX 10 (original commented-out version): the old version called
    // Payment.verifyWebhookSignature() with our custom HMAC. Stripe uses its
    // own timestamped signature scheme — using a plain HMAC over the payload
    // is NOT equivalent and is vulnerable to replay attacks. Always use
    // stripe.webhooks.constructEvent() which validates both the signature
    // AND the timestamp to prevent replays.
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await Payment.updateStatus(event.data.object.metadata?.payment_id, 'completed', {
          processedAt: new Date().toISOString(),
        });
        break;
      case 'payment_intent.payment_failed':
        await Payment.updateStatus(event.data.object.metadata?.payment_id, 'failed', {
          failureReason: event.data.object.last_payment_error?.message,
        });
        break;
      default:
        console.log(`Unhandled Stripe webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ─── GET /api/payments/:paymentId — owner or admin ───────────────────────────
// FIX 4 (continued): catch-all param route comes LAST.
router.get('/:paymentId', authenticate, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // FIX 11: ownership check — only the payment owner or an admin can view it
    if (!assertOwnership(req, res, payment.user_id)) return;

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// ─── PATCH /api/payments/:paymentId/status — admin only ──────────────────────
router.patch('/:paymentId/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, processedAt, failureReason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    let payment;
    try {
      payment = await Payment.updateStatus(req.params.paymentId, status, { processedAt, failureReason });
    } catch (err) {
      if (err.message?.includes('Invalid payment status')) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment status updated successfully', payment });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// ─── POST /api/payments/:paymentId/refund — admin only ───────────────────────
router.post('/:paymentId/refund', authenticate, requireAdmin, async (req, res) => {
  try {
    const { refundAmount, reason } = req.body;

    if (!refundAmount || typeof refundAmount !== 'number' || refundAmount <= 0) {
      return res.status(400).json({ error: 'Valid refund amount is required' });
    }

    let payment;
    try {
      payment = await Payment.processRefund(req.params.paymentId, parseFloat(refundAmount), reason);
    } catch (err) {
      if (err.message?.includes('exceeds original')) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found or cannot be refunded' });
    }

    res.json({ message: 'Refund processed successfully', payment });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;