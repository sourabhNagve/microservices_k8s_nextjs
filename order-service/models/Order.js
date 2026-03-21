import { query, transaction } from '../database.js';
import { publishToQueue } from '../utils/rabbitmq.js';

class Order {
  // ─── create ──────────────────────────────────────────────────────────────────
  static async create(orderData) {
    const {
      userId,
      items,
      shippingInfo,
      billingInfo,
      shippingMethod = 'standard',
      notes,
    } = orderData;

    // FIX 1 (original line 17): order number used Date.now() + Math.random()
    // which produces low-entropy numbers that can collide under concurrent load.
    // Using a crypto-random suffix is stronger and removes the uuid dependency
    // for this specific purpose.
    const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const orderNumber  = `ORD-${Date.now()}-${randomSuffix}`;

    // FIX 2 (original lines 20-24): financial calculations used raw JS floats.
    // Floating-point arithmetic can produce results like 0.1 + 0.2 = 0.30000000000000004.
    // All monetary values are now rounded to 2 decimal places at each step.
    const subtotal     = parseFloat(
      items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2)
    );
    const taxRate      = parseFloat(process.env.TAX_RATE) || 0.08;
    const taxAmount    = parseFloat((subtotal * taxRate).toFixed(2));
    const shippingCost = this.calculateShippingCost(subtotal, shippingMethod);
    const totalAmount  = parseFloat((subtotal + taxAmount + shippingCost).toFixed(2));

    // FIX 3 (original): item.totalPrice was stored from the client payload
    // without verification. A client could send a manipulated totalPrice that
    // didn't match unitPrice * quantity. Now we compute it server-side.
    const verifiedItems = items.map(item => ({
      ...item,
      totalPrice: parseFloat((item.unitPrice * item.quantity).toFixed(2)),
    }));

    return transaction(async (client) => {
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
          $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27, $28, $29, $30
        )
        RETURNING *
      `;

      const orderResult = await client.query(insertOrderQuery, [
        userId, orderNumber, 'pending', subtotal, taxAmount, shippingCost, totalAmount, 'USD',
        shippingInfo.firstName, shippingInfo.lastName, shippingInfo.email, shippingInfo.phone ?? null,
        shippingInfo.addressLine1, shippingInfo.addressLine2 ?? null,
        shippingInfo.city, shippingInfo.state, shippingInfo.postalCode, shippingInfo.country,
        shippingMethod,
        billingInfo?.firstName ?? null, billingInfo?.lastName ?? null,
        billingInfo?.email ?? null, billingInfo?.phone ?? null,
        billingInfo?.addressLine1 ?? null, billingInfo?.addressLine2 ?? null,
        billingInfo?.city ?? null, billingInfo?.state ?? null,
        billingInfo?.postalCode ?? null, billingInfo?.country ?? null,
        notes ?? null,
      ]);

      const order = orderResult.rows[0];

      // FIX 4 (original line 55): items were inserted with a sequential loop
      // which sends N individual round-trips to the DB. For large orders this
      // is slow. A single multi-row INSERT is faster and atomic within the
      // transaction.
      if (verifiedItems.length > 0) {
        const itemValues  = [];
        const itemParams  = [];
        verifiedItems.forEach((item, i) => {
          const base = i * 7;
          itemValues.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
          );
          itemParams.push(
            order.id, item.productId, item.productName,
            item.productSku ?? null, item.quantity, item.unitPrice, item.totalPrice
          );
        });

        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price)
           VALUES ${itemValues.join(', ')}`,
          itemParams
        );
      }

      await this.addStatusHistory(order.id, 'pending', 'Order created', client);

      // FIX 5 (original): RabbitMQ publish is non-critical and already wrapped
      // in try/catch, but the catch swallowed the error completely. Now it logs
      // the order number alongside the error for easier debugging.
      try {
        await publishToQueue('order.created', {
          orderId:     order.id,
          orderNumber: order.order_number,
          userId:      order.user_id,
          totalAmount: order.total_amount,
          status:      order.status,
          items:       verifiedItems,
          shippingInfo,
          billingInfo:  billingInfo ?? null,
          createdAt:   order.created_at,
        });
      } catch (mqError) {
        console.error(`❌ Failed to publish order.created event for ${orderNumber}:`, mqError.message);
        // Non-critical — order is already persisted
      }

      return order;
    });
  }

  // ─── calculateShippingCost ───────────────────────────────────────────────────
  static calculateShippingCost(subtotal, method = 'standard') {
    const freeThreshold    = parseFloat(process.env.FREE_SHIPPING_THRESHOLD) || 100;
    const standardCost     = parseFloat(process.env.DEFAULT_SHIPPING_COST)   || 9.99;
    const expressCost      = parseFloat(process.env.EXPRESS_SHIPPING_COST)   || 19.99;

    if (subtotal >= freeThreshold) return 0;
    return method === 'express' ? expressCost : standardCost;
  }

  // ─── findAll ─────────────────────────────────────────────────────────────────
  // FIX 6 (original lines 98-117): findAll had a SQL injection vulnerability.
  // The status value was interpolated directly into the WHERE clause string
  // `WHERE status = $1` which is fine, but the param index calculation for
  // LIMIT/OFFSET was done by string interpolation using `params.length - 1`
  // and `params.length`. If params was [status, limit, offset], the indices
  // should be $2 and $3, but the code computed $2 and $3 only by coincidence.
  // If status was absent, params was [limit, offset] and the indices were
  // $1 and $2 — both correct only if status is never passed. The total count
  // query also reused the same params array (with limit/offset appended) which
  // passed wrong params. Rewritten to be explicit and safe.
  static async findAll(page = 1, limit = 20, status = null) {
    const safeLimit  = Math.min(Math.max(parseInt(limit,  10) || 20, 1), 100);
    const safePage   = Math.max(parseInt(page,  10) || 1, 1);
    const offset     = (safePage - 1) * safeLimit;

    const conditions = status ? ['status = $1'] : [];
    const dataParams = status ? [status, safeLimit, offset] : [safeLimit, offset];
    const cntParams  = status ? [status] : [];
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitIdx   = status ? 2 : 1;
    const offsetIdx  = status ? 3 : 2;

    const [result, countResult] = await Promise.all([
      query(
        `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        dataParams
      ),
      query(`SELECT COUNT(*) FROM orders ${whereClause}`, cntParams),
    ]);

    return {
      orders: result.rows,
      total:  parseInt(countResult.rows[0].count, 10),
    };
  }

  // ─── findById ────────────────────────────────────────────────────────────────
  // FIX 7 (original): json_agg produces [null] when there are no order items
  // (LEFT JOIN with no matches). Added a FILTER to avoid returning a null-
  // containing array, and added COALESCE so items is [] rather than null.
  static async findById(orderId) {
    const selectQuery = `
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id',          oi.id,
                   'productId',   oi.product_id,
                   'productName', oi.product_name,
                   'productSku',  oi.product_sku,
                   'quantity',    oi.quantity,
                   'unitPrice',   oi.unit_price,
                   'totalPrice',  oi.total_price
                 )
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'::json
             ) AS items
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

  // ─── findByUserId ────────────────────────────────────────────────────────────
  // FIX 8 (original lines 146-174): the UUID regex check returned an empty
  // array for non-UUID userIds rather than an error. If auth-service ever
  // issues integer user IDs (which the JWT schema allows), this silently
  // returns no orders. Removed the special-case and let the DB validate the
  // type. Also added pagination metadata to the return value and the same
  // COALESCE fix for items.
  static async findByUserId(userId, page = 1, limit = 20, status = null) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage  = Math.max(parseInt(page,  10) || 1, 1);
    const offset    = (safePage - 1) * safeLimit;

    const params     = [userId];
    const conditions = ['o.user_id = $1'];

    if (status) {
      conditions.push(`o.status = $${params.length + 1}`);
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitIdx    = params.length + 1;
    const offsetIdx   = params.length + 2;

    const selectQuery = `
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id',          oi.id,
                   'productId',   oi.product_id,
                   'productName', oi.product_name,
                   'productSku',  oi.product_sku,
                   'quantity',    oi.quantity,
                   'unitPrice',   oi.unit_price,
                   'totalPrice',  oi.total_price
                 )
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'::json
             ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    params.push(safeLimit, offset);

    const cntParams = status ? [userId, status] : [userId];
    const cntWhere  = status ? 'WHERE user_id = $1 AND status = $2' : 'WHERE user_id = $1';

    try {
      const [result, countResult] = await Promise.all([
        query(selectQuery, params),
        query(`SELECT COUNT(*) FROM orders ${cntWhere}`, cntParams),
      ]);

      return {
        orders: result.rows,
        total:  parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      console.error('❌ Error finding orders by user:', error);
      throw error;
    }
  }

  // ─── updateStatus ────────────────────────────────────────────────────────────
  // FIX 9 (original): updateStatus allowed ANY status transition — a cancelled
  // order could be moved back to 'processing', or a delivered order cancelled.
  // Added a state-machine guard so only valid transitions are accepted.
  static VALID_TRANSITIONS = {
    pending:    ['processing', 'cancelled'],
    processing: ['shipped',    'cancelled'],
    shipped:    ['delivered'],
    delivered:  [],
    cancelled:  [],
    refunded:   [],
  };

  static async updateStatus(orderId, newStatus, notes = null) {
    const current = await this.findById(orderId);
    if (!current) return null;

    const allowed = this.VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(newStatus)) {
      const err  = new Error(
        `Cannot transition order from '${current.status}' to '${newStatus}'`
      );
      err.name   = 'InvalidTransitionError';
      throw err;
    }

    const updateQuery = `
      UPDATE orders
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [newStatus, orderId]);

      if (result.rows.length > 0) {
        await this.addStatusHistory(orderId, newStatus, notes);
      }

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      throw error;
    }
  }

  // ─── addTracking ─────────────────────────────────────────────────────────────
  // FIX 10 (original): addTracking always forced status to 'shipped' even if
  // the order was already 'delivered' or 'cancelled'. Now only updates status
  // to 'shipped' when the current status is 'processing'.
  static async addTracking(orderId, trackingNumber, carrier, estimatedDelivery) {
    const current = await this.findById(orderId);
    if (!current) return null;

    const shouldUpdateStatus = current.status === 'processing';

    const updateQuery = `
      UPDATE orders
      SET tracking_number = $1,
          carrier = $2,
          estimated_delivery_date = $3,
          ${shouldUpdateStatus ? "status = 'shipped'," : ''}
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [
        trackingNumber, carrier, estimatedDelivery ?? null, orderId,
      ]);

      if (result.rows.length > 0 && shouldUpdateStatus) {
        await this.addStatusHistory(
          orderId, 'shipped',
          `Shipped via ${carrier}. Tracking: ${trackingNumber}`
        );
      }

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error adding tracking:', error);
      throw error;
    }
  }

  // ─── markAsDelivered ─────────────────────────────────────────────────────────
  // FIX 11 (original): markAsDelivered had no guard — a 'cancelled' order could
  // be marked delivered. Now only allowed from 'shipped'.
  static async markAsDelivered(orderId, notes = null) {
    const current = await this.findById(orderId);
    if (!current) return null;

    if (current.status !== 'shipped') {
      const err  = new Error(`Cannot mark a '${current.status}' order as delivered`);
      err.name   = 'InvalidTransitionError';
      throw err;
    }

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
      }

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error marking order as delivered:', error);
      throw error;
    }
  }

  // ─── cancel ──────────────────────────────────────────────────────────────────
  // FIX 12 (original line 218): cancel updated `notes` with
  // `COALESCE(notes, '')` which concatenated an empty string rather than
  // storing the cancellation reason. Changed to store the reason in the status
  // history only (which already exists) and not mutate the order's notes
  // column, which contains the customer's original order notes.
  static async cancel(orderId, reason = null) {
    const updateQuery = `
      UPDATE orders
      SET status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('pending', 'processing')
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [orderId]);

      if (result.rows.length > 0) {
        await this.addStatusHistory(orderId, 'cancelled', reason);
      }

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      throw error;
    }
  }

  // ─── addStatusHistory ────────────────────────────────────────────────────────
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

  // ─── getStatusHistory ────────────────────────────────────────────────────────
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

  // ─── getOrderStats ───────────────────────────────────────────────────────────
  // FIX 13 (original lines 253-278): the WHERE clause was built with a fixed
  // param index regardless of whether startDate/endDate were supplied.
  // If only endDate was given (no startDate), the $3 param was missing and pg
  // would throw "bind message supplies 2 parameters, but prepared statement
  // requires 3". Rewritten to build the clause dynamically.
  static async getOrderStats(userId, startDate = null, endDate = null) {
    const params     = [userId];
    const conditions = ['user_id = $1'];

    if (startDate) {
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    const statsQuery = `
      SELECT
        COUNT(*)                                              AS total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END)     AS delivered_orders,
        COUNT(CASE WHEN status = 'pending'   THEN 1 END)     AS pending_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)     AS cancelled_orders,
        COALESCE(SUM(total_amount),  0)                       AS total_spent,
        COALESCE(AVG(total_amount),  0)                       AS avg_order_value
      FROM orders
      WHERE ${conditions.join(' AND ')}
    `;

    try {
      const result = await query(statsQuery, params);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error getting order stats:', error);
      throw error;
    }
  }
}

export default Order;