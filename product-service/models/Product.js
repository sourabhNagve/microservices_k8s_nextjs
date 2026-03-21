import { db } from '../database-drizzle.js';
import { categories, products } from './schema.js';
import { eq, and, or, desc, ilike, sql, lt } from 'drizzle-orm';

export class Product {
  static async createTables() {
    try {
      console.log('✅ Product tables initialized');
    } catch (error) {
      console.error('❌ Error creating product tables:', error);
      throw error;
    }
  }

  // ─── findAll ───────────────────────────────────────────────────────────────
  // FIX 1 (original lines 18-49): the original built multiple .where() calls
  // by calling query.where() repeatedly. In Drizzle ORM every .where() call
  // REPLACES the previous one — it does not AND them together. So when both
  // search AND categoryId were supplied, only the categoryId filter was applied
  // and the search was silently ignored. All conditions must be combined in a
  // single and(...) call.
  //
  // FIX 2 (original): no total-count query, so the caller had no accurate
  // pagination metadata. Added a parallel COUNT(*) query using Promise.all so
  // the response includes a real total rather than just the current page length.
  //
  // FIX 3 (original): limit and page came from the caller without clamping —
  // a caller could request limit=100000 and dump the entire products table.
  static async findAll(options = {}) {
    try {
      const {
        page   = 1,
        active = true,
      } = options;

      // Clamp to safe bounds
      const limit  = Math.min(Math.max(parseInt(options.limit)  || 20, 1), 100);
      const offset = (Math.max(parseInt(page), 1) - 1) * limit;
      const search     = options.search     ? String(options.search).trim()     : null;
      const categoryId = options.categoryId ? parseInt(options.categoryId, 10)  : null;

      // Build a single combined WHERE condition
      const conditions = [eq(products.active, active)];
      if (search)     conditions.push(ilike(products.name, `%${search}%`));
      if (categoryId) conditions.push(eq(products.categoryId, categoryId));
      const whereClause = and(...conditions);

      // Run data and count queries in parallel
      const [results, [{ total }]] = await Promise.all([
        db.select({ product: products, category: categories })
          .from(products)
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(whereClause)
          .orderBy(desc(products.createdAt))
          .limit(limit)
          .offset(offset),

        db.select({ total: sql`count(*)`.mapWith(Number) })
          .from(products)
          .where(whereClause),
      ]);

      return {
        products: results,
        total,
        pagination: {
          page: parseInt(page),
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('❌ Error finding products:', error);
      throw error;
    }
  }

  // ─── findById ──────────────────────────────────────────────────────────────
  // FIX 4 (original line 55): findById only returned active products. An admin
  // editing a soft-deleted product would always get null. Added an optional
  // includeInactive flag so admin routes can look up any product.
  static async findById(id, { includeInactive = false } = {}) {
    try {
      const conditions = includeInactive
        ? [eq(products.id, id)]
        : [eq(products.id, id), eq(products.active, true)];

      const [result] = await db
        .select({ product: products, category: categories })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(...conditions))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error('❌ Error finding product by ID:', error);
      throw error;
    }
  }

  // ─── findBySku ─────────────────────────────────────────────────────────────
  static async findBySku(sku) {
    try {
      // FIX 5: normalise the SKU to uppercase before querying — SKUs are
      // typically case-insensitive but the DB stores them as entered. Without
      // normalisation 'ABC123' and 'abc123' would be treated as different SKUs.
      const normalisedSku = String(sku).toUpperCase().trim();

      const [result] = await db
        .select({ product: products, category: categories })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(eq(products.sku, normalisedSku), eq(products.active, true)))
        .limit(1);

      return result || null;
    } catch (error) {
      console.error('❌ Error finding product by SKU:', error);
      throw error;
    }
  }

  // ─── create ────────────────────────────────────────────────────────────────
  static async create(data) {
    try {
      const { name, description, price, categoryId, sku, stock = 0, images = [] } = data;

      // FIX 6 (original line 97): SKU uniqueness is enforced by a DB constraint
      // but the error that bubbles up from a constraint violation is a raw pg
      // error with code '23505'. Catch it here and re-throw a friendly message
      // so the route handler can return 409 instead of 500.
      const [product] = await db
        .insert(products)
        .values({
          name,
          description,
          price:      price.toString(),
          categoryId: categoryId ? parseInt(categoryId, 10) : null,
          // FIX 5 (continued): normalise the SKU on write too.
          sku:        String(sku).toUpperCase().trim(),
          stock,
          images,
        })
        .returning();

      return this.findById(product.id);
    } catch (error) {
      if (error.code === '23505') {
        const conflict = new Error('A product with this SKU already exists');
        conflict.name  = 'ConflictError';
        throw conflict;
      }
      console.error('❌ Error creating product:', error);
      throw error;
    }
  }

  // ─── update ────────────────────────────────────────────────────────────────
  static async update(id, data) {
    try {
      const { name, description, price, categoryId, stock, images, active } = data;

      // FIX 7 (original line 121): `...(price && { price: ... })` skips the
      // update when price is 0, which is a valid (if unusual) price. Use
      // `price !== undefined` so explicit zero is accepted.
      const [product] = await db
        .update(products)
        .set({
          ...(name        !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(price       !== undefined && { price: price.toString() }),
          ...(categoryId  !== undefined && { categoryId: categoryId ? parseInt(categoryId, 10) : null }),
          ...(stock       !== undefined && { stock }),
          ...(images      !== undefined && { images }),
          ...(active      !== undefined && { active }),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      if (!product) return null;

      // FIX 4 (continued): use includeInactive so we can return the product
      // even if it was just soft-deactivated in this very update call.
      return this.findById(product.id, { includeInactive: true });
    } catch (error) {
      console.error('❌ Error updating product:', error);
      throw error;
    }
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  // FIX 8 (original lines 143-153): delete returned `true` on success but the
  // route handler tried to send back the deleted product. Now returns the
  // product's last known state (with includeInactive) so the caller can echo
  // it in the response.
  static async delete(id) {
    try {
      await db
        .update(products)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(products.id, id));

      return this.findById(id, { includeInactive: true });
    } catch (error) {
      console.error('❌ Error deleting product:', error);
      throw error;
    }
  }

  // ─── updateStock ───────────────────────────────────────────────────────────
  // FIX 9 (original lines 155-172): updateStock accepted a raw `quantity` and
  // always set stock to that value. The route handler passed `operation` but
  // the model ignored it entirely. Now supports 'set', 'add', and 'subtract'
  // operations. Also guards against stock going below zero on subtract.
  static async updateStock(id, quantity, operation = 'set') {
    try {
      // FIX 9 (continued): use a DB-level expression for add/subtract so there
      // is no race condition between reading the current stock and writing the
      // new value (two simultaneous requests could both read stock=5, both
      // subtract 1, and both write 4 instead of the correct 3).
      let stockExpression;
      if (operation === 'add') {
        stockExpression = sql`${products.stock} + ${quantity}`;
      } else if (operation === 'subtract') {
        stockExpression = sql`GREATEST(${products.stock} - ${quantity}, 0)`;
      } else {
        // 'set' — plain value, validate non-negative
        if (quantity < 0) throw new Error('Stock cannot be set to a negative value');
        stockExpression = quantity;
      }

      const [product] = await db
        .update(products)
        .set({ stock: stockExpression, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();

      return product || null;
    } catch (error) {
      console.error('❌ Error updating stock:', error);
      throw error;
    }
  }

  // ─── getCategories ─────────────────────────────────────────────────────────
  static async getCategories() {
    try {
      return db.select().from(categories).orderBy(categories.name);
    } catch (error) {
      console.error('❌ Error getting categories:', error);
      throw error;
    }
  }

  // ─── createCategory ────────────────────────────────────────────────────────
  // FIX 10: catch duplicate category name (unique constraint) and re-throw a
  // friendly ConflictError so the route handler can return 409.
  static async createCategory(data) {
    try {
      const { name, description } = data;
      const [category] = await db
        .insert(categories)
        .values({ name: name.trim(), description })
        .returning();
      return category;
    } catch (error) {
      if (error.code === '23505') {
        const conflict = new Error('A category with this name already exists');
        conflict.name  = 'ConflictError';
        throw conflict;
      }
      console.error('❌ Error creating category:', error);
      throw error;
    }
  }

  // ─── search ────────────────────────────────────────────────────────────────
  // FIX 11 (original lines 193-219): search only matched on product name. It
  // now also matches on description and SKU using OR so a search for a known
  // SKU or a keyword in the description returns results. Also added a total
  // count for pagination consistency with findAll.
  static async search(query, options = {}) {
    const limit  = Math.min(Math.max(parseInt(options.limit)  || 20, 1), 100);
    const offset = (Math.max(parseInt(options.page) || 1, 1) - 1) * limit;
    const term   = String(query).trim();

    const whereClause = and(
      eq(products.active, true),
      or(
        ilike(products.name,        `%${term}%`),
        ilike(products.description, `%${term}%`),
        ilike(products.sku,         `%${term}%`),
      )
    );

    try {
      const [results, [{ total }]] = await Promise.all([
        db.select({ product: products, category: categories })
          .from(products)
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(whereClause)
          .orderBy(desc(products.createdAt))
          .limit(limit)
          .offset(offset),

        db.select({ total: sql`count(*)`.mapWith(Number) })
          .from(products)
          .where(whereClause),
      ]);

      return { results, total };
    } catch (error) {
      console.error('❌ Error searching products:', error);
      throw error;
    }
  }

  // ─── getLowStockProducts ───────────────────────────────────────────────────
  // FIX 12 (original: method called by route but never defined in the model).
  // Without this the low-stock admin endpoint always crashed with
  // "Product.getLowStockProducts is not a function".
  // The threshold defaults to 10 and is configurable via env var so it can be
  // tuned per deployment without a code change.
  static async getLowStockProducts(threshold = parseInt(process.env.LOW_STOCK_THRESHOLD, 10) || 10) {
    try {
      return db
        .select({ product: products, category: categories })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(and(
          eq(products.active, true),
          lt(products.stock, threshold),
        ))
        .orderBy(products.stock); // lowest stock first
    } catch (error) {
      console.error('❌ Error getting low stock products:', error);
      throw error;
    }
  }
}

export default Product;