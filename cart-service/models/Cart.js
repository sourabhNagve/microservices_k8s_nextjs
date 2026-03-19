import {
  getCartKey,
  getCartItemsKey,
  getAllHashKeys,
  setHashField,
  deleteHashField,
  deleteKey,
  setJSON,   // ✅ static import — not dynamic inside methods
  getJSON,
} from '../database.js';

class Cart {

  static async findByUserId(userId) {
    try {
      const cartData = await getAllHashKeys(getCartItemsKey(userId));
      return Object.entries(cartData).map(([productId, itemData]) => {
        const item = JSON.parse(itemData);
        return {
          id:        item.id || `${userId}-${productId}`,
          userId:    parseInt(userId),
          productId,
          quantity:  item.quantity,
          price:     item.price || 0,   // ✅ preserve price so updateCartSummary can use it
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        };
      });
    } catch (error) {
      console.error('❌ Error finding cart by user ID:', error);
      throw error;
    }
  }

  static async addItem(userId, productId, quantity = 1, price = 0) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      const existingItem = cartData[productId]
        ? JSON.parse(cartData[productId])  // ✅ parse once, reuse
        : null;

      const cartItem = {
        id:        `${userId}-${productId}`,
        userId:    parseInt(userId),
        productId,
        quantity:  (existingItem?.quantity || 0) + quantity,
        price:     existingItem?.price || price,  // ✅ persist price
        createdAt: existingItem?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setHashField(cartItemsKey, productId, cartItem);
      await this.updateCartSummary(userId);
      return cartItem;
    } catch (error) {
      console.error('❌ Error adding item to cart:', error);
      throw error;
    }
  }

  static async updateItem(userId, productId, quantity) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      if (!cartData[productId]) return null;

      const existingItem = JSON.parse(cartData[productId]); // ✅ parse once
      const cartItem = {
        ...existingItem,
        quantity,
        updatedAt: new Date().toISOString(),
      };

      await setHashField(cartItemsKey, productId, cartItem);
      await this.updateCartSummary(userId);
      return cartItem;
    } catch (error) {
      console.error('❌ Error updating cart item:', error);
      throw error;
    }
  }

  static async removeItem(userId, productId) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      if (!cartData[productId]) return null;

      const removedItem = JSON.parse(cartData[productId]);
      await deleteHashField(cartItemsKey, productId);
      await this.updateCartSummary(userId);
      return removedItem;
    } catch (error) {
      console.error('❌ Error removing item from cart:', error);
      throw error;
    }
  }

  static async clearCart(userId) {
    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      const clearedItems = Object.entries(cartData).map(([productId, itemData]) => {
        const item = JSON.parse(itemData);
        return {
          id:        item.id || `${userId}-${productId}`,
          userId:    parseInt(userId),
          productId,
          quantity:  item.quantity,
          price:     item.price || 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      });

      await deleteKey(cartItemsKey);
      await deleteKey(getCartKey(userId));
      return clearedItems;
    } catch (error) {
      console.error('❌ Error clearing cart:', error);
      throw error;
    }
  }

  static async updateCartSummary(userId) {
    try {
      const cartItems  = await this.findByUserId(userId);

      // ✅ price is now stored on each item so this actually calculates correctly
      const totalAmount = cartItems.reduce((sum, item) =>
        sum + ((item.price || 0) * item.quantity), 0
      );

      const summary = {
        userId:     parseInt(userId),
        itemCount:  cartItems.length,
        totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        updatedAt:  new Date().toISOString(),
      };

      // ✅ static import — no more dynamic import inside method
      await setJSON(getCartKey(userId), summary, 86400);
      return summary;
    } catch (error) {
      console.error('❌ Error updating cart summary:', error);
      throw error;
    }
  }

  static async getCartSummary(userId) {
    try {
      const summary = await getJSON(getCartKey(userId)); // ✅ static import
      return summary ?? await this.updateCartSummary(userId);
    } catch (error) {
      console.error('❌ Error getting cart summary:', error);
      throw error;
    }
  }
}

export default Cart;