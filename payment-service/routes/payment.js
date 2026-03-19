import express from 'express';
import { Payment } from '../models/Payment.js';
import { validatePayment, validatePaymentMethod } from '../utils/validation.js';
import Stripe from 'stripe';

const router = express.Router();

// ✅ fail fast with a clear message instead of cryptic Stripe error
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not defined');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create payment intent
router.post('/payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', savePaymentMethod = false } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount', received: amount });
    }

    // Check if Stripe is properly initialized
    if (!stripe) {
      return res.status(500).json({ error: 'Payment service not properly configured' });
    }
    
    // Create payment intent with Stripe
    const paymentIntentParams = {
      amount: Math.round(amount),
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Only add setup_future_usage if savePaymentMethod is true
    if (savePaymentMethod) {
      paymentIntentParams.setup_future_usage = 'off_session';
    }
    
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    res.json({
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent', 
      type: error.type,
      code: error.code
    });
  }
});

// Get payments by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    
    const payments = await Payment.findByUserId(userId, parseInt(page), parseInt(limit), status);
    
    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(payments.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payments', 
      message: 'Internal server error' 
    });
  }
});

// Get payments by order
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payments = await Payment.findByOrderId(orderId);
    
    res.json({
      orderId,
      payments
    });
  } catch (error) {
    console.error('Get order payments error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order payments', 
      message: 'Internal server error' 
    });
  }
});

// Get user payment methods
router.get('/methods/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const paymentMethods = await Payment.getUserPaymentMethods(userId);
    
    res.json({
      paymentMethods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment methods', 
      message: 'Internal server error' 
    });
  }
});


// ✅ Verify Stripe payment intent and record it in DB
router.post('/verify-and-record', async (req, res) => {
  try {
    const { paymentIntentId, orderId, userId, amount } = req.body;

    if (!paymentIntentId || !orderId || !userId) {
      return res.status(400).json({ error: 'paymentIntentId, orderId and userId are required' });
    }

    // ✅ Verify with Stripe that payment actually succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: `Payment not completed. Status: ${paymentIntent.status}`,
      });
    }

    // ✅ Record in your payments database
    const payment = await Payment.create({
      orderId,
      userId,
      paymentMethod:         'card',
      provider:              'stripe',
      providerTransactionId: paymentIntentId,
      amount:                amount ?? paymentIntent.amount / 100,
      currency:              paymentIntent.currency.toUpperCase(),
      status:                'completed',
      processedAt:           new Date().toISOString(),
      gatewayResponse:       {
        id:             paymentIntent.id,
        status:         paymentIntent.status,
        paymentMethod:  paymentIntent.payment_method,
        amount:         paymentIntent.amount,
        currency:       paymentIntent.currency,
      },
    });

    res.status(201).json({
      message: 'Payment verified and recorded successfully',
      payment,
    });
  } catch (error) {
    console.error('Verify and record payment error:', error);
    res.status(500).json({ error: 'Failed to verify and record payment' });
  }
});


// Admin — get all payments
router.get('/admin/all', async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await Payment.findAll(page, limit);
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

// Get payment by ID
router.get('/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ 
        error: 'Payment not found' 
      });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch payment', 
      message: 'Internal server error' 
    });
  }
});



// Create new payment
router.post('/', async (req, res) => {
  try {
    const { error } = validatePayment(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const payment = await Payment.create(req.body);
    
    res.status(201).json({
      message: 'Payment created successfully',
      payment
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ 
      error: 'Failed to create payment', 
      message: 'Internal server error' 
    });
  }
});

// Update payment status
router.patch('/:paymentId/status', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, processedAt, failureReason } = req.body;

    if (!status) {
      return res.status(400).json({ 
        error: 'Status is required' 
      });
    }

    const additionalData = { processedAt, failureReason };
    const payment = await Payment.updateStatus(paymentId, status, additionalData);
    
    if (!payment) {
      return res.status(404).json({ 
        error: 'Payment not found' 
      });
    }

    res.json({
      message: 'Payment status updated successfully',
      payment
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ 
      error: 'Failed to update payment status', 
      message: 'Internal server error' 
    });
  }
});

// Process refund
router.post('/:paymentId/refund', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundAmount, reason } = req.body;

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ 
        error: 'Valid refund amount is required' 
      });
    }

    const payment = await Payment.processRefund(paymentId, parseFloat(refundAmount), reason);
    
    if (!payment) {
      return res.status(404).json({ 
        error: 'Payment not found or cannot be refunded' 
      });
    }

    res.json({
      message: 'Refund processed successfully',
      payment
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ 
      error: 'Failed to process refund', 
      message: 'Internal server error' 
    });
  }
});

// Save payment method
router.post('/methods', async (req, res) => {
  try {
    const { error } = validatePaymentMethod(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId } = req.body;
    const paymentMethod = await Payment.savePaymentMethod(userId, req.body);
    
    res.status(201).json({
      message: 'Payment method saved successfully',
      paymentMethod
    });
  } catch (error) {
    console.error('Save payment method error:', error);
    res.status(500).json({ 
      error: 'Failed to save payment method', 
      message: 'Internal server error' 
    });
  }
});



// Stripe webhook handler
// router.post('/webhook/stripe', async (req, res) => {
//   try {
//     const sig = req.headers['stripe-signature'];
//     const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
//     if (!sig) {
//       return res.status(400).json({ error: 'Stripe signature is required' });
//     }

//     const event = req.body;
    
//     // Verify webhook signature
//     if (!Payment.verifyWebhookSignature(event, sig, webhookSecret)) {
//       return res.status(400).json({ error: 'Invalid webhook signature' });
//     }

//     // Process the webhook event
//     switch (event.type) {
//       case 'payment_intent.succeeded':
//         await Payment.updateStatus(event.data.metadata.payment_id, 'completed', {
//           processedAt: new Date().toISOString()
//         });
//         break;
//       case 'payment_intent.payment_failed':
//         await Payment.updateStatus(event.data.metadata.payment_id, 'failed', {
//           failureReason: event.data.last_payment_error?.message
//         });
//         break;
//       default:
//         console.log(`Unhandled webhook event: ${event.type}`);
//     }

//     res.json({ received: true });
//   } catch (error) {
//     console.error('Stripe webhook error:', error);
//     res.status(500).json({ 
//       error: 'Webhook processing failed', 
//       message: 'Internal server error' 
//     });
//   }
// });
router.post('/webhook/stripe', async (req, res) => {
  try {
    const sig           = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ error: 'Webhook configuration missing' });
    }

    // ✅ constructEvent needs raw buffer — works because we used express.raw() above
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await Payment.updateStatus(event.data.object.metadata.payment_id, 'completed', {
          processedAt: new Date().toISOString(),
        });
        break;
      case 'payment_intent.payment_failed':
        await Payment.updateStatus(event.data.object.metadata.payment_id, 'failed', {
          failureReason: event.data.object.last_payment_error?.message,
        });
        break;
      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
