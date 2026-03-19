import express from 'express';
import { Notification } from '../models/Notification.js';
import { validateNotification, validateNotificationTemplate } from '../utils/validation.js';
const router = express.Router();

// Get notifications by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const notifications = await Notification.findByUserId(
      userId, 
      parseInt(page), 
      parseInt(limit), 
      unreadOnly === 'true'
    );
    
    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(notifications.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notifications', 
      message: 'Internal server error' 
    });
  }
});

// Get unread count
router.get('/user/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const count = await Notification.getUnreadCount(userId);
    
    res.json({
      userId,
      unreadCount: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch unread count', 
      message: 'Internal server error' 
    });
  }
});

// Get notification by ID
router.get('/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    res.json({ notification });
  } catch (error) {
    console.error('Get notification error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notification', 
      message: 'Internal server error' 
    });
  }
});

// Create new notification
router.post('/', async (req, res) => {
  try {
    const { error } = validateNotification(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const notification = await Notification.create(req.body);
    
    res.status(201).json({
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ 
      error: 'Failed to create notification', 
      message: 'Internal server error' 
    });
  }
});

// Mark notification as read
router.patch('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    const notification = await Notification.markAsRead(notificationId, userId);
    
    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ 
      error: 'Failed to mark notification as read', 
      message: 'Internal server error' 
    });
  }
});

// Mark all notifications as read
router.patch('/user/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    
    await Notification.markAllAsRead(userId);
    
    res.json({
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ 
      error: 'Failed to mark all notifications as read', 
      message: 'Internal server error' 
    });
  }
});

// Delete notification
router.delete('/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    const notification = await Notification.delete(notificationId, userId);
    
    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    res.json({
      message: 'Notification deleted successfully',
      notification
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      error: 'Failed to delete notification', 
      message: 'Internal server error' 
    });
  }
});

// Create notification template
router.post('/templates', async (req, res) => {
  try {
    const { error } = validateNotificationTemplate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const template = await Notification.createTemplate(req.body);
    
    res.status(201).json({
      message: 'Notification template created successfully',
      template
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ 
      error: 'Failed to create notification template', 
      message: 'Internal server error' 
    });
  }
});

// Get notification template
router.get('/templates/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const template = await Notification.getTemplate(name);
    
    if (!template) {
      return res.status(404).json({ 
        error: 'Template not found' 
      });
    }

    res.json({ template });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch template', 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
