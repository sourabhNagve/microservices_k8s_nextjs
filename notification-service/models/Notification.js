import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

class Notification {
  // Create notifications table
  static async createTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error', 'order', 'payment', 'shipping', 'promotion')),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        channel VARCHAR(50) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms', 'push', 'webhook')),
        sent_at TIMESTAMP,
        read_at TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
      CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    `;

    try {
      await query(createTableQuery);
      console.log('✅ Notifications table created/verified');
    } catch (error) {
      console.error('❌ Error creating notifications table:', error);
      throw error;
    }
  }

  // Create notification templates table
  static async createTemplatesTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS notification_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error', 'order', 'payment', 'shipping', 'promotion')),
        subject VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        variables JSONB DEFAULT '{}',
        channel VARCHAR(50) DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_notification_templates_name ON notification_templates(name);
      CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(type);
      CREATE INDEX IF NOT EXISTS idx_notification_templates_channel ON notification_templates(channel);
    `;

    try {
      await query(createTableQuery);
      console.log('✅ Notification templates table created/verified');
    } catch (error) {
      console.error('❌ Error creating notification templates table:', error);
      throw error;
    }
  }

  // Create new notification
  static async create(notificationData) {
    const {
      userId,
      type,
      title,
      message,
      data,
      priority = 'normal',
      channel = 'in_app',
      expiresAt
    } = notificationData;

    const insertQuery = `
      INSERT INTO notifications (user_id, type, title, message, data, priority, channel, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        userId, type, title, message, JSON.stringify(data), priority, channel, expiresAt
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  // Get notifications by user
  static async findByUserId(userId, page = 1, limit = 20, unreadOnly = false) {
    let offset = (page - 1) * limit;
    let whereClause = 'WHERE n.user_id = $1';
    let queryParams = [userId];

    if (unreadOnly) {
      whereClause += ' AND n.is_read = FALSE';
    }

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as count
      FROM notifications n
      ${whereClause}
    `;

    const selectQuery = `
      SELECT n.*
      FROM notifications n
      ${whereClause}
      ORDER BY n.priority DESC, n.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const countResult = await query(countQuery, [...queryParams]);
      const total = parseInt(countResult.rows[0].count, 10);

      queryParams.push(limit, offset);
      const result = await query(selectQuery, queryParams);

      return { rows: result.rows, total };
    } catch (error) {
      console.error('❌ Error finding notifications by user:', error);
      throw error;
    }
  }

  // Get notification by ID
  static async findById(notificationId) {


    try {
      const result = await query(`SELECT * FROM notifications WHERE id = $1`, [notificationId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error finding notification by ID:', error);
      throw error;
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const updateQuery = `
      UPDATE notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    const updateQuery = `
      UPDATE notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND is_read = FALSE
    `;

    try {
      await query(updateQuery, [userId]);
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  // Delete notification
  static async delete(notificationId, userId) {
    const deleteQuery = `
      DELETE FROM notifications 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    try {
      const result = await query(deleteQuery, [notificationId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      throw error;
    }
  }

  // Create notification template
  static async createTemplate(templateData) {
    const {
      name,
      type,
      subject,
      content,
      channel = 'email',
      variables = {}
    } = templateData;

    const insertQuery = `
      INSERT INTO notification_templates (name, type, subject, content, channel, variables)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        name, type, subject, content, channel, JSON.stringify(variables)
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating notification template:', error);
      throw error;
    }
  }

  // Get notification template
  static async getTemplate(name) {
    const selectQuery = `
      SELECT * FROM notification_templates 
      WHERE name = $1 AND is_active = TRUE
    `;

    try {
      const result = await query(selectQuery, [name]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error getting notification template:', error);
      throw error;
    }
  }

  // Get unread count
  static async getUnreadCount(userId) {
    const selectQuery = `
      SELECT COUNT(*) as count
      FROM notifications 
      WHERE user_id = $1 AND is_read = FALSE
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;

    try {
      const result = await query(selectQuery, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      throw error;
    }
  }
}

export { Notification };
