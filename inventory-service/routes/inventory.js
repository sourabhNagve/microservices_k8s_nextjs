import express from 'express';
import Inventory from '../models/Inventory.js';
import { validateInventoryItem, validateStockUpdate } from '../utils/validation.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// ─── GET /api/inventory/product/:productId ────────────────────────────────────
// FIX 1 (original): no authentication — any caller could read stock levels for
// any product. Added authenticate; public product availability checks should go
// through the product-service API, not directly to inventory.
router.get('/product/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { warehouseId } = req.query;

    // FIX 2: validate that productId is a UUID before querying the DB.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(productId)) {
      return res.status(400).json({ error: 'productId must be a valid UUID' });
    }

    const results = await Inventory.findByProduct(productId, warehouseId || null);

    const inventoryList = results.map(r => ({
      id:          r.inventory.id,
      productId:   r.inventory.productId,
      warehouseId: r.inventory.warehouseId,
      quantity:    r.inventory.quantity,
      minStock:    r.inventory.minStock,
      maxStock:    r.inventory.maxStock,
      location:    r.inventory.location,
      warehouse:   r.warehouse,
      createdAt:   r.inventory.createdAt,
      updatedAt:   r.inventory.updatedAt,
    }));

    res.json({ inventory: inventoryList, count: inventoryList.length });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// ─── GET /api/inventory/alerts/low-stock — admin only ────────────────────────
// FIX 3: route ordering — must come before /:inventoryId so 'alerts' is not
// interpreted as an inventoryId parameter.
// FIX 4 (original): no authentication — stock level data is sensitive.
router.get('/alerts/low-stock', authenticate, requireAdmin, async (req, res) => {
  try {
    const threshold = req.query.threshold ? parseInt(req.query.threshold, 10) : null;
    if (req.query.threshold && (isNaN(threshold) || threshold < 0)) {
      return res.status(400).json({ error: 'threshold must be a non-negative integer' });
    }

    const lowStockItems = await Inventory.getLowStock(threshold);
    res.json({ lowStockItems, count: lowStockItems.length });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// ─── GET /api/inventory/alerts/expiring — admin only ─────────────────────────
// FIX 3 (continued): must come before /:inventoryId.
router.get('/alerts/expiring', authenticate, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    if (days < 1 || days > 365) {
      return res.status(400).json({ error: 'days must be between 1 and 365' });
    }

    const expiringItems = await Inventory.getExpiring(days);
    res.json({ expiringItems, count: expiringItems.length, days });
  } catch (error) {
    console.error('Get expiring items error:', error);
    res.status(500).json({ error: 'Failed to fetch expiring items' });
  }
});

// ─── POST /api/inventory — admin only ────────────────────────────────────────
// FIX 5 (original): no authentication — anyone could create/modify inventory.
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { error } = validateInventoryItem(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const inventoryItem = await Inventory.add(req.body);
    res.status(201).json({ message: 'Inventory item added successfully', inventoryItem });
  } catch (error) {
    console.error('Add inventory error:', error);
    res.status(500).json({ error: 'Failed to add inventory item' });
  }
});

// ─── PUT /api/inventory/:inventoryId/quantity — admin only ───────────────────
// FIX 6 (original): no authentication on a write endpoint that changes stock.
router.put('/:inventoryId/quantity', authenticate, requireAdmin, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { error } = validateStockUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error:   'Validation failed',
        details: error.details[0].message,
      });
    }

    const { quantity, transactionType, reason } = req.body;

    // FIX 7 (original line 103): `req.user?.id || 'system'` silently used
    // 'system' when auth was missing. Since authenticate is now required,
    // req.user is always present. Use userId from the JWT.
    const performedBy = req.user.userId;

    const inventoryItem = await Inventory.updateQuantity(
      inventoryId,
      parseInt(quantity, 10),
      transactionType,
      performedBy,
      reason,
    );

    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ message: 'Inventory quantity updated successfully', inventoryItem });
  } catch (error) {
    if (error.message?.includes('Invalid transaction type')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Update inventory quantity error:', error);
    res.status(500).json({ error: 'Failed to update inventory quantity' });
  }
});

// ─── POST /api/inventory/:inventoryId/reserve — authenticated ────────────────
// FIX 8 (original): no authentication.
router.post('/:inventoryId/reserve', authenticate, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const quantity = parseInt(req.body.quantity, 10);

    // FIX 9 (original line 125): `!quantity || quantity <= 0` rejects quantity=0
    // which is correct, but also rejects NaN without a clear error. Explicit
    // check now.
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const inventoryItem = await Inventory.reserve(inventoryId, quantity);

    if (!inventoryItem) {
      return res.status(409).json({ error: 'Insufficient stock available' });
    }

    res.json({ message: 'Inventory reserved successfully', inventoryItem });
  } catch (error) {
    console.error('Reserve inventory error:', error);
    res.status(500).json({ error: 'Failed to reserve inventory' });
  }
});

// ─── POST /api/inventory/:inventoryId/release — authenticated ────────────────
router.post('/:inventoryId/release', authenticate, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const quantity = parseInt(req.body.quantity, 10);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'quantity must be a positive integer' });
    }

    const inventoryItem = await Inventory.releaseReservation(inventoryId, quantity);

    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ message: 'Inventory reservation released successfully', inventoryItem });
  } catch (error) {
    console.error('Release reservation error:', error);
    res.status(500).json({ error: 'Failed to release reservation' });
  }
});

// ─── GET /api/inventory/:inventoryId/transactions — authenticated ─────────────
// FIX 10 (original): no authentication — transaction history is sensitive
// operational data.
router.get('/:inventoryId/transactions', authenticate, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    // FIX 11: clamp the limit so a caller cannot dump the full history.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const transactions = await Inventory.getTransactions(inventoryId, limit);
    res.json({ transactions, count: transactions.length });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ─── POST /api/inventory/:inventoryId/stock-count — admin only ───────────────
router.post('/:inventoryId/stock-count', authenticate, requireAdmin, async (req, res) => {
  try {
    const { inventoryId } = req.params;
    const { notes }       = req.body;
    const countedQuantity = parseInt(req.body.countedQuantity, 10);

    // FIX 12 (original line 201): `!countedQuantity || countedQuantity < 0`
    // rejects a count of 0 (valid — a shelf can be empty). Changed to
    // explicit integer check allowing 0.
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
      return res.status(400).json({ error: 'countedQuantity must be a non-negative integer' });
    }

    const performedBy = req.user.userId;

    const inventoryItem = await Inventory.performStockCount(
      inventoryId, countedQuantity, performedBy, notes,
    );

    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json({ message: 'Stock count performed successfully', inventoryItem });
  } catch (error) {
    console.error('Stock count error:', error);
    res.status(500).json({ error: 'Failed to perform stock count' });
  }
});

export default router;