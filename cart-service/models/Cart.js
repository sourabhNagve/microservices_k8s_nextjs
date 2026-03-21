import {
  getCartKey,
  getCartItemsKey,
  getAllHashKeys,
  setHashField,
  deleteHashField,
  deleteKey,
  setJSON,
  getJSON,
} from '../database.js';

// FIX 1: centralised safe JSON parser used by every method that reads from
// Redis/memoryStore. A corrupt or partially-written hash value would previously
// throw an unhandled SyntaxError inside map/reduce calls, crashing the entire
// route handler. Now corrupt entries are skipped with a warning instead.
function safeParse(str, context = '') {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    console.warn(`⚠️  Cart: skipping corrupt entry${context ? ` (${context})` : ''}`);
    return null;
  }
}

class Cart {

  static async findByUserId(userId) {
    try {
      const cartData = await getAllHashKeys(getCartItemsKey(userId));

      // FIX 2 (original line 17): use safeParse and filter out any null results
      // so a single corrupt Redis value does not crash the whole cart read.
      return Object.entries(cartData)
        .map(([productId, itemData]) => {
          const item = safeParse(itemData, `userId=${userId} productId=${productId}`);
          if (!item) return null;
          return {
            id:        item.id || `${userId}-${productId}`,
            userId:    parseInt(userId, 10),
            productId,
            quantity:  item.quantity,
            price:     item.price || 0,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString(),
          };
        })
        .filter(Boolean); // drop corrupt entries
    } catch (error) {
      console.error('❌ Error finding cart by user ID:', error);
      throw error;
    }
  }

  static async addItem(userId, productId, quantity = 1, price = 0) {
    // FIX 3 (original line 35): validate inputs before touching storage so
    // bad data never enters Redis and corrupts the hash.
    if (!userId || !productId) throw new Error('userId and productId are required');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error('quantity must be an integer between 1 and 1000');
    }
    if (typeof price !== 'number' || price < 0) {
      throw new Error('price must be a non-negative number');
    }

    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      const existingItem = cartData[productId]
        ? safeParse(cartData[productId], `addItem productId=${productId}`)
        : null;

      // FIX 4 (original line 44): cap the total quantity so a user cannot
      // accumulate more than 1000 units of a single product by repeatedly
      // calling addItem. Without this cap the quantity grows unboundedly.
      const newQuantity = Math.min((existingItem?.quantity || 0) + quantity, 1000);

      const cartItem = {
        id:        `${userId}-${productId}`,
        userId:    parseInt(userId, 10),
        productId,
        quantity:  newQuantity,
        price:     existingItem?.price ?? price,
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
    // FIX 5: same input guard as addItem — prevents garbage values reaching Redis.
    if (!userId || !productId) throw new Error('userId and productId are required');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error('quantity must be an integer between 1 and 1000');
    }

    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      if (!cartData[productId]) return null;

      const existingItem = safeParse(cartData[productId], `updateItem productId=${productId}`);
      if (!existingItem) return null; // corrupt entry — treat as not found

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
    if (!userId || !productId) throw new Error('userId and productId are required');

    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      if (!cartData[productId]) return null;

      // FIX 6 (original line 89): use safeParse — if the stored value is
      // corrupt we still want to delete the hash field rather than throwing,
      // so the corrupt entry gets cleaned up instead of persisting forever.
      const removedItem = safeParse(cartData[productId], `removeItem productId=${productId}`) || {
        productId,
        userId: parseInt(userId, 10),
      };

      await deleteHashField(cartItemsKey, productId);
      await this.updateCartSummary(userId);
      return removedItem;
    } catch (error) {
      console.error('❌ Error removing item from cart:', error);
      throw error;
    }
  }

  static async clearCart(userId) {
    if (!userId) throw new Error('userId is required');

    try {
      const cartItemsKey = getCartItemsKey(userId);
      const cartData     = await getAllHashKeys(cartItemsKey);

      // FIX 7 (original line 103): use safeParse and filter nulls so a single
      // corrupt entry does not prevent the rest of the cart from being cleared.
      const clearedItems = Object.entries(cartData)
        .map(([productId, itemData]) => {
          const item = safeParse(itemData, `clearCart productId=${productId}`);
          if (!item) return null;
          return {
            id:        item.id || `${userId}-${productId}`,
            userId:    parseInt(userId, 10),
            productId,
            quantity:  item.quantity,
            price:     item.price || 0,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          };
        })
        .filter(Boolean);

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
      const cartItems = await this.findByUserId(userId);

      // FIX 8 (original line 124): floating-point arithmetic can accumulate
      // rounding errors across many items (e.g. 3 × £0.10 = £0.30000000000000004).
      // Round each line total independently before summing to avoid this.
      const totalAmount = cartItems.reduce((sum, item) => {
        const lineTotal = parseFloat(((item.price || 0) * item.quantity).toFixed(2));
        return sum + lineTotal;
      }, 0);

      const summary = {
        userId:      parseInt(userId, 10),
        itemCount:   cartItems.length,
        totalItems:  cartItems.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        updatedAt:   new Date().toISOString(),
      };

      await setJSON(getCartKey(userId), summary, 86400);
      return summary;
    } catch (error) {
      console.error('❌ Error updating cart summary:', error);
      throw error;
    }
  }

  static async getCartSummary(userId) {
    try {
      const summary = await getJSON(getCartKey(userId));
      return summary ?? await this.updateCartSummary(userId);
    } catch (error) {
      console.error('❌ Error getting cart summary:', error);
      throw error;
    }
  }
}

export default Cart;