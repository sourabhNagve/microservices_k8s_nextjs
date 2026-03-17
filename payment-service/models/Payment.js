import { query } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class Payment {
  // Create payments table
  static async createTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL,
        user_id UUID NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_transaction_id VARCHAR(255),
        amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
        gateway_response JSONB,
        failure_reason TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
      CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    `;

    try {
      await query(createTableQuery);
      console.log('✅ Payments table created/verified');
    } catch (error) {
      console.error('❌ Error creating payments table:', error);
      throw error;
    }
  }

  // Create payment methods table
  static async createPaymentMethodsTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payment_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        method_type VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_method_id VARCHAR(255),
        is_default BOOLEAN DEFAULT FALSE,
        card_last4 VARCHAR(4),
        card_brand VARCHAR(50),
        card_expiry_month INTEGER,
        card_expiry_year INTEGER,
        billing_email VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(is_default);
    `;

    try {
      await query(createTableQuery);
      console.log('✅ Payment methods table created/verified');
    } catch (error) {
      console.error('❌ Error creating payment methods table:', error);
      throw error;
    }
  }

  // Create new payment
  static async create(paymentData) {
    const {
      orderId,
      userId,
      paymentMethod,
      provider,
      amount,
      currency = 'USD',
      gatewayResponse,
      providerTransactionId
    } = paymentData;

    const insertQuery = `
      INSERT INTO payments (order_id, user_id, payment_method, provider, provider_transaction_id, amount, currency, gateway_response)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        orderId, userId, paymentMethod, provider, providerTransactionId, 
        amount, currency, JSON.stringify(gatewayResponse)
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating payment:', error);
      throw error;
    }
  }

  // Get payment by ID
  static async findById(paymentId) {
    const selectQuery = `
      SELECT p.*, o.order_number, u.email as user_email
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `;

    try {
      const result = await query(selectQuery, [paymentId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error finding payment by ID:', error);
      throw error;
    }
  }

  // Get payments by order ID
  static async findByOrderId(orderId) {
    const selectQuery = `
      SELECT p.*, u.email as user_email
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.order_id = $1
      ORDER BY p.created_at DESC
    `;

    try {
      const result = await query(selectQuery, [orderId]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding payments by order:', error);
      throw error;
    }
  }

  // Get payments by user ID
  static async findByUserId(userId, page = 1, limit = 20, status = null) {
    let offset = (page - 1) * limit;
    let whereClause = 'WHERE p.user_id = $1';
    let queryParams = [userId];

    if (status) {
      whereClause += ' AND p.status = $2';
      queryParams.push(status);
    }

    const selectQuery = `
      SELECT p.*, o.order_number
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    queryParams.push(limit, offset);

    try {
      const result = await query(selectQuery, queryParams);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding payments by user:', error);
      throw error;
    }
  }

  // Update payment status
  static async updateStatus(paymentId, status, additionalData = {}) {
    const fields = ['status'];
    const values = [status];
    let paramIndex = 2;

    // Add additional fields
    if (status === 'completed' && additionalData.processedAt) {
      fields.push('processed_at');
      values.push(additionalData.processedAt);
    }

    if (status === 'failed' && additionalData.failureReason) {
      fields.push('failure_reason');
      values.push(additionalData.failureReason);
    }

    const updateQuery = `
      UPDATE payments 
      SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    values.unshift(paymentId);

    try {
      const result = await query(updateQuery, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating payment status:', error);
      throw error;
    }
  }

  // Process refund
  static async processRefund(paymentId, refundAmount, reason = 'Customer requested refund') {
    const updateQuery = `
      UPDATE payments 
      SET status = 'refunded', 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'completed'
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [paymentId]);
      
      // Create refund record
      await this.create({
        orderId: result.rows[0].order_id,
        userId: result.rows[0].user_id,
        paymentMethod: 'refund',
        provider: 'system',
        amount: -Math.abs(refundAmount),
        currency: result.rows[0].currency,
        gatewayResponse: JSON.stringify({
          originalPaymentId: paymentId,
          refundAmount: refundAmount,
          reason: reason
        })
      });

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      throw error;
    }
  }

  // Save payment method
  static async savePaymentMethod(userId, methodData) {
    const {
      methodType,
      provider,
      providerMethodId,
      isDefault = false,
      cardLast4,
      cardBrand,
      cardExpiryMonth,
      cardExpiryYear,
      billingEmail
    } = methodData;

    // If setting as default, unset other defaults
    if (isDefault) {
      await query('UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1', [userId]);
    }

    const insertQuery = `
      INSERT INTO payment_methods (user_id, method_type, provider, provider_method_id, is_default, card_last4, card_brand, card_expiry_month, card_expiry_year, billing_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        userId, methodType, provider, providerMethodId, isDefault,
        cardLast4, cardBrand, cardExpiryMonth, cardExpiryYear, billingEmail
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error saving payment method:', error);
      throw error;
    }
  }

  // Get user payment methods
  static async getUserPaymentMethods(userId) {
    const selectQuery = `
      SELECT * FROM payment_methods 
      WHERE user_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC, created_at DESC
    `;

    try {
      const result = await query(selectQuery, [userId]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting payment methods:', error);
      throw error;
    }
  }

  // Generate payment signature for webhooks
  static generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', JSON.stringify(payload))
      .update(secret)
      .digest('hex');
  }

  // Verify webhook signature
  static verifyWebhookSignature(payload, signature, secret) {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(signature, expectedSignature);
  }
}

export default Payment;
export { Payment };
