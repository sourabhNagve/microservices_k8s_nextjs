import express from 'express';
import Cart from '../models/Cart.js';
import { validateCartItem, validateCartUpdate, validateUserId } from '../utils/validation.js';
import { validateProduct, calculateCartTotals } from '../utils/productService.js';

const router = express.Router();

// Get user's cart
router.get('/:userId', async (req, res) => {
  try {
    const { error } = validateUserId({ userId: parseInt(req.params.userId) });
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId } = req.params;
    const cartItems = await Cart.findByUserId(userId);
    
    // Calculate totals with product details
    const cartTotals = await calculateCartTotals(cartItems);
    
    // Get cart summary from Redis
    const cartSummary = await Cart.getCartSummary(userId);
    
    res.json({
      message: 'Cart retrieved successfully',
      userId,
      summary: cartSummary,
      ...cartTotals
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

// Add item to cart
router.post('/add', async (req, res) => {
  try {
    const { error } = validateCartItem(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId, productId, quantity = 1 } = req.body;
    
    // Validate product exists and is available
    await validateProduct(productId);
    
    const cartItem = await Cart.addItem(userId, productId, quantity);
    
    res.status(201).json({
      message: 'Item added to cart successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId)
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    if (error.message.includes('not found') || error.message.includes('not available')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// Update cart item
router.put('/update', async (req, res) => {
  try {
    const { error } = validateCartUpdate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId, productId, quantity } = req.body;
    
    // Validate product exists and is available
    await validateProduct(productId);
    
    const cartItem = await Cart.updateItem(userId, productId, quantity);
    
    if (!cartItem) {
      return res.status(404).json({ 
        error: 'Cart item not found' 
      });
    }
    
    res.json({
      message: 'Cart item updated successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId)
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    if (error.message.includes('not found') || error.message.includes('not available')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// Remove item from cart
router.delete('/remove', async (req, res) => {
  try {
    const { error } = validateCartItem(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId, productId } = req.body;
    
    const cartItem = await Cart.removeItem(userId, productId);
    
    if (!cartItem) {
      return res.status(404).json({ 
        error: 'Cart item not found' 
      });
    }
    
    res.json({
      message: 'Item removed from cart successfully',
      cartItem,
      summary: await Cart.getCartSummary(userId)
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
router.delete('/clear/:userId', async (req, res) => {
  try {
    const { error } = validateUserId({ userId: parseInt(req.params.userId) });
    if (error) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.details[0].message 
      });
    }

    const { userId } = req.params;
    const clearedItems = await Cart.clearCart(userId);
    
    res.json({
      message: 'Cart cleared successfully',
      userId,
      clearedItems,
      itemsCleared: clearedItems.length,
      summary: { itemCount: 0, totalItems: 0, updatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

export default router;
