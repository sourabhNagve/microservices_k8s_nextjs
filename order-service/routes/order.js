// import express from 'express';
// import Order from '../models/Order.js';
// import { publishToQueue } from '../utils/rabbitmq.js';
// import { validateOrder, validateOrderStatus, validateTracking, validateOrderId, validateUserId } from '../utils/validation.js';

// const router = express.Router();

// // Create new order
// router.post('/', async (req, res) => {
//   try {
//     const { error } = validateOrder(req.body);
//     if (error) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: error.details[0].message
//       });
//     }

//     const order = await Order.create(req.body);

//     res.status(201).json({
//       message: 'Order created successfully',
//       order
//     });
//   } catch (error) {
//     console.error('Create order error:', error);
//     res.status(500).json({
//       error: 'Failed to create order',
//       message: 'Internal server error'
//     });
//   }
// });


// // ─── Admin: Get all orders ────────────────────────────────────────────────────
// router.get('/admin/all', async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const status = req.query.status || null;

//     const result = await Order.findAll(page, limit, status);
//     const orders = Array.isArray(result) ? result : (result.orders ?? []);
//     const total = Array.isArray(result) ? orders.length : (result.total ?? orders.length);

//     res.json({ orders, total, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
//   } catch (error) {
//     console.error('Admin get all orders error:', error);
//     res.status(500).json({ error: 'Failed to fetch orders' });
//   }
// });

// // Get orders by user
// router.get('/user/:userId', async (req, res) => {
//   try {
//     const { error } = validateUserId({ userId: req.params.userId });
//     if (error) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: error.details[0].message
//       });
//     }

//     const { userId } = req.params;
//     const { page = 1, limit = 20, status } = req.query;

//     const result = await Order.findByUserId(userId, page, limit, status);
//     const orders = Array.isArray(result) ? result : (result.orders ?? []);
//     const total = Array.isArray(result) ? orders.length : (result.total ?? orders.length);

//     res.json({
//       orders,
//       total,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (error) {
//     console.error('Get orders error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch orders',
//       message: 'Internal server error'
//     });
//   }
// });

// // Get order statistics
// router.get('/user/:userId/stats', async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const { startDate, endDate } = req.query;

//     const stats = await Order.getOrderStats(userId, startDate, endDate);

//     res.json({ stats });
//   } catch (error) {
//     console.error('Get order stats error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch order statistics',
//       message: 'Internal server error'
//     });
//   }
// });


// // Get order by ID
// router.get('/:orderId', async (req, res) => {
//   try {
//     const { error } = validateOrderId({ orderId: req.params.orderId });
//     if (error) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: error.details[0].message
//       });
//     }

//     const { orderId } = req.params;
//     const order = await Order.findById(orderId);

//     if (!order) {
//       return res.status(404).json({
//         error: 'Order not found'
//       });
//     }

//     res.json({ order });
//   } catch (error) {
//     console.error('Get order error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch order',
//       message: 'Internal server error'
//     });
//   }
// });

// // Update order status
// router.patch('/:orderId/status', async (req, res) => {
//   try {
//     const { error } = validateOrderStatus(req.body);
//     if (error) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: error.details[0].message
//       });
//     }

//     const { orderId } = req.params;
//     const { status, notes } = req.body;

//     const order = await Order.updateStatus(orderId, status, notes);

//     if (!order) {
//       return res.status(404).json({
//         error: 'Order not found'
//       });
//     }

//     try {
//       const queueName = `order.${status}`; // order.shipped, order.delivered, order.cancelled
//       if (['shipped', 'delivered', 'cancelled'].includes(status)) {
//         await publishToQueue(queueName, {
//           orderId: order.id,
//           orderNumber: order.order_number,
//           status,
//           notes,
//           userId: order.user_id,
//           shippingInfo: {
//             firstName: order.shipping_first_name,
//             lastName: order.shipping_last_name,
//             email: order.shipping_email,
//           },
//           updatedAt: order.updated_at,
//         });
//       }
//     } catch (mqErr) {
//       // Non-critical — status already updated, just log
//       console.warn('[order-service] RabbitMQ publish failed (non-critical):', mqErr.message);
//     }

//     res.json({
//       message: 'Order status updated successfully',
//       order
//     });
//   } catch (error) {
//     console.error('Update order status error:', error);
//     res.status(500).json({
//       error: 'Failed to update order status',
//       message: 'Internal server error'
//     });
//   }
// });

// // Add tracking information
// router.post('/:orderId/tracking', async (req, res) => {
//   try {
//     const { error } = validateTracking(req.body);
//     if (error) {
//       return res.status(400).json({
//         error: 'Validation failed',
//         details: error.details[0].message
//       });
//     }

//     const { orderId } = req.params;
//     const { trackingNumber, carrier, estimatedDelivery } = req.body;

//     const order = await Order.addTracking(orderId, trackingNumber, carrier, estimatedDelivery);

//     if (!order) {
//       return res.status(404).json({
//         error: 'Order not found'
//       });
//     }

//     res.json({
//       message: 'Tracking information added successfully',
//       order
//     });
//   } catch (error) {
//     console.error('Add tracking error:', error);
//     res.status(500).json({
//       error: 'Failed to add tracking information',
//       message: 'Internal server error'
//     });
//   }
// });

// // Mark order as delivered
// router.patch('/:orderId/deliver', async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { notes } = req.body;

//     const order = await Order.markAsDelivered(orderId, notes);

//     if (!order) {
//       return res.status(404).json({
//         error: 'Order not found'
//       });
//     }

//     res.json({
//       message: 'Order marked as delivered successfully',
//       order
//     });
//   } catch (error) {
//     console.error('Mark as delivered error:', error);
//     res.status(500).json({
//       error: 'Failed to mark order as delivered',
//       message: 'Internal server error'
//     });
//   }
// });

// // Cancel order
// router.patch('/:orderId/cancel', async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const { reason } = req.body;

//     const order = await Order.cancel(orderId, reason);

//     if (!order) {
//       return res.status(404).json({
//         error: 'Order not found or cannot be cancelled'
//       });
//     }

//     res.json({
//       message: 'Order cancelled successfully',
//       order
//     });
//   } catch (error) {
//     console.error('Cancel order error:', error);
//     res.status(500).json({
//       error: 'Failed to cancel order',
//       message: 'Internal server error'
//     });
//   }
// });

// // Get order status history
// router.get('/:orderId/history', async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const history = await Order.getStatusHistory(orderId);

//     res.json({
//       orderId,
//       history
//     });
//   } catch (error) {
//     console.error('Get status history error:', error);
//     res.status(500).json({
//       error: 'Failed to fetch status history',
//       message: 'Internal server error'
//     });
//   }
// });



// export default router;


import express from 'express';
import Order   from '../models/Order.js';
import { publishToQueue }    from '../utils/rabbitmq.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  validateOrder, validateOrderStatus, validateTracking,
  validateOrderId, validateUserId,
} from '../utils/validation.js';

const router = express.Router();

// ─── Create order — authenticated users only ──────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { error } = validateOrder(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }
    const order = await Order.create(req.body);
    res.status(201).json({ message: 'Order created successfully', order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ─── Admin: get all orders ────────────────────────────────────────────────────
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const status = req.query.status || null;

    const result = await Order.findAll(page, limit, status);
    const orders = Array.isArray(result) ? result : (result.orders ?? []);
    const total  = Array.isArray(result) ? orders.length : (result.total ?? orders.length);

    res.json({ orders, total, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Admin get all orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ─── Get orders by user — owner only ─────────────────────────────────────────
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { error } = validateUserId({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }

    const { userId } = req.params;

    // ✅ users can only see their own orders — admins can see anyone's
    const requestingUser = req.user.userId.toString();
    const targetUser     = userId.toString();

    // Convert both to UUID format for comparison
    const normalizeId = (id) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(String(id))) return String(id);
      return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
    };

    const normalizedRequesting = normalizeId(requestingUser);
    const normalizedTarget     = normalizeId(targetUser);

    if (!req.user.isAdmin && normalizedRequesting !== normalizedTarget) {
      return res.status(403).json({ error: 'Access denied — you can only view your own orders' });
    }

    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const { status } = req.query;

    const result = await Order.findByUserId(userId, page, limit, status);
    const orders = Array.isArray(result) ? result : (result.orders ?? []);
    const total  = Array.isArray(result) ? orders.length : (result.total ?? orders.length);

    res.json({ orders, total, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ─── Get order stats — owner only ────────────────────────────────────────────
router.get('/user/:userId/stats', authenticate, async (req, res) => {
  try {
    const { userId }             = req.params;
    const { startDate, endDate } = req.query;
    const stats = await Order.getOrderStats(userId, startDate, endDate);
    res.json({ stats });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

// ─── Get order by ID — authenticated, owner or admin ─────────────────────────
router.get('/:orderId', authenticate, async (req, res) => {
  try {
    const { error } = validateOrderId({ orderId: req.params.orderId });
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // ✅ only owner or admin can view order detail
    const normalizeId = (id) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(String(id))) return String(id);
      return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
    };

    const requestingUser = normalizeId(req.user.userId);
    const orderOwner     = normalizeId(order.user_id);

    if (!req.user.isAdmin && requestingUser !== orderOwner) {
      return res.status(403).json({ error: 'Access denied — you can only view your own orders' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ─── Update order status — admin only ────────────────────────────────────────
router.patch('/:orderId/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateOrderStatus(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }

    const { status, notes } = req.body;
    const order = await Order.updateStatus(req.params.orderId, status, notes);
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

// ─── Add tracking — admin only ────────────────────────────────────────────────
router.post('/:orderId/tracking', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateTracking(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }
    const { trackingNumber, carrier, estimatedDelivery } = req.body;
    const order = await Order.addTracking(req.params.orderId, trackingNumber, carrier, estimatedDelivery);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Tracking information added successfully', order });
  } catch (error) {
    console.error('Add tracking error:', error);
    res.status(500).json({ error: 'Failed to add tracking information' });
  }
});

// ─── Mark as delivered — admin only ──────────────────────────────────────────
router.patch('/:orderId/deliver', authenticate, requireAdmin, async (req, res) => {
  try {
    const order = await Order.markAsDelivered(req.params.orderId, req.body.notes);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order marked as delivered successfully', order });
  } catch (error) {
    console.error('Mark as delivered error:', error);
    res.status(500).json({ error: 'Failed to mark order as delivered' });
  }
});

// ─── Cancel order — authenticated, owner or admin ────────────────────────────
router.patch('/:orderId/cancel', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // ✅ only owner or admin can cancel
    const normalizeId = (id) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(String(id))) return String(id);
      return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
    };

    if (!req.user.isAdmin && normalizeId(req.user.userId) !== normalizeId(order.user_id)) {
      return res.status(403).json({ error: 'Access denied — you can only cancel your own orders' });
    }

    const cancelled = await Order.cancel(req.params.orderId, req.body.reason);
    if (!cancelled) return res.status(400).json({ error: 'Order cannot be cancelled' });
    res.json({ message: 'Order cancelled successfully', order: cancelled });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ─── Get status history — authenticated ──────────────────────────────────────
router.get('/:orderId/history', authenticate, async (req, res) => {
  try {
    const history = await Order.getStatusHistory(req.params.orderId);
    res.json({ orderId: req.params.orderId, history });
  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

export default router;