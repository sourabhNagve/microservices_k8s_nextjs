import express from 'express';
import jwt from 'jsonwebtoken';
import { Notification } from '../models/Notification.js';
import { validateNotification, validateNotificationTemplate } from '../utils/validation.js';

const router = express.Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────
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

// ─── GET /user/:userId — get notifications by user ───────────────────────────
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ownership check: users can only read their own notifications
    if (req.user.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    // Clamp pagination parameters to prevent abuse (e.g. ?limit=999999)
    const clampedPage  = Math.max(parseInt(page,  10) || 1, 1);
    const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    
    const notifications = await Notification.findByUserId(
      userId, 
      clampedPage, 
      clampedLimit, 
      unreadOnly === 'true'
    );
    
    res.json({
      notifications,
      pagination: {
        page: clampedPage,
        limit: clampedLimit,
        totalPages: Math.ceil(notifications.length / clampedLimit)
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

// ─── GET /user/:userId/unread-count ──────────────────────────────────────────
router.get('/user/:userId/unread-count', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
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

// ─── GET /:notificationId — get notification by ID ───────────────────────────
// FIX: added ownership check — without it any authenticated user could read any
// notification by guessing its UUID.
router.get('/:notificationId', authenticate, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findById(notificationId);
    
    if (!notification) {
      return res.status(404).json({ 
        error: 'Notification not found' 
      });
    }

    // Ownership check: only the notification owner or an admin may view it
    if (req.user.userId !== notification.user_id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
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

// ─── POST / — create new notification (admin only) ──────────────────────────
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateNotification(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const notification = await Notification.create(value);
    
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

// ─── PATCH /:notificationId/read — mark notification as read ─────────────────
router.patch('/:notificationId/read', authenticate, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.userId;

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

// ─── PATCH /user/:userId/read-all — mark all notifications as read ──────────
router.patch('/user/:userId/read-all', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
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

// ─── DELETE /:notificationId — delete notification ───────────────────────────
router.delete('/:notificationId', authenticate, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.userId;

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

// ─── POST /templates — create notification template (admin only) ─────────────
router.post('/templates', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateNotificationTemplate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const template = await Notification.createTemplate(value);
    
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

// ─── GET /templates/:name — get notification template ────────────────────────
router.get('/templates/:name', authenticate, async (req, res) => {
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

export default router;
