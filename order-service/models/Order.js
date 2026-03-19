import { query, transaction } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { publishToQueue } from '../utils/rabbitmq.js';

class Order {
  // Create new order
  static async create(orderData) {
    const {
      userId,
      items,
      shippingInfo,
      billingInfo,
      shippingMethod = 'standard',
      notes
    } = orderData;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const taxRate = parseFloat(process.env.TAX_RATE) || 0.08;
    const taxAmount = subtotal * taxRate;
    const shippingCost = this.calculateShippingCost(subtotal, shippingMethod);
    const totalAmount = subtotal + taxAmount + shippingCost;

    return await transaction(async (client) => {
      // Insert order
      const insertOrderQuery = `
        INSERT INTO orders (
          user_id, order_number, status, subtotal, tax_amount, shipping_cost, total_amount, currency,
          shipping_first_name, shipping_last_name, shipping_email, shipping_phone,
          shipping_address_line1, shipping_address_line2, shipping_city, shipping_state,
          shipping_postal_code, shipping_country, shipping_method,
          billing_first_name, billing_last_name, billing_email, billing_phone,
          billing_address_line1, billing_address_line2, billing_city, billing_state,
          billing_postal_code, billing_country, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22,
          $23, $24, $25, $26, $27, $28, $29, $30
        )
        RETURNING *
      `;

      const orderResult = await client.query(insertOrderQuery, [
        userId, orderNumber, 'pending', subtotal, taxAmount, shippingCost, totalAmount, 'USD',
        shippingInfo.firstName, shippingInfo.lastName, shippingInfo.email, shippingInfo.phone,
        shippingInfo.addressLine1, shippingInfo.addressLine2, shippingInfo.city, shippingInfo.state,
        shippingInfo.postalCode, shippingInfo.country, shippingMethod,
        billingInfo?.firstName, billingInfo?.lastName, billingInfo?.email, billingInfo?.phone,
        billingInfo?.addressLine1, billingInfo?.addressLine2, billingInfo?.city, billingInfo?.state,
        billingInfo?.postalCode, billingInfo?.country, notes
      ]);

      const order = orderResult.rows[0];

      // Insert order items
      for (const item of items) {
        const insertItemQuery = `
          INSERT INTO order_items (
            order_id, product_id, product_name, product_sku, quantity, unit_price, total_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        await client.query(insertItemQuery, [
          order.id, item.productId, item.productName, item.productSku,
          item.quantity, item.unitPrice, item.totalPrice
        ]);
      }

      // Add initial status to history
      await this.addStatusHistory(order.id, 'pending', 'Order created', client);

      console.log(`✅ Order ${orderNumber} created successfully`);

      // Publish order created event to RabbitMQ
      try {
        await publishToQueue('order.created', {
          orderId: order.id,
          orderNumber: order.order_number,
          userId: order.user_id,
          totalAmount: order.total_amount,
          status: order.status,
          items: items,
          shippingInfo,
          billingInfo,
          createdAt: order.created_at
        });
        console.log(`✅ Order ${orderNumber} event published to RabbitMQ`);
      } catch (mqError) {
        console.error(`❌ Failed to publish order event to RabbitMQ:`, mqError.message);
        // Don't fail the order creation if MQ fails
      }

      return order;
    });
  }

  // Calculate shipping cost
  static calculateShippingCost(subtotal, method = 'standard') {
    const freeShippingThreshold = parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 100;
    const defaultShippingCost = parseFloat(process.env.DEFAULT_SHIPPING_COST) || 9.99;
    const expressShippingCost = parseFloat(process.env.EXPRESS_SHIPPING_COST) || 19.99;

    if (subtotal >= freeShippingThreshold) {
      return 0;
    }

    return method === 'express' ? expressShippingCost : defaultShippingCost;
  }

  static async findAll(page = 1, limit = 20, status = null) {
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (status) {
      where = 'WHERE status = $1';
      params.push(status);
    }

    params.push(limit, offset);

    const result = await query(`
    SELECT * FROM orders
    ${where}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM orders ${where}`,
      status ? [status] : []
    );

    return {
      orders: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  // Get order by ID
  static async findById(orderId) {
    const selectQuery = `
      SELECT o.*, 
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'productId', oi.product_id,
                 'productName', oi.product_name,
                 'productSku', oi.product_sku,
                 'quantity', oi.quantity,
                 'unitPrice', oi.unit_price,
                 'totalPrice', oi.total_price
               )
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `;

    try {
      const result = await query(selectQuery, [orderId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error finding order by ID:', error);
      throw error;
    }
  }

  // Get orders by user ID
  static async findByUserId(userId, page = 1, limit = 20, status = null) {
    const offset = (page - 1) * limit;

    // Handle different userId formats - if it's not a valid UUID, try to find orders by order_number pattern or return empty
    let whereClause, queryParams;

    // Check if userId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (typeof userId === 'string' && uuidRegex.test(userId)) {
      // Valid UUID - use exact match
      whereClause = 'WHERE o.user_id = $1';
      queryParams = [userId];
    } else {
      // Not a UUID - return empty result since we can't match
      console.warn(`⚠️ Invalid UUID format for userId: ${userId}, returning empty orders`);
      return [];
    }

    if (status) {
      whereClause += ' AND o.status = $' + (queryParams.length + 1);
      queryParams.push(status);
    }

    const selectQuery = `
      SELECT o.*, 
             json_agg(
               json_build_object(
                 'id', oi.id,
                 'productId', oi.product_id,
                 'productName', oi.product_name,
                 'productSku', oi.product_sku,
                 'quantity', oi.quantity,
                 'unitPrice', oi.unit_price,
                 'totalPrice', oi.total_price
               )
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(limit, offset);

    try {
      const result = await query(selectQuery, queryParams);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding orders by user:', error);
      throw error;
    }
  }

  // Update order status
  static async updateStatus(orderId, status, notes = null) {
    const updateQuery = `
      UPDATE orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [status, orderId]);

      if (result.rows.length > 0) {
        // Add to status history
        await this.addStatusHistory(orderId, status, notes);
        console.log(`✅ Order ${orderId} status updated to ${status}`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      throw error;
    }
  }

  // Add tracking information
  static async addTracking(orderId, trackingNumber, carrier, estimatedDelivery) {
    const updateQuery = `
      UPDATE orders 
      SET tracking_number = $1, 
          carrier = $2, 
          estimated_delivery_date = $3,
          status = 'shipped',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [trackingNumber, carrier, estimatedDelivery, orderId]);

      if (result.rows.length > 0) {
        await this.addStatusHistory(orderId, 'shipped', `Shipped via ${carrier}. Tracking: ${trackingNumber}`);
        console.log(`✅ Tracking added for order ${orderId}`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error adding tracking:', error);
      throw error;
    }
  }

  // Mark order as delivered
  static async markAsDelivered(orderId, notes = null) {
    const updateQuery = `
      UPDATE orders 
      SET status = 'delivered', 
          actual_delivery_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [orderId]);

      if (result.rows.length > 0) {
        await this.addStatusHistory(orderId, 'delivered', notes);
        console.log(`✅ Order ${orderId} marked as delivered`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error marking order as delivered:', error);
      throw error;
    }
  }

  // Cancel order
  static async cancel(orderId, reason = null) {
    const updateQuery = `
      UPDATE orders 
      SET status = 'cancelled', 
          notes = COALESCE(notes, ''),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('pending', 'processing')
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [orderId]);

      if (result.rows.length > 0) {
        await this.addStatusHistory(orderId, 'cancelled', reason);
        console.log(`✅ Order ${orderId} cancelled`);
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      throw error;
    }
  }

  // Add status history entry
  static async addStatusHistory(orderId, status, notes = null, client = null) {
    const insertQuery = `
      INSERT INTO order_status_history (order_id, status, notes)
      VALUES ($1, $2, $3)
    `;

    try {
      if (client) {
        await client.query(insertQuery, [orderId, status, notes]);
      } else {
        await query(insertQuery, [orderId, status, notes]);
      }
    } catch (error) {
      console.error('❌ Error adding status history:', error);
      throw error;
    }
  }

  // Get status history
  static async getStatusHistory(orderId) {
    const selectQuery = `
      SELECT * FROM order_status_history 
      WHERE order_id = $1 
      ORDER BY created_at DESC
    `;

    try {
      const result = await query(selectQuery, [orderId]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting status history:', error);
      throw error;
    }
  }

  // Get order statistics
  static async getOrderStats(userId, startDate = null, endDate = null) {
    let whereClause = 'WHERE user_id = $1';
    let queryParams = [userId];

    if (startDate) {
      queryParams.push(startDate);
      whereClause += ` AND created_at >= $${queryParams.length}`;
    }

    if (endDate) {
      queryParams.push(endDate);
      whereClause += ` AND created_at <= $${queryParams.length}`;
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        SUM(total_amount) as total_spent,
        AVG(total_amount) as avg_order_value
      FROM orders 
      ${whereClause}
    `;

    try {
      const result = await query(statsQuery, queryParams);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error getting order stats:', error);
      throw error;
    }
  }
}

export default Order;
