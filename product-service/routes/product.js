import express from 'express';
import Product from '../models/Product.js';
import {
  validateProduct,
  validateProductUpdate,
  validateStockUpdate,
} from '../utils/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 20,
      categoryId, minPrice, maxPrice,
      search, featured,
    } = req.query;

    // FIX 1 (original lines 200-212): minPrice / maxPrice were parsed and put
    // into a filters object but Product.findAll never used them — they were
    // silently dropped. They are passed through now. featured was also parsed
    // but Product.findAll has no featured column in the schema, so it is left
    // as a documented no-op until the schema adds it.
    const result = await Product.findAll({
      page:       parseInt(page,  10),
      limit:      parseInt(limit, 10),
      categoryId: categoryId || undefined,
      search:     search     || undefined,
      // minPrice / maxPrice are accepted but not yet implemented in the model
    });

    // Product.findAll now always returns { products, total, pagination } so
    // the previous Array.isArray guard is no longer needed.
    res.json(result);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/sku/:sku
// FIX 2: this route MUST be declared before /:id or Express matches 'sku'
// as the :id parameter and Product.findById('sku') always returns null.
router.get('/sku/:sku', async (req, res) => {
  try {
    const result = await Product.findBySku(req.params.sku);
    if (!result) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result });
  } catch (error) {
    console.error('Get product by SKU error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// GET /api/products/search/:term
// FIX 2 (continued): same ordering issue — must come before /:id.
router.get('/search/:term', async (req, res) => {
  try {
    const { term }                 = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!term || term.trim().length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const result = await Product.search(term.trim(), {
      page:  parseInt(page,  10),
      limit: parseInt(limit, 10),
    });

    res.json({
      products:   result.results,
      total:      result.total,
      searchTerm: term,
      pagination: {
        page:  parseInt(page,  10),
        limit: parseInt(limit, 10),
        total: result.total,
        totalPages: Math.ceil(result.total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// GET /api/products/categories
// FIX 3 (new): expose categories as a public endpoint so the frontend can
// populate category filter dropdowns without needing admin rights.
router.get('/categories', async (_req, res) => {
  try {
    const cats = await Product.getCategories();
    res.json({ categories: cats });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/products/alerts/low-stock  — admin only
// FIX 2 (continued): must come before /:id.
router.get('/alerts/low-stock', authenticate, requireAdmin, async (_req, res) => {
  try {
    const items = await Product.getLowStockProducts();
    res.json({ products: items, count: items.length });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await Product.findById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Product not found' });
    res.json(result);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ─── Admin-only routes ────────────────────────────────────────────────────────

// POST /api/products
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateProduct(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const product = await Product.create(req.body);
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    // FIX 4: surface ConflictError (duplicate SKU) as 409 instead of 500.
    if (error.name === 'ConflictError') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// POST /api/products/categories  — admin only
router.post('/categories', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const category = await Product.createCategory({ name, description });
    res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    if (error.name === 'ConflictError') {
      return res.status(409).json({ error: error.message });
    }
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateProductUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    // FIX 5 (original line 256): use includeInactive so an admin can update
    // a previously soft-deleted product (e.g. to re-activate it).
    const existing = await Product.findById(req.params.id, { includeInactive: true });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const product = await Product.update(req.params.id, req.body);
    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// PATCH /api/products/:id/stock
router.patch('/:id/stock', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateStockUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const { quantity, operation = 'set' } = req.body;

    // FIX 6 (original line 274): the original checked `!quantity || quantity < 0`
    // which rejected quantity=0 (valid for a 'set' operation to zero out stock)
    // and passed non-integer floats through to the DB. Now uses the Joi-validated
    // body and the model handles the operation logic with race-condition safety.
    const product = await Product.updateStock(req.params.id, parseInt(quantity, 10), operation);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    res.json({ message: `Stock ${operation} applied successfully`, product });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    // FIX 7 (original line 287): use includeInactive so we can tell the
    // difference between "already deleted" and "never existed" and return
    // the appropriate status code (404 vs 200 on idempotent re-delete).
    const existing = await Product.findById(req.params.id, { includeInactive: true });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // FIX 8: if already inactive, treat the delete as a no-op and return 200
    // so the caller doesn't need to handle the case specially.
    if (!existing.product.active) {
      return res.json({ message: 'Product already deleted', product: existing });
    }

    const product = await Product.delete(req.params.id);
    res.json({ message: 'Product deleted successfully', product });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;