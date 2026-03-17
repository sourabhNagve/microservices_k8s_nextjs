import express from 'express';
import Inventory from '../models/Inventory.js';
import { validateInventoryItem, validateStockUpdate } from '../utils/validation.js';

const router = express.Router();

// Get inventory by product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { warehouseId } = req.query;
    
    const inventoryResults = await Inventory.findByProduct(productId, warehouseId);
    
    // Format the inventory data to match expected structure
    const inventory = inventoryResults.map(result => ({
      id: result.inventory.id,
      productId: result.inventory.productId,
      warehouseId: result.inventory.warehouseId || result.warehouse?.id || 'Main Warehouse',
      quantity: result.inventory.quantity || 0,
      reserved: result.inventory.reserved || 0,
      minStock: result.inventory.minStock || 0,
      maxStock: result.inventory.maxStock || 0,
      location: result.inventory.location || null,
      warehouse: result.warehouse || null,
      createdAt: result.inventory.createdAt,
      updatedAt: result.inventory.updatedAt
    }));
    
    res.json({
      inventory,
      count: inventory.length
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch inventory', 
      message: 'Internal server error' 
    });
  }
});

// Get low stock items
router.get('/alerts/low-stock', async (req, res) => {
  try {
    const { threshold } = req.query;
    
    const lowStockItems = await Inventory.getLowStock(threshold);
    
    res.json({
      lowStockItems,
      count: lowStockItems.length
    });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch low stock items', 
      message: 'Internal server error' 
    });
  }
});

// Get expiring items
router.get('/alerts/expiring', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const expiringItems = await Inventory.getExpiring(parseInt(days));
    
    res.json({
      expiringItems,
      count: expiringItems.length,
      days: parseInt(days)
    });
  } catch (error) {
    console.error('Get expiring items error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch expiring items', 
      message: 'Internal server error' 
    });
  }
});

// Add inventory item
router.post('/', async (req, res) => {
  try {
    const { error } = validateInventoryItem(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const inventoryItem = await Inventory.add(req.body);
    
    res.status(201).json({
      message: 'Inventory item added successfully',
      inventoryItem
    });
  } catch (error) {
    console.error('Add inventory error:', error);
    res.status(500).json({ 
      error: 'Failed to add inventory item', 
      message: 'Internal server error' 
    });
  }
});

// Update inventory quantity
router.put('/:inventoryId/quantity', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { error } = validateStockUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { quantity, transactionType, reason } = req.body;
    const performedBy = req.user?.id || 'system'; // Replace with actual auth

    const inventoryItem = await Inventory.updateQuantity(
      inventoryId, 
      parseInt(quantity), 
      transactionType, 
      performedBy, 
      reason
    );
    
    res.json({
      message: 'Inventory quantity updated successfully',
      inventoryItem
    });
  } catch (error) {
    console.error('Update inventory quantity error:', error);
    res.status(500).json({ 
      error: 'Failed to update inventory quantity', 
      message: 'Internal server error' 
    });
  }
});

// Reserve inventory
router.post('/:inventoryId/reserve', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ 
        error: 'Invalid reservation quantity' 
      });
    }

    const inventoryItem = await Inventory.reserve(inventoryId, parseInt(quantity));
    
    if (!inventoryItem) {
      return res.status(400).json({ 
        error: 'Insufficient stock available' 
      });
    }

    res.json({
      message: 'Inventory reserved successfully',
      inventoryItem
    });
  } catch (error) {
    console.error('Reserve inventory error:', error);
    res.status(500).json({ 
      error: 'Failed to reserve inventory', 
      message: 'Internal server error' 
    });
  }
});

// Release inventory reservation
router.post('/:inventoryId/release', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ 
        error: 'Invalid release quantity' 
      });
    }

    const inventoryItem = await Inventory.releaseReservation(inventoryId, parseInt(quantity));
    
    res.json({
      message: 'Inventory reservation released successfully',
      inventoryItem
    });
  } catch (error) {
    console.error('Release reservation error:', error);
    res.status(500).json({ 
      error: 'Failed to release reservation', 
      message: 'Internal server error' 
    });
  }
});

// Get inventory transactions
router.get('/:inventoryId/transactions', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { limit = 50 } = req.query;
    
    const transactions = await Inventory.getTransactions(inventoryId, parseInt(limit));
    
    res.json({
      transactions,
      count: transactions.length
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transactions', 
      message: 'Internal server error' 
    });
  }
});

// Perform stock count
router.post('/:inventoryId/stock-count', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { countedQuantity, notes } = req.body;
    const performedBy = req.user?.id || 'system'; // Replace with actual auth

    if (!countedQuantity || countedQuantity < 0) {
      return res.status(400).json({ 
        error: 'Invalid counted quantity' 
      });
    }

    const inventoryItem = await Inventory.performStockCount(
      inventoryId, 
      parseInt(countedQuantity), 
      performedBy, 
      notes
    );
    
    res.json({
      message: 'Stock count performed successfully',
      inventoryItem
    });
  } catch (error) {
    console.error('Stock count error:', error);
    res.status(500).json({ 
      error: 'Failed to perform stock count', 
      message: 'Internal server error' 
    });
  }
});

export default router;
