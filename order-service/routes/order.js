import express from 'express';
import Order from '../models/Order.js';
import { validateOrder, validateOrderStatus, validateTracking, validateOrderId, validateUserId } from '../utils/validation.js';

const router = express.Router();

// Create new order
router.post('/', async (req, res) => {
  try {
    const { error } = validateOrder(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const order = await Order.create(req.body);
    
    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      error: 'Failed to create order', 
      message: 'Internal server error' 
    });
  }
});

// Get orders by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { error } = validateUserId({ userId: req.params.userId });
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    
    const orders = await Order.findByUserId(userId, parseInt(page), parseInt(limit), status);
    
    res.json({
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(orders.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders', 
      message: 'Internal server error' 
    });
  }
});

// Get order by ID
router.get('/:orderId', async (req, res) => {
  try {
    const { error } = validateOrderId({ orderId: req.params.orderId });
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order', 
      message: 'Internal server error' 
    });
  }
});

// Update order status
router.patch('/:orderId/status', async (req, res) => {
  try {
    const { error } = validateOrderStatus(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { orderId } = req.params;
    const { status, notes } = req.body;

    const order = await Order.updateStatus(orderId, status, notes);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      error: 'Failed to update order status', 
      message: 'Internal server error' 
    });
  }
});

// Add tracking information
router.post('/:orderId/tracking', async (req, res) => {
  try {
    const { error } = validateTracking(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { orderId } = req.params;
    const { trackingNumber, carrier, estimatedDelivery } = req.body;

    const order = await Order.addTracking(orderId, trackingNumber, carrier, estimatedDelivery);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    res.json({
      message: 'Tracking information added successfully',
      order
    });
  } catch (error) {
    console.error('Add tracking error:', error);
    res.status(500).json({ 
      error: 'Failed to add tracking information', 
      message: 'Internal server error' 
    });
  }
});

// Mark order as delivered
router.patch('/:orderId/deliver', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;

    const order = await Order.markAsDelivered(orderId, notes);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    res.json({
      message: 'Order marked as delivered successfully',
      order
    });
  } catch (error) {
    console.error('Mark as delivered error:', error);
    res.status(500).json({ 
      error: 'Failed to mark order as delivered', 
      message: 'Internal server error' 
    });
  }
});

// Cancel order
router.patch('/:orderId/cancel', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.cancel(orderId, reason);
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found or cannot be cancelled' 
      });
    }

    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel order', 
      message: 'Internal server error' 
    });
  }
});

// Get order status history
router.get('/:orderId/history', async (req, res) => {
  try {
    const { orderId } = req.params;
    const history = await Order.getStatusHistory(orderId);
    
    res.json({
      orderId,
      history
    });
  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch status history', 
      message: 'Internal server error' 
    });
  }
});

// Get order statistics
router.get('/user/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    const stats = await Order.getOrderStats(userId, startDate, endDate);
    
    res.json({ stats });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order statistics', 
      message: 'Internal server error' 
    });
  }
});

export default router;
