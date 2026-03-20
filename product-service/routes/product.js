import express from 'express';
import Product from '../models/Product.js';
import { validateProduct, validateProductUpdate, validateStockUpdate, validateSearch } from '../utils/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ─── Public routes — no auth needed ──────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, categoryId, minPrice, maxPrice, search, featured } = req.query;
    const filters = {};
    if (categoryId) filters.categoryId = categoryId;
    if (minPrice) {
      const parsed = parseFloat(minPrice);
      if (!isNaN(parsed)) filters.minPrice = parsed;
    }
    if (maxPrice) {
      const parsed = parseFloat(maxPrice);
      if (!isNaN(parsed)) filters.maxPrice = parsed;
    }
    if (search)     filters.search     = search;
    if (featured)   filters.featured   = featured === 'true';

    const result   = await Product.findAll(parseInt(page), parseInt(limit), filters);
    const products = Array.isArray(result) ? result : (result.products ?? []);
    const total    = Array.isArray(result) ? products.length : (result.total ?? products.length);

    res.json({
      products,
      total,
      pagination: {
        page:       parseInt(page),
        limit:      parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/sku/:sku', async (req, res) => {
  try {
    const product = await Product.findBySku(req.params.sku);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  } catch (error) {
    console.error('Get product by SKU error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.get('/search/:term', async (req, res) => {
  try {
    const { term }           = req.params;
    const { page = 1, limit = 20 } = req.query;
    if (!term || term.trim().length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }
    const products = await Product.search(term.trim(), parseInt(page), parseInt(limit));
    res.json({ products, searchTerm: term, pagination: { page: parseInt(page), limit: parseInt(limit) } });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// ✅ Admin only — low stock alerts
router.get('/alerts/low-stock', authenticate, requireAdmin, async (req, res) => {
  try {
    const products = await Product.getLowStockProducts();
    res.json({ products, count: products.length });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
});

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

// ─── Admin only routes ────────────────────────────────────────────────────────

// ✅ authenticate + requireAdmin on all write operations
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateProduct(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }
    // ✅ now uses real user id from token instead of 'temp-user-id'
    const product = await Product.create(req.body, req.user.userId);
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateProductUpdate(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation failed', details: error.details[0].message });
    }
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // ✅ real user id from token
    const product = await Product.update(req.params.id, req.body, req.user.userId);
    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.patch('/:id/stock', authenticate, requireAdmin, async (req, res) => {
  try {
    const { quantity, operation = 'set' } = req.body;
    if (!quantity || quantity < 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    const product = await Product.updateStock(req.params.id, parseInt(quantity), operation);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: `Stock ${operation}d successfully`, product });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // ✅ real user id from token
    const product = await Product.delete(req.params.id, req.user.userId);
    res.json({ message: 'Product deleted successfully', product });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;