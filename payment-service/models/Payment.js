import { query } from '../database.js';
import crypto from 'crypto';

class Payment {
  // ─── createTable ─────────────────────────────────────────────────────────────
  static async createTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payments (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id                UUID NOT NULL,
        user_id                 UUID NOT NULL,
        payment_method          VARCHAR(50) NOT NULL,
        provider                VARCHAR(50) NOT NULL,
        provider_transaction_id VARCHAR(255),
        amount                  DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
        currency                VARCHAR(3) DEFAULT 'USD',
        status                  VARCHAR(20) DEFAULT 'pending'
                                  CHECK (status IN ('pending','processing','completed','failed','refunded','cancelled')),
        gateway_response        JSONB,
        failure_reason          TEXT,
        processed_at            TIMESTAMP,
        created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_payments_order_id   ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id    ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status     ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_provider   ON payments(provider);
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

  // ─── createPaymentMethodsTable ───────────────────────────────────────────────
  static async createPaymentMethodsTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payment_methods (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL,
        method_type        VARCHAR(50) NOT NULL,
        provider           VARCHAR(50) NOT NULL,
        provider_method_id VARCHAR(255),
        is_default         BOOLEAN DEFAULT FALSE,
        card_last4         VARCHAR(4),
        card_brand         VARCHAR(50),
        card_expiry_month  INTEGER,
        card_expiry_year   INTEGER,
        billing_email      VARCHAR(255),
        is_active          BOOLEAN DEFAULT TRUE,
        created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id    ON payment_methods(user_id);
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

  // ─── create ──────────────────────────────────────────────────────────────────
  // FIX 1 (original): gatewayResponse was passed through JSON.stringify()
  // before being bound as a query parameter. PostgreSQL's JSONB column
  // already handles serialisation — double-encoding produces a string literal
  // `'{"key":"value"}'` stored inside the JSONB column instead of the parsed
  // JSON object `{"key":"value"}`. Removed the JSON.stringify() call.
  static async create(paymentData) {
    const {
      orderId,
      userId,
      paymentMethod,
      provider,
      amount,
      currency          = 'USD',
      gatewayResponse   = null,
      providerTransactionId = null,
      status            = 'pending',
      processedAt       = null,
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
        gatewayResponse,   // FIX 1: pass object directly — pg serialises JSONB
        status,
        processedAt,
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating payment:', error);
      throw error;
    }
  }

  // ─── findById ────────────────────────────────────────────────────────────────
  static async findById(paymentId) {
    try {
      const result = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error finding payment by ID:', error);
      throw error;
    }
  }

  // ─── findByOrderId ───────────────────────────────────────────────────────────
  static async findByOrderId(orderId) {
    try {
      const result = await query(
        'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
        [orderId]
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding payments by order:', error);
      throw error;
    }
  }

  // ─── findByUserId ────────────────────────────────────────────────────────────
  // FIX 2 (original lines 127-155): the param index calculation for LIMIT and
  // OFFSET used `params.length - 1` and `params.length` after push()ing
  // limit/offset onto the array. When status was supplied the indices were
  // $3/$4 (correct), but when status was absent the indices were $2/$3 while
  // params was [userId, limit, offset] — param $2 maps to limit, $3 maps to
  // offset, so the LIMIT and OFFSET were correct by coincidence. However the
  // query text still read `LIMIT $${params.length - 1} OFFSET $${params.length}`
  // which, after the push(), evaluated to LIMIT $2 OFFSET $3 without status
  // and LIMIT $3 OFFSET $4 with status — both accidentally correct but fragile
  // and impossible to reason about. Rewritten with explicit, predictable indices.
  //
  // FIX 3: no pagination total — the caller could not build accurate pagination
  // UI. Added a parallel COUNT(*) query.
  static async findByUserId(userId, page = 1, limit = 20, status = null) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset    = (Math.max(parseInt(page,  10) || 1, 1) - 1) * safeLimit;

    const params     = [userId];
    const conditions = ['user_id = $1'];

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limitIdx    = params.length + 1;
    const offsetIdx   = params.length + 2;

    const dataParams  = [...params, safeLimit, offset];
    const cntParams   = [...params];

    try {
      const [result, countResult] = await Promise.all([
        query(
          `SELECT * FROM payments ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          dataParams
        ),
        query(`SELECT COUNT(*) FROM payments ${whereClause}`, cntParams),
      ]);

      return {
        payments: result.rows,
        total:    parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      console.error('❌ Error finding payments by user:', error);
      throw error;
    }
  }

  // ─── updateStatus ────────────────────────────────────────────────────────────
  // FIX 4 (original lines 157-183): the UPDATE query was built with a
  // SET clause using param indices starting from $1, then the WHERE clause
  // also used $1 for paymentId. This produced a query like:
  //   SET status = $1, updated_at = ... WHERE id = $1
  // where $1 was bound to the status value — so the WHERE clause compared
  // id against the status string and always matched zero rows.
  // Fixed by using the correct sequential param index for each field.
  //
  // FIX 5: no valid-status guard — any string could be stored as status.
  // Added a check against the allowed list.
  static VALID_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];

  static async updateStatus(paymentId, status, additionalData = {}) {
    if (!this.VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid payment status '${status}'`);
    }

    const setClauses = [];
    const values     = [];

    // Param $1 = paymentId (used in WHERE)
    values.push(paymentId);

    // Build dynamic SET fields — param indices start at $2
    setClauses.push(`status = $${values.length + 1}`);
    values.push(status);

    if (status === 'completed' && additionalData.processedAt) {
      setClauses.push(`processed_at = $${values.length + 1}`);
      values.push(additionalData.processedAt);
    }

    if (status === 'failed' && additionalData.failureReason) {
      setClauses.push(`failure_reason = $${values.length + 1}`);
      values.push(additionalData.failureReason);
    }

    const updateQuery = `
      UPDATE payments
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, values);
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error updating payment status:', error);
      throw error;
    }
  }

  // ─── processRefund ───────────────────────────────────────────────────────────
  // FIX 6 (original): processRefund created the refund record with
  // amount: -Math.abs(refundAmount). Negative amounts violate the DB-level
  // CHECK (amount >= 0) constraint and will always fail with a constraint
  // violation. Refund records should use a positive amount with a transaction
  // type of 'refund' so the sign is conveyed by the payment_method field, not
  // by a negative amount. Changed to store the positive absolute value.
  //
  // FIX 7: no validation that refundAmount <= original payment amount — a
  // caller could refund more than was charged. Added the check.
  static async processRefund(paymentId, refundAmount, reason = 'Customer requested refund') {
    // Fetch the original payment first to validate the refund amount
    const original = await this.findById(paymentId);
    if (!original) return null;
    if (original.status !== 'completed') return null;

    // FIX 7: prevent over-refunding
    if (refundAmount > parseFloat(original.amount)) {
      throw new Error(
        `Refund amount (${refundAmount}) exceeds original payment amount (${original.amount})`
      );
    }

    const updateQuery = `
      UPDATE payments
      SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'completed'
      RETURNING *
    `;

    try {
      const result = await query(updateQuery, [paymentId]);
      if (!result.rows[0]) return null;

      // FIX 6: store positive refund amount; 'refund' method conveys direction
      await this.create({
        orderId:       result.rows[0].order_id,
        userId:        result.rows[0].user_id,
        paymentMethod: 'refund',
        provider:      'system',
        amount:        Math.abs(refundAmount),  // FIX 6: positive value
        currency:      result.rows[0].currency,
        status:        'completed',
        processedAt:   new Date().toISOString(),
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

  // ─── savePaymentMethod ───────────────────────────────────────────────────────
  // FIX 8 (original): when isDefault was true, the existing default was cleared
  // with a plain UPDATE, and then the new method was inserted in a separate
  // statement. If the INSERT failed, the previous default was already cleared —
  // leaving the user with no default payment method. Both operations must be
  // in a transaction.
  //
  // FIX 9: card expiry validation was left entirely to the caller. Added a
  // server-side check so an expired card cannot be saved.
  static async savePaymentMethod(userId, methodData) {
    const {
      methodType, provider, providerMethodId,
      isDefault = false, cardLast4, cardBrand,
      cardExpiryMonth, cardExpiryYear, billingEmail,
    } = methodData;

    // FIX 9: reject saving a card with a past expiry date
    if (cardExpiryMonth && cardExpiryYear) {
      const now        = new Date();
      const expiryDate = new Date(cardExpiryYear, cardExpiryMonth - 1, 1);
      const monthEnd   = new Date(cardExpiryYear, cardExpiryMonth, 0, 23, 59, 59); // last day of month
      if (monthEnd < now) {
        throw new Error('Cannot save an expired card');
      }
    }

    // FIX 8: use a transaction so the default-clear and the insert are atomic
    const { pool } = await import('../database.js');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (isDefault) {
        await client.query(
          'UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1',
          [userId]
        );
      }

      const result = await client.query(
        `INSERT INTO payment_methods (
           user_id, method_type, provider, provider_method_id,
           is_default, card_last4, card_brand,
           card_expiry_month, card_expiry_year, billing_email
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          userId, methodType, provider, providerMethodId ?? null,
          isDefault, cardLast4 ?? null, cardBrand ?? null,
          cardExpiryMonth ?? null, cardExpiryYear ?? null, billingEmail ?? null,
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error saving payment method:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── getUserPaymentMethods ───────────────────────────────────────────────────
  static async getUserPaymentMethods(userId) {
    try {
      const result = await query(
        `SELECT * FROM payment_methods
         WHERE user_id = $1 AND is_active = TRUE
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting payment methods:', error);
      throw error;
    }
  }

  // ─── findAll ─────────────────────────────────────────────────────────────────
  // FIX 10 (original): no pagination limit clamping and no status filter for
  // the admin endpoint. Also runs count in parallel for efficiency.
  static async findAll(page = 1, limit = 20, status = null) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offset    = (Math.max(parseInt(page,  10) || 1, 1) - 1) * safeLimit;

    const conditions = status ? ['status = $1'] : [];
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const dataParams  = status ? [status, safeLimit, offset] : [safeLimit, offset];
    const cntParams   = status ? [status] : [];
    const limitIdx    = status ? 2 : 1;
    const offsetIdx   = status ? 3 : 2;

    try {
      const [result, countResult] = await Promise.all([
        query(
          `SELECT * FROM payments ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          dataParams
        ),
        query(`SELECT COUNT(*) FROM payments ${whereClause}`, cntParams),
      ]);

      return {
        payments: result.rows,
        total:    parseInt(countResult.rows[0].count, 10),
      };
    } catch (error) {
      console.error('❌ Error finding all payments:', error);
      throw error;
    }
  }

  // ─── generateSignature / verifyWebhookSignature ───────────────────────────
  // FIX 11: for Stripe webhooks the app now uses stripe.webhooks.constructEvent()
  // (in the route handler) which is the correct Stripe-specific approach.
  // These helpers are kept for non-Stripe webhooks / internal use.
  static generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
      .digest('hex');
  }

  static verifyWebhookSignature(payload, signature, secret) {
    const expected    = this.generateSignature(payload, secret);
    const expectedBuf = Buffer.from(expected,   'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }
}

export default Payment;
export { Payment };