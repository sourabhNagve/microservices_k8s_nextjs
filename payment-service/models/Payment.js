import { query } from '../database.js';
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

  // ✅ Fixed — now includes status and processedAt in INSERT
  static async create(paymentData) {
    const {
      orderId,
      userId,
      paymentMethod,
      provider,
      amount,
      currency = 'USD',
      gatewayResponse,
      providerTransactionId,
      status = 'pending',  // ✅ added
      processedAt = null,       // ✅ added
    } = paymentData;

    const insertQuery = `
      INSERT INTO payments (
        order_id, user_id, payment_method, provider,
        provider_transaction_id, amount, currency,
        gateway_response, status, processed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        orderId, userId, paymentMethod, provider,
        providerTransactionId, amount, currency,
        JSON.stringify(gatewayResponse),
        status,       // ✅ added
        processedAt,  // ✅ added
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating payment:', error);
      throw error;
    }
  }

  // ✅ Fixed — removed JOIN with orders/users (different databases)
  static async findById(paymentId) {
    const selectQuery = `SELECT * FROM payments WHERE id = $1`;
    try {
      const result = await query(selectQuery, [paymentId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error finding payment by ID:', error);
      throw error;
    }
  }

  // ✅ Fixed — removed JOIN with users (different database)
  static async findByOrderId(orderId) {
    const selectQuery = `
      SELECT * FROM payments
      WHERE order_id = $1
      ORDER BY created_at DESC
    `;
    try {
      const result = await query(selectQuery, [orderId]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding payments by order:', error);
      throw error;
    }
  }

  // ✅ Fixed — removed JOIN with orders (different database)
  static async findByUserId(userId, page = 1, limit = 20, status = null) {
    const offset = (page - 1) * limit;
    const params = [userId];
    let where = 'WHERE user_id = $1';

    if (status) {
      where += ' AND status = $2';
      params.push(status);
    }

    params.push(limit, offset);

    const selectQuery = `
      SELECT * FROM payments
      ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    try {
      const result = await query(selectQuery, params);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding payments by user:', error);
      throw error;
    }
  }

  static async updateStatus(paymentId, status, additionalData = {}) {

    const fields = ['status'];
    const values = [status];

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

  static async processRefund(paymentId, refundAmount, reason = 'Customer requested refund') {
    const updateQuery = `
      UPDATE payments
      SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'completed'
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [paymentId]);
      if (!result.rows[0]) return null;

      await this.create({
        orderId: result.rows[0].order_id,
        userId: result.rows[0].user_id,
        paymentMethod: 'refund',
        provider: 'system',
        amount: -Math.abs(refundAmount),
        currency: result.rows[0].currency,
        gatewayResponse: {
          originalPaymentId: paymentId,
          refundAmount,
          reason,
        },
      });

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      throw error;
    }
  }

  static async savePaymentMethod(userId, methodData) {
    const {
      methodType, provider, providerMethodId,
      isDefault = false, cardLast4, cardBrand,
      cardExpiryMonth, cardExpiryYear, billingEmail,
    } = methodData;

    if (isDefault) {
      await query('UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1', [userId]);
    }

    const insertQuery = `
      INSERT INTO payment_methods (
        user_id, method_type, provider, provider_method_id,
        is_default, card_last4, card_brand,
        card_expiry_month, card_expiry_year, billing_email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    try {
      const result = await query(insertQuery, [
        userId, methodType, provider, providerMethodId,
        isDefault, cardLast4, cardBrand,
        cardExpiryMonth, cardExpiryYear, billingEmail,
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error saving payment method:', error);
      throw error;
    }
  }

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

  static async findAll(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const result = await query(`SELECT * FROM payments ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    const countResult = await query(`SELECT COUNT(*) FROM payments`);
    return {
      payments: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  static generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)                    // secret is the key
      .update(JSON.stringify(payload))                 // payload is the data
      .digest('hex');
  }
  static verifyWebhookSignature(payload, signature, secret) {
    const expected = this.generateSignature(payload, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;  // timingSafeEqual requires equal length
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }
}

export default Payment;
export { Payment };