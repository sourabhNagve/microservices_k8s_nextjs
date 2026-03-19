import { db } from '../database-drizzle.js';
import { categories, products } from './schema.js';
import { eq, and, desc, ilike, lte } from 'drizzle-orm';

export class Product {
  // Create tables
  static async createTables() {
    try {
      console.log('✅ Product tables initialized');
    } catch (error) {
      console.error('❌ Error creating product tables:', error);
      throw error;
    }
  }

  // Get all products
  // Called as Product.findAll(page, limit, filters) from routes
  static async findAll(page = 1, limit = 10, filters = {}) {
    try {
      const { search, categoryId, active = true } = filters;
      const offset = (page - 1) * limit;

      let conditions = [eq(products.active, active)];

      if (search) {
        conditions.push(ilike(products.name, `%${search}%`));
      }

      if (categoryId) {
        conditions.push(eq(products.categoryId, categoryId));
      }

      const results = await db
        .select({
          product: products,
          category: categories,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(desc(products.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    } catch (error) {
      console.error('❌ Error finding products:', error);
      throw error;
    }
  }

  // Get product by ID
  static async findById(id) {
    try {
      const [result] = await db
        .select({
          product: products,
          category: categories,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(eq(products.id, id), eq(products.active, true)))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error('❌ Error finding product by ID:', error);
      throw error;
    }
  }

  // Get product by SKU
  static async findBySku(sku) {
    try {
      const [result] = await db
        .select({
          product: products,
          category: categories,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(eq(products.sku, sku), eq(products.active, true)))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error('❌ Error finding product by SKU:', error);
      throw error;
    }
  }

  // Create new product
  // createdBy is accepted for API consistency and future audit-trail support
  static async create(data, createdBy) {
    try {
      const { name, description, price, categoryId, sku, stock = 0, images = [] } = data;
      
      const [product] = await db
        .insert(products)
        .values({
          name,
          description,
          price: price.toString(),
          categoryId,
          sku,
          stock,
          images,
        })
        .returning();

      // Get product with category
      const result = await this.findById(product.id);
      return result;
    } catch (error) {
      console.error('❌ Error creating product:', error);
      throw error;
    }
  }

  // Update product
  // updatedBy is accepted for API consistency and future audit-trail support
  static async update(id, data, updatedBy) {
    try {
      const { name, description, price, categoryId, stock, images, active } = data;
      
      const [product] = await db
        .update(products)
        .set({
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(price && { price: price.toString() }),
          ...(categoryId && { categoryId }),
          ...(stock !== undefined && { stock }),
          ...(images && { images }),
          ...(active !== undefined && { active }),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      // Get updated product with category
      const result = await this.findById(product.id);
      return result;
    } catch (error) {
      console.error('❌ Error updating product:', error);
      throw error;
    }
  }

  // Delete product (soft delete)
  // deletedBy is accepted for API consistency and future audit-trail support
  static async delete(id, deletedBy) {
    try {
      await db
        .update(products)
        .set({ 
          active: false,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id));

      return true;
    } catch (error) {
      console.error('❌ Error deleting product:', error);
      throw error;
    }
  }

  // Update stock
  // Called as Product.updateStock(id, quantity, operation) from routes
  // operation: 'set' (default), 'increment', 'decrement'
  static async updateStock(id, quantity, operation = 'set') {
    try {
      const existing = await this.findById(id);
      if (!existing) return null;

      let newStock;
      const currentStock = existing.product?.stock ?? 0;
      if (operation === 'increment') {
        newStock = currentStock + quantity;
      } else if (operation === 'decrement') {
        newStock = Math.max(0, currentStock - quantity);
      } else {
        newStock = quantity; // 'set'
      }

      const [product] = await db
        .update(products)
        .set({ 
          stock: newStock,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      return product;
    } catch (error) {
      console.error('❌ Error updating stock:', error);
      throw error;
    }
  }

  // Get low stock products (stock <= threshold)
  static async getLowStockProducts(threshold = 10) {
    try {
      const results = await db
        .select({
          product: products,
          category: categories,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(
          eq(products.active, true),
          lte(products.stock, threshold)
        ))
        .orderBy(products.stock);

      return results;
    } catch (error) {
      console.error('❌ Error getting low stock products:', error);
      throw error;
    }
  }

  // Get categories
  static async getCategories() {
    try {
      const categoryList = await db
        .select()
        .from(categories)
        .orderBy(categories.name);

      return categoryList;
    } catch (error) {
      console.error('❌ Error getting categories:', error);
      throw error;
    }
  }

  // Create category
  static async createCategory(data) {
    try {
      const { name, description } = data;
      
      const [category] = await db
        .insert(categories)
        .values({ name, description })
        .returning();

      return category;
    } catch (error) {
      console.error('❌ Error creating category:', error);
      throw error;
    }
  }

  // Search products
  // Called as Product.search(term, page, limit) from routes
  static async search(searchQuery, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    try {
      const results = await db
        .select({
          product: products,
          category: categories,
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(
          eq(products.active, true),
          ilike(products.name, `%${searchQuery}%`)
        ))
        .orderBy(desc(products.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    } catch (error) {
      console.error('❌ Error searching products:', error);
      throw error;
    }
  }
}

export default Product;
