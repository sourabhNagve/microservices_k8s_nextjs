import { db } from '../database-drizzle.js';
import { warehouses, inventory, inventoryTransactions } from './schema.js';
import { eq, and, desc } from 'drizzle-orm';

export class Inventory {
  // Create tables
  static async createTables() {
    try {
      console.log('✅ Inventory tables initialized');
    } catch (error) {
      console.error('❌ Error creating inventory tables:', error);
      throw error;
    }
  }

  // Get inventory by product
  static async findByProduct(productId, warehouseId = null) {
    try {
      let query = db
        .select({
          inventory: inventory,
          warehouse: warehouses,
        })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(eq(inventory.productId, productId));

      // Filter by warehouse if specified
      if (warehouseId) {
        query = query.where(eq(inventory.warehouseId, warehouseId));
      }

      const results = await query.orderBy(desc(inventory.quantity));
      
      return results;
    } catch (error) {
      console.error('❌ Error finding inventory by product:', error);
      throw error;
    }
  }

  // Keep the old method for backward compatibility
  static async findByProductId(productId) {
    return this.findByProduct(productId);
  }

  // Get inventory by warehouse
  static async findByWarehouse(warehouseId) {
    try {
      const results = await db
        .select({
          inventory: inventory,
          warehouse: warehouses,
        })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(eq(inventory.warehouseId, warehouseId))
        .orderBy(inventory.productId);
      
      return results;
    } catch (error) {
      console.error('❌ Error finding inventory by warehouse:', error);
      throw error;
    }
  }

  // Get all inventory
  static async findAll() {
    try {
      const results = await db
        .select({
          inventory: inventory,
          warehouse: warehouses,
        })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .orderBy(inventory.productId);
      
      return results;
    } catch (error) {
      console.error('❌ Error finding all inventory:', error);
      throw error;
    }
  }

  // Create or update inventory item
  static async upsert(data) {
    try {
      const { productId, warehouseId, quantity, minStock, maxStock, location } = data;
      
      // Check if inventory item exists
      const existing = await db
        .select()
        .from(inventory)
        .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        const [updated] = await db
          .update(inventory)
          .set({
            quantity,
            minStock: minStock || 5,
            maxStock: maxStock || 100,
            location: location || null,
            updatedAt: new Date(),
          })
          .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)))
          .returning();
        
        return updated;
      } else {
        // Create new
        const [created] = await db
          .insert(inventory)
          .values({
            productId,
            warehouseId,
            quantity,
            minStock: minStock || 5,
            maxStock: maxStock || 100,
            location: location || null,
          })
          .returning();
        
        return created;
      }
    } catch (error) {
      console.error('❌ Error upserting inventory:', error);
      throw error;
    }
  }

  // Update stock quantity
  static async updateStock(productId, warehouseId, quantity) {
    try {
      const [updated] = await db
        .update(inventory)
        .set({ 
          quantity,
          updatedAt: new Date(),
        })
        .where(and(eq(inventory.productId, productId), eq(inventory.warehouseId, warehouseId)))
        .returning();
      
      return updated;
    } catch (error) {
      console.error('❌ Error updating stock:', error);
      throw error;
    }
  }

  // Create inventory transaction
  static async createTransaction(data) {
    try {
      const { inventoryId, type, quantity, reason, referenceId, performedBy } = data;
      
      const [transaction] = await db
        .insert(inventoryTransactions)
        .values({
          inventoryId,
          type, // 'in', 'out', 'adjustment'
          quantity,
          reason,
          referenceId,
          performedBy,
        })
        .returning();
      
      return transaction;
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      throw error;
    }
  }

  // Get transactions for inventory item
  static async getTransactions(inventoryId) {
    try {
      const transactions = await db
        .select()
        .from(inventoryTransactions)
        .where(eq(inventoryTransactions.inventoryId, inventoryId))
        .orderBy(desc(inventoryTransactions.createdAt));
      
      return transactions;
    } catch (error) {
      console.error('❌ Error getting transactions:', error);
      throw error;
    }
  }

  // Get low stock items
  static async getLowStock() {
    try {
      const results = await db
        .select({
          inventory: inventory,
          warehouse: warehouses,
        })
        .from(inventory)
        .leftJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
        .where(and(
          eq(inventory.quantity, inventory.minStock),
          eq(warehouses.active, true)
        ))
        .orderBy(inventory.quantity);
      
      return results;
    } catch (error) {
      console.error('❌ Error getting low stock items:', error);
      throw error;
    }
  }
}

export default Inventory;
