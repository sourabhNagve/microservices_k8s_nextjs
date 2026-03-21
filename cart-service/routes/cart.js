import express from 'express';
import Cart from '../models/Cart.js';
import { validateCartItem, validateCartUpdate, validateUserId } from '../utils/validation.js';
import { validateProduct, calculateCartTotals } from '../utils/productService.js';

const router = express.Router();

// ─── Auth middleware ──────────────────────────────────────────────────────────
// FIX 1: every cart route previously accepted any userId from the URL or body
// with no authentication check. Any anonymous caller could read or destroy any
// user's cart by guessing a userId. This middleware verifies the JWT and
// attaches req.user so route handlers can enforce ownership.
//
// It uses the same shared JWT_SECRET as auth-service. In a real deployment you
// would extract this into a shared package or validate via an introspection
// endpoint, but a shared secret is the simplest correct solution here.
import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// FIX 2: ownership guard — the caller may only access their own cart unless
// they are an admin. Applied to every route below.
const assertOwnership = (req, res, userId) => {
  const tokenUserId = req.user.userId;
  if (tokenUserId !== parseInt(userId, 10) && !req.user.isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};

// ─── Get user's cart ──────────────────────────────────────────────────────────
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { error } = validateUserId({ userId: parseInt(req.params.userId, 10) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { userId } = req.params;

    // FIX 2 (applied): ownership check
    if (!assertOwnership(req, res, userId)) return;

    const cartItems  = await Cart.findByUserId(userId);
    const cartTotals = await calculateCartTotals(cartItems);
    const cartSummary = await Cart.getCartSummary(userId);

    res.json({
      message: 'Cart retrieved successfully',
      userId,
      summary: cartSummary,
      ...cartTotals,
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

// ─── Add item to cart ─────────────────────────────────────────────────────────
router.post('/add', authenticate, async (req, res) => {
  try {
    const { error } = validateCartItem(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { userId, productId, quantity = 1 } = req.body;

    // FIX 2 (applied)
    if (!assertOwnership(req, res, userId)) return;

    // FIX 3 (original cart.js line 51): validateProduct returns the product
    // including its price, but the original code discarded it and called
    // Cart.addItem without a price — every new item was stored with price 0.
    // Now we pass the validated price through so the cart summary is correct.
    const product  = await validateProduct(productId);
    const cartItem = await Cart.addItem(userId, productId, quantity, product.price);

    res.status(201).json({
      message: 'Item added to cart successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId),
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    if (error.message.includes('not found') || error.message.includes('not available')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// ─── Update cart item ─────────────────────────────────────────────────────────
router.put('/update', authenticate, async (req, res) => {
  try {
    const { error } = validateCartUpdate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { userId, productId, quantity } = req.body;

    // FIX 2 (applied)
    if (!assertOwnership(req, res, userId)) return;

    // FIX 4 (original line 78): validateProduct is called on update to confirm
    // the product is still active. Previously a product could be deactivated
    // after being added to a cart and users could still update its quantity,
    // implying it was still purchasable. Now we reject the update with a clear
    // error so the client can remove the item or show a warning.
    await validateProduct(productId);

    const cartItem = await Cart.updateItem(userId, productId, quantity);

    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({
      message: 'Cart item updated successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId),
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    if (error.message.includes('not found') || error.message.includes('not available')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// ─── Remove item from cart ────────────────────────────────────────────────────
// FIX 5 (original line 104): changed from DELETE with a body to
// DELETE /:userId/:productId. Many HTTP clients, proxies, and load balancers
// strip the body from DELETE requests. Using path parameters is reliable and
// also makes the ownership check work with assertOwnership's userId param.
router.delete('/:userId/:productId', authenticate, async (req, res) => {
  try {
    const { userId, productId } = req.params;

    const { error } = validateUserId({ userId: parseInt(userId, 10) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // FIX 2 (applied)
    if (!assertOwnership(req, res, userId)) return;

    const cartItem = await Cart.removeItem(userId, productId);

    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({
      message: 'Item removed from cart successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId),
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// ─── Clear cart ───────────────────────────────────────────────────────────────
router.delete('/clear/:userId', authenticate, async (req, res) => {
  try {
    const { error } = validateUserId({ userId: parseInt(req.params.userId, 10) });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message,
      });
    }

    const { userId } = req.params;

    // FIX 2 (applied)
    if (!assertOwnership(req, res, userId)) return;

    const clearedItems = await Cart.clearCart(userId);

    res.json({
      message: 'Cart cleared successfully',
      userId,
      clearedItems,
      itemsCleared: clearedItems.length,
      summary: { itemCount: 0, totalItems: 0, totalAmount: 0, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;