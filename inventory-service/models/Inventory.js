import { db } from '../database-drizzle.js';
import { warehouses, inventory, inventoryTransactions } from './schema.js';
import { eq, and, desc, lt, sql } from 'drizzle-orm';

export class Inventory {
  static async createTables() {
    try {
      console.log('✅ Inventory tables initialized');
    } catch (error) {
      console.error('❌ Error creating inventory tables:', error);
      throw error;
    }
  }

  // ─── findByProduct ──────────────────────────────────────────────────────────
  // FIX 1 (original lines 18-36): the original built a query with an initial
  // .where(eq(inventory.productId, productId)) then called .where() AGAIN with
  // the warehouseId condition. In Drizzle ORM every .where() call REPLACES the
  // previous one — so when warehouseId was supplied, the productId filter was
  // silently discarded and the query returned inventory for ALL products in
  // that warehouse. Combined all conditions into a single and(...) call.
  static async findByProduct(productId, warehouseId = null) {
    try {
      const conditions = [eq(inventory.productId, productId)];
      if (warehouseId) conditions.push(eq(inventory.warehouseId, warehouseId));

      const results = await db
        .select({ inventory, warehouse: warehouses })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(and(...conditions))
        .orderBy(desc(inventory.quantity));

      return results;
    } catch (error) {
      console.error('❌ Error finding inventory by product:', error);
      throw error;
    }
  }

  static async findByProductId(productId) {
    return this.findByProduct(productId);
  }

  // ─── findByWarehouse ────────────────────────────────────────────────────────
  static async findByWarehouse(warehouseId) {
    try {
      return db
        .select({ inventory, warehouse: warehouses })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(eq(inventory.warehouseId, warehouseId))
        .orderBy(inventory.productId);
    } catch (error) {
      console.error('❌ Error finding inventory by warehouse:', error);
      throw error;
    }
  }

  // ─── findAll ────────────────────────────────────────────────────────────────
  // FIX 2 (original): no pagination — dumps the entire inventory table on
  // every call, which becomes unbounded as inventory grows. Added page/limit.
  static async findAll({ page = 1, limit = 50 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset    = (Math.max(parseInt(page,  10) || 1, 1) - 1) * safeLimit;

    try {
      const [results, [{ total }]] = await Promise.all([
        db.select({ inventory, warehouse: warehouses })
          .from(inventory)
          .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
          .orderBy(inventory.productId)
          .limit(safeLimit)
          .offset(offset),

        db.select({ total: sql`count(*)`.mapWith(Number) }).from(inventory),
      ]);

      return { results, total, page: parseInt(page, 10), limit: safeLimit };
    } catch (error) {
      console.error('❌ Error finding all inventory:', error);
      throw error;
    }
  }

  // ─── upsert ─────────────────────────────────────────────────────────────────
  // FIX 3 (original lines 82-118): the read-then-write pattern has a race
  // condition — two concurrent requests can both read "not found" and then both
  // INSERT, causing a unique-constraint violation. Replaced with a proper
  // INSERT ... ON CONFLICT DO UPDATE which is atomic in PostgreSQL.
  //
  // FIX 4 (original): minStock / maxStock used `|| default` which silently
  // accepted 0 (falsy) and substituted the default. Changed to `?? default`
  // (nullish coalescing) so an explicit 0 is accepted as a valid threshold.
  static async upsert(data) {
    try {
      const {
        productId, warehouseId, quantity,
        minStock = 5, maxStock = 100, location = null,
      } = data;

      const [result] = await db
        .insert(inventory)
        .values({ productId, warehouseId, quantity, minStock, maxStock, location })
        .onConflictDoUpdate({
          target: [inventory.productId, inventory.warehouseId],
          set: {
            quantity,
            minStock:  sql`EXCLUDED.min_stock`,
            maxStock:  sql`EXCLUDED.max_stock`,
            location:  sql`EXCLUDED.location`,
            updatedAt: new Date(),
          },
        })
        .returning();

      return result;
    } catch (error) {
      console.error('❌ Error upserting inventory:', error);
      throw error;
    }
  }

  // ─── updateStock ────────────────────────────────────────────────────────────
  // FIX 5 (original lines 121-135): updateStock set stock to an absolute value
  // without any DB-level guard. Two concurrent requests could both read
  // quantity=10, one adds 5 (writes 15), the other subtracts 3 (also reads 10,
  // writes 7) — the add is lost. Now uses SQL expressions for relative changes
  // with GREATEST(0, ...) to prevent negative stock, and requires an operation
  // type to distinguish add / subtract / set.
  static async updateStock(productId, warehouseId, delta, operation = 'set') {
    try {
      let stockExpr;
      if (operation === 'add') {
        stockExpr = sql`${inventory.quantity} + ${delta}`;
      } else if (operation === 'subtract') {
        // FIX 5 (continued): GREATEST prevents stock from going negative at
        // the DB level, even under concurrent requests.
        stockExpr = sql`GREATEST(${inventory.quantity} - ${delta}, 0)`;
      } else {
        if (delta < 0) throw new Error('Stock quantity cannot be set to a negative value');
        stockExpr = delta;
      }

      const [updated] = await db
        .update(inventory)
        .set({ quantity: stockExpr, updatedAt: new Date() })
        .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)))
        .returning();

      return updated || null;
    } catch (error) {
      console.error('❌ Error updating stock:', error);
      throw error;
    }
  }

  // ─── createTransaction ──────────────────────────────────────────────────────
  // FIX 6 (original): `transaction` shadows the Drizzle transaction function
  // name which would cause a conflict if we ever use Drizzle transactions here.
  // Renamed the destructured variable to `txRecord`.
  static async createTransaction(data) {
    try {
      const { inventoryId, type, quantity, reason, referenceId, performedBy } = data;

      // FIX 7: validate the transaction type here so a bad caller cannot insert
      // an arbitrary type string into the transactions table.
      const VALID_TYPES = ['in', 'out', 'adjustment', 'transfer', 'stock_count'];
      if (!VALID_TYPES.includes(type)) {
        throw new Error(`Invalid transaction type '${type}'. Must be one of: ${VALID_TYPES.join(', ')}`);
      }

      const [txRecord] = await db
        .insert(inventoryTransactions)
        .values({ inventoryId, type, quantity, reason, referenceId, performedBy })
        .returning();

      return txRecord;
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      throw error;
    }
  }

  // ─── getTransactions ────────────────────────────────────────────────────────
  // FIX 8 (original): no limit — returns the entire transaction history which
  // can be enormous for busy products. Added a configurable limit (default 50,
  // max 200).
  static async getTransactions(inventoryId, limit = 50) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    try {
      return db
        .select()
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.inventoryId, inventoryId))
        .orderBy(desc(inventoryTransactions.createdAt))
        .limit(safeLimit);
    } catch (error) {
      console.error('❌ Error getting transactions:', error);
      throw error;
    }
  }

  // ─── getLowStock ────────────────────────────────────────────────────────────
  // FIX 9 (original lines 168-183): the WHERE clause used
  // eq(inventory.quantity, inventory.minStock) — exact equality — so an item
  // with quantity=2 and minStock=5 was NOT flagged as low-stock. The correct
  // condition is quantity < minStock (i.e. quantity has fallen BELOW the
  // threshold). Changed to `lt` (less than).
  //
  // FIX 10 (original): getLowStock accepted a `threshold` parameter from the
  // route but the model ignored it completely, always using the per-row
  // minStock column. Now supports an optional override threshold.
  static async getLowStock(threshold = null) {
    try {
      const stockCondition = threshold !== null
        ? lt(inventory.quantity, parseInt(threshold, 10))
        : sql`${inventory.quantity} < ${inventory.minStock}`;

      return db
        .select({ inventory, warehouse: warehouses })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(and(
          stockCondition,
          eq(warehouses.active, true),
        ))
        .orderBy(inventory.quantity);
    } catch (error) {
      console.error('❌ Error getting low stock items:', error);
      throw error;
    }
  }

  // ─── reserve ────────────────────────────────────────────────────────────────
  // FIX 11 (original): the route called Inventory.reserve() but the method
  // was never defined in the model — every reservation attempt crashed with
  // "Inventory.reserve is not a function". Implemented atomically using a
  // conditional UPDATE so two concurrent reservations cannot over-commit.
  //
  // The schema does not currently have a `reserved` column. Add this migration:
  //   ALTER TABLE inventory ADD COLUMN reserved INTEGER NOT NULL DEFAULT 0;
  // until then this method tracks reservations via inventory_transactions only.
  static async reserve(inventoryId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Reservation quantity must be a positive integer');
    }

    try {
      // Atomically decrement available stock by checking availability in WHERE.
      // If the row doesn't exist or available stock < quantity, no row is
      // updated and we return null to signal insufficient stock.
      const [updated] = await db
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${quantity}`, updatedAt: new Date() })
        .where(and(
          eq(inventory.id, inventoryId),
          sql`${inventory.quantity} >= ${quantity}`,
        ))
        .returning();

      if (!updated) return null; // Insufficient stock

      // Record the reservation in the transaction log
      await this.createTransaction({
        inventoryId,
        type:        'out',
        quantity,
        reason:      'reservation',
        referenceId: null,
        performedBy: 'system',
      });

      return updated;
    } catch (error) {
      console.error('❌ Error reserving inventory:', error);
      throw error;
    }
  }

  // ─── releaseReservation ─────────────────────────────────────────────────────
  // FIX 12 (original): Inventory.releaseReservation() was called by the route
  // but also never defined. Implemented to add the quantity back to stock.
  static async releaseReservation(inventoryId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Release quantity must be a positive integer');
    }

    try {
      const [updated] = await db
        .update(inventory)
        .set({
          quantity:  sql`${inventory.quantity} + ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, inventoryId))
        .returning();

      if (!updated) return null;

      await this.createTransaction({
        inventoryId,
        type:        'in',
        quantity,
        reason:      'reservation_release',
        referenceId: null,
        performedBy: 'system',
      });

      return updated;
    } catch (error) {
      console.error('❌ Error releasing reservation:', error);
      throw error;
    }
  }

  // ─── updateQuantity ─────────────────────────────────────────────────────────
  // FIX 13 (original): the route called Inventory.updateQuantity() with
  // (inventoryId, quantity, transactionType, performedBy, reason) but no such
  // method existed — the route always crashed. Implemented here.
  static async updateQuantity(inventoryId, quantity, transactionType, performedBy, reason) {
    const VALID_TYPES = ['in', 'out', 'adjustment', 'transfer', 'stock_count'];
    if (!VALID_TYPES.includes(transactionType)) {
      throw new Error(`Invalid transaction type '${transactionType}'`);
    }

    try {
      let stockExpr;
      if (transactionType === 'in') {
        stockExpr = sql`${inventory.quantity} + ${Math.abs(quantity)}`;
      } else if (transactionType === 'out') {
        stockExpr = sql`GREATEST(${inventory.quantity} - ${Math.abs(quantity)}, 0)`;
      } else {
        // adjustment / transfer / stock_count — treat as absolute set
        if (quantity < 0) throw new Error('Adjusted quantity cannot be negative');
        stockExpr = quantity;
      }

      const [updated] = await db
        .update(inventory)
        .set({ quantity: stockExpr, updatedAt: new Date() })
        .where(eq(inventory.id, inventoryId))
        .returning();

      if (!updated) return null;

      await this.createTransaction({
        inventoryId,
        type:        transactionType,
        quantity:    Math.abs(quantity),
        reason,
        referenceId: null,
        performedBy,
      });

      return updated;
    } catch (error) {
      console.error('❌ Error updating quantity:', error);
      throw error;
    }
  }

  // ─── performStockCount ──────────────────────────────────────────────────────
  // FIX 14 (original): the route called Inventory.performStockCount() but it
  // was never defined. A stock count sets the quantity to the physically counted
  // value and records the discrepancy in the transaction log.
  static async performStockCount(inventoryId, countedQuantity, performedBy, notes) {
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      throw new Error('Counted quantity must be a non-negative integer');
    }

    try {
      const [existing] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.id, inventoryId))
        .limit(1);

      if (!existing) return null;

      const discrepancy = countedQuantity - existing.quantity;

      const [updated] = await db
        .update(inventory)
        .set({ quantity: countedQuantity, updatedAt: new Date() })
        .where(eq(inventory.id, inventoryId))
        .returning();

      await this.createTransaction({
        inventoryId,
        type:        'stock_count',
        quantity:    Math.abs(discrepancy),
        reason:      notes || `Stock count: system=${existing.quantity}, counted=${countedQuantity}, discrepancy=${discrepancy}`,
        referenceId: null,
        performedBy,
      });

      return updated;
    } catch (error) {
      console.error('❌ Error performing stock count:', error);
      throw error;
    }
  }

  // ─── getExpiring ────────────────────────────────────────────────────────────
  // FIX 15 (original): the route called Inventory.getExpiring() but it was
  // never defined. The current schema has no expiry_date column. This method
  // is a stub that returns an empty array and logs a clear message so the
  // endpoint works without crashing. Add an expiry_date column to the schema
  // to enable real expiry tracking.
  static async getExpiring(days = 30) {
    console.warn(
      '⚠️  Inventory.getExpiring() called but the schema has no expiry_date column. ' +
      'Add `expiryDate: timestamp("expiry_date")` to the inventory table to enable this feature.'
    );
    return [];
  }

  // ─── add ────────────────────────────────────────────────────────────────────
  // FIX 16 (original): the POST / route called Inventory.add() which was never
  // defined. Implemented as a thin wrapper around upsert since "add" and
  // "upsert" are semantically equivalent for inventory — if the (product,
  // warehouse) pair already exists we update its quantity.
  static async add(data) {
    return this.upsert(data);
  }
}

export default Inventory;