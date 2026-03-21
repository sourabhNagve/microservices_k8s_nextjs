import express from 'express';
import Order from '../models/Order.js';
import { publishToQueue } from '../utils/rabbitmq.js';
import {
  validateOrder,
  validateOrderStatus,
  validateTracking,
  validateOrderId,
  validateUserId,
} from '../utils/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────
// FIX 1: extracted the repeated normalizeId function so it lives in one place.
// The original copied the same 4-line function verbatim into three different
// route handlers — a maintenance hazard.
//
// Note: the padding trick (000...userId) only works when auth-service and
// order-service agree that integer user IDs are acceptable. If both services
// always issue UUID user IDs this helper is unnecessary. It is kept here for
// backwards compatibility with the existing codebase but should be removed once
// user IDs are enforced as UUIDs end-to-end.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUserId(id) {
  const s = String(id);
  if (UUID_REGEX.test(s)) return s.toLowerCase();
  // Pad integer IDs into a deterministic UUID-shaped string
  return `00000000-0000-0000-0000-${s.padStart(12, '0')}`;
}

// ─── POST /api/orders — authenticated ────────────────────────────────────────
// FIX 2 (original routes file): the create route had no authentication at all
// in the commented-out version. The active version below keeps authenticate.
router.post('/', authenticate, async (req, res) => {
  try {
    const { error } = validateOrder(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    // FIX 3: enforce that the userId in the body matches the authenticated
    // user (admins may create orders on behalf of others). Without this a
    // logged-in user could create an order attributed to any userId they choose.
    const bodyUserId = normalizeUserId(req.body.userId);
    const tokenUserId = normalizeUserId(req.user.userId);
    if (!req.user.isAdmin && bodyUserId !== tokenUserId) {
      return res.status(403).json({ error: 'Cannot create an order for another user' });
    }

    const order = await Order.create(req.body);
    res.status(201).json({ message: 'Order created successfully', order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ─── GET /api/orders/admin/all — admin only ───────────────────────────────────
// FIX 4: must be declared BEFORE /:orderId so Express does not interpret
// 'admin' as an orderId parameter (same route-ordering issue fixed in
// product-service). Limit is also clamped server-side.
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const status = req.query.status || null;

    const result = await Order.findAll(page, limit, status);
    res.json({
      orders: result.orders,
      total:  result.total,
      pagination: {
        page, limit,
        total:      result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Admin get all orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ─── GET /api/orders/user/:userId — owner or admin ───────────────────────────
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { error } = validateUserId({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const { userId } = req.params;

    if (!req.user.isAdmin && normalizeUserId(req.user.userId) !== normalizeUserId(userId)) {
      return res.status(403).json({ error: 'Access denied — you can only view your own orders' });
    }

    const page   = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { status } = req.query;

    const result = await Order.findByUserId(userId, page, limit, status || null);
    res.json({
      orders: result.orders,
      total:  result.total,
      pagination: {
        page, limit,
        total:      result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ─── GET /api/orders/user/:userId/stats — owner or admin ─────────────────────
// FIX 5 (original): stats route had no ownership check — any authenticated user
// could fetch another user's order statistics.
router.get('/user/:userId/stats', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user.isAdmin && normalizeUserId(req.user.userId) !== normalizeUserId(userId)) {
      return res.status(403).json({ error: 'Access denied — you can only view your own stats' });
    }

    const { startDate, endDate } = req.query;
    const stats = await Order.getOrderStats(userId, startDate || null, endDate || null);
    res.json({ stats });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

// ─── GET /api/orders/:orderId — owner or admin ───────────────────────────────
router.get('/:orderId', authenticate, async (req, res) => {
  try {
    const { error } = validateOrderId({ orderId: req.params.orderId });
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!req.user.isAdmin && normalizeUserId(req.user.userId) !== normalizeUserId(order.user_id)) {
      return res.status(403).json({ error: 'Access denied — you can only view your own orders' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ─── PATCH /api/orders/:orderId/status — admin only ──────────────────────────
router.patch('/:orderId/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateOrderStatus(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const { status, notes } = req.body;

    let order;
    try {
      order = await Order.updateStatus(req.params.orderId, status, notes);
    } catch (err) {
      // FIX 6: surface invalid state-machine transitions as 422 rather than 500.
      if (err.name === 'InvalidTransitionError') {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    try {
      if (['shipped', 'delivered', 'cancelled'].includes(status)) {
        await publishToQueue(`order.${status}`, {
          orderId:     order.id,
          orderNumber: order.order_number,
          status, notes,
          userId:      order.user_id,
          shippingInfo: {
            firstName: order.shipping_first_name,
            lastName:  order.shipping_last_name,
            email:     order.shipping_email,
          },
          updatedAt: order.updated_at,
        });
      }
    } catch (mqErr) {
      console.warn('[order-service] RabbitMQ publish failed (non-critical):', mqErr.message);
    }

    res.json({ message: 'Order status updated successfully', order });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// ─── POST /api/orders/:orderId/tracking — admin only ─────────────────────────
router.post('/:orderId/tracking', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateTracking(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const { trackingNumber, carrier, estimatedDelivery } = req.body;
    const order = await Order.addTracking(
      req.params.orderId, trackingNumber, carrier, estimatedDelivery
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({ message: 'Tracking information added successfully', order });
  } catch (error) {
    console.error('Add tracking error:', error);
    res.status(500).json({ error: 'Failed to add tracking information' });
  }
});

// ─── PATCH /api/orders/:orderId/deliver — admin only ─────────────────────────
router.patch('/:orderId/deliver', authenticate, requireAdmin, async (req, res) => {
  try {
    let order;
    try {
      order = await Order.markAsDelivered(req.params.orderId, req.body.notes ?? null);
    } catch (err) {
      if (err.name === 'InvalidTransitionError') {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({ message: 'Order marked as delivered successfully', order });
  } catch (error) {
    console.error('Mark as delivered error:', error);
    res.status(500).json({ error: 'Failed to mark order as delivered' });
  }
});

// ─── PATCH /api/orders/:orderId/cancel — owner or admin ──────────────────────
router.patch('/:orderId/cancel', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!req.user.isAdmin && normalizeUserId(req.user.userId) !== normalizeUserId(order.user_id)) {
      return res.status(403).json({ error: 'Access denied — you can only cancel your own orders' });
    }

    // FIX 7: validate the reason length so arbitrarily large strings cannot be
    // stored in the status history notes column.
    const reason = req.body.reason ?? null;
    if (reason && typeof reason === 'string' && reason.length > 1000) {
      return res.status(400).json({ error: 'Cancellation reason cannot exceed 1000 characters' });
    }

    const cancelled = await Order.cancel(req.params.orderId, reason);
    if (!cancelled) {
      return res.status(400).json({
        error: 'Order cannot be cancelled — only pending or processing orders can be cancelled',
      });
    }

    res.json({ message: 'Order cancelled successfully', order: cancelled });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ─── GET /api/orders/:orderId/history — owner or admin ───────────────────────
// FIX 8 (original): history endpoint had no ownership check — any authenticated
// user could read the status history of any order by guessing an orderId.
router.get('/:orderId/history', authenticate, async (req, res) => {
  try {
    const { error } = validateOrderId({ orderId: req.params.orderId });
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!req.user.isAdmin && normalizeUserId(req.user.userId) !== normalizeUserId(order.user_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const history = await Order.getStatusHistory(req.params.orderId);
    res.json({ orderId: req.params.orderId, history });
  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

export default router;