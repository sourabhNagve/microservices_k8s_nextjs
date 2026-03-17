import express from 'express';
import Product from '../models/Product.js';
import { validateProduct, validateProductUpdate, validateStockUpdate, validateSearch } from '../utils/validation.js';

const router = express.Router();

// Get all products with pagination and filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      categoryId,
      minPrice,
      maxPrice,
      search,
      featured
    } = req.query;

    const filters = {};
    
    if (categoryId) filters.categoryId = categoryId;
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice);
    if (search) filters.search = search;
    if (featured) filters.featured = featured === 'true';

    const products = await Product.findAll(
      parseInt(page), 
      parseInt(limit), 
      filters
    );

    return res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(products.length / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch products', 
      message: 'Internal server error' 
    });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await Product.findById(id);
    
    if (!result) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch product', 
      message: 'Internal server error' 
    });
  }
});

// Get product by SKU
router.get('/sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    
    const product = await Product.findBySku(sku);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product by SKU error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch product', 
      message: 'Internal server error' 
    });
  }
});

// Create new product
router.post('/', async (req, res) => {
  try {
    const { error } = validateProduct(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    // This would need authentication middleware to get user ID
    const createdBy = req.user?.id || 'temp-user-id'; // Replace with actual auth

    const product = await Product.create(req.body, createdBy);
    
    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ 
      error: 'Failed to create product', 
      message: 'Internal server error' 
    });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = validateProductUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    const updatedBy = req.user?.id || 'temp-user-id'; // Replace with actual auth
    const product = await Product.update(id, req.body, updatedBy);
    
    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ 
      error: 'Failed to update product', 
      message: 'Internal server error' 
    });
  }
});

// Update product stock
router.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, operation = 'set' } = req.body;

    if (!quantity || quantity < 0) {
      return res.status(400).json({ 
        error: 'Invalid quantity' 
      });
    }

    const product = await Product.updateStock(id, parseInt(quantity), operation);
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    res.json({
      message: `Stock ${operation}d successfully`,
      product
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ 
      error: 'Failed to update stock', 
      message: 'Internal server error' 
    });
  }
});

// Delete product (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    const deletedBy = req.user?.id || 'temp-user-id'; // Replace with actual auth
    const deletedProduct = await Product.delete(id, deletedBy);
    
    res.json({
      message: 'Product deleted successfully',
      product: deletedProduct
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ 
      error: 'Failed to delete product', 
      message: 'Internal server error' 
    });
  }
});

// Search products
router.get('/search/:term', async (req, res) => {
  try {
    const { term } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!term || term.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Search term must be at least 2 characters long' 
      });
    }

    const products = await Product.search(term.trim(), parseInt(page), parseInt(limit));
    
    res.json({
      products,
      searchTerm: term,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Search products error:', error);
    res.status(500).json({ 
      error: 'Failed to search products', 
      message: 'Internal server error' 
    });
  }
});

// Get low stock products
router.get('/alerts/low-stock', async (req, res) => {
  try {
    const products = await Product.getLowStockProducts();
    
    res.json({
      products,
      count: products.length
    });
  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch low stock alerts', 
      message: 'Internal server error' 
    });
  }
});

export default router;
