import { 
  getCartKey, 
  getCartItemsKey, 
  getAllHashKeys, 
  setHashField, 
  deleteHashField, 
  deleteKey 
} from '../database.js';

class Cart {
  // Get cart by user ID
  static async findByUserId(userId) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData = await getAllHashKeys(cartItemsKey);
      
      // Convert hash values to cart items array
      const cartItems = Object.entries(cartData).map(([productId, itemData]) => {
        const item = JSON.parse(itemData);
        return {
          id: item.id || `${userId}-${productId}`,
          userId: parseInt(userId),
          productId,
          quantity: item.quantity,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        };
      });

      return cartItems;
    } catch (error) {
      console.error('❌ Error finding cart by user ID:', error);
      throw error;
    }
  }

  // Add item to cart
  static async addItem(userId, productId, quantity = 1) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData = await getAllHashKeys(cartItemsKey);
      
      const existingItem = cartData[productId];
      const currentQuantity = existingItem ? JSON.parse(existingItem).quantity : 0;
      const newQuantity = currentQuantity + quantity;
      
      const cartItem = {
        id: `${userId}-${productId}`,
        userId: parseInt(userId),
        productId,
        quantity: newQuantity,
        createdAt: existingItem ? JSON.parse(existingItem).createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store in Redis hash
      await setHashField(cartItemsKey, productId, cartItem);
      
      // Update cart summary
      await this.updateCartSummary(userId);
      
      return cartItem;
    } catch (error) {
      console.error('❌ Error adding item to cart:', error);
      throw error;
    }
  }

  // Update cart item quantity
  static async updateItem(userId, productId, quantity) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData = await getAllHashKeys(cartItemsKey);
      
      if (!cartData[productId]) {
        return null; // Item not found
      }
      
      const existingItem = JSON.parse(cartData[productId]);
      const cartItem = {
        ...existingItem,
        quantity,
        updatedAt: new Date().toISOString()
      };

      // Update in Redis hash
      await setHashField(cartItemsKey, productId, cartItem);
      
      // Update cart summary
      await this.updateCartSummary(userId);
      
      return cartItem;
    } catch (error) {
      console.error('❌ Error updating cart item:', error);
      throw error;
    }
  }

  // Remove item from cart
  static async removeItem(userId, productId) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData = await getAllHashKeys(cartItemsKey);
      
      if (!cartData[productId]) {
        return null; // Item not found
      }
      
      const removedItem = JSON.parse(cartData[productId]);
      
      // Remove from Redis hash
      await deleteHashField(cartItemsKey, productId);
      
      // Update cart summary
      await this.updateCartSummary(userId);
      
      return removedItem;
    } catch (error) {
      console.error('❌ Error removing item from cart:', error);
      throw error;
    }
  }

  // Clear cart for user
  static async clearCart(userId) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData = await getAllHashKeys(cartItemsKey);
      
      // Get all items before clearing
      const clearedItems = Object.entries(cartData).map(([productId, itemData]) => {
        const item = JSON.parse(itemData);
        return {
          id: item.id || `${userId}-${productId}`,
          userId: parseInt(userId),
          productId,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        };
      });

      // Delete the entire cart hash
      await deleteKey(cartItemsKey);
      
      // Clear cart summary
      const cartKey = getCartKey(userId);
      await deleteKey(cartKey);
      
      return clearedItems;
    } catch (error) {
      console.error('❌ Error clearing cart:', error);
      throw error;
    }
  }

  // Update cart summary (for quick access to totals)
  static async updateCartSummary(userId) {
    try {
      const cartItems = await this.findByUserId(userId);
      const cartKey = getCartKey(userId);
      
      // Calculate total amount
      const totalAmount = cartItems.reduce((sum, item) => {
        const itemPrice = item.product?.price || item.price || 0;
        return sum + (itemPrice * item.quantity);
      }, 0);

      const summary = {
        userId: parseInt(userId),
        itemCount: cartItems.length,
        totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        updatedAt: new Date().toISOString()
      };

      // Store summary in Redis with TTL (24 hours)
      const { setJSON } = await import('../database.js');
      await setJSON(cartKey, summary, 86400); // 24 hours TTL
      
      return summary;
    } catch (error) {
      console.error('❌ Error updating cart summary:', error);
      throw error;
    }
  }

  // Get cart summary
  static async getCartSummary(userId) {
    try {
      const cartKey = getCartKey(userId);
      const { getJSON } = await import('../database.js');
      const summary = await getJSON(cartKey);
      
      if (!summary) {
        // If summary doesn't exist, create it
        return await this.updateCartSummary(userId);
      }
      
      return summary;
    } catch (error) {
      console.error('❌ Error getting cart summary:', error);
      throw error;
    }
  }
}

export default Cart;
