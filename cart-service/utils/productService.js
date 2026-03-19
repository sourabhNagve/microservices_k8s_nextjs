// Product service integration utilities

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3003';
console.log('PRODUCT_SERVICE_URL:', PRODUCT_SERVICE_URL); // ✅ add this
// Validate if product exists and is active
export const validateProduct = async (productId) => {
  try {
    const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Product not found');
      }
      // If product service is down, allow the cart operation but log the error
      console.warn('Product service unavailable, allowing cart operation:', response.status);
      return { id: productId, active: true, price: 0, name: 'Unknown Product' };
    }
    
    const data = await response.json();
    const product = data.product;
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    if (!product.active) {
      throw new Error('Product is not available');
    }
    
    return {
      ...product,
      price: parseFloat(product.price) || 0
    };
  } catch (error) {
    console.error('Product validation error:', error);
    if (error.message.includes('fetch') || error.code === 'ECONNREFUSED') {
      console.warn('Product service down, allowing cart operation with fallback');
      return { id: productId, active: true, price: 0, name: 'Unknown Product' };
    }
    throw error;
  }
};

// Get product details for cart items
export const getProductDetails = async (productIds) => {
  try {
    const productPromises = productIds.map(async (productId) => {
      try {
        const response = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${productId}`);
        if (response.ok) {
          const data = await response.json();
          const product = data.product;
          if (product) {
            return {
              ...product,
              price: parseFloat(product.price) || 0
            };
          }
        }
        return { id: productId, active: true, price: 0, name: 'Unknown Product' };
      } catch (error) {
        return { id: productId, active: true, price: 0, name: 'Unknown Product' };
      }
    });
    
    const products = await Promise.all(productPromises);
    return products.filter(product => product !== null);
  } catch (error) {
    console.error('Error fetching product details:', error);
    return productIds.map(id => ({ id, active: true, price: 0, name: 'Unknown Product' }));
  }
};

// Calculate cart totals with product prices
export const calculateCartTotals = async (cartItems) => {
  try {
    if (!cartItems || cartItems.length === 0) {
      return {
        subtotal:   0,
        itemCount:  0,
        totalItems: 0,
        items:      []
      };
    }
    
    const productIds = [...new Set(cartItems.map(item => item.productId))];
    const products   = await getProductDetails(productIds);
    
    const productMap = products.reduce((map, product) => {
      map[product.id] = product;
      return map;
    }, {});
    
    const itemsWithDetails = cartItems.map(cartItem => {
      const product      = productMap[cartItem.productId] || {
        id:     cartItem.productId,
        active: true,
        price:  0,
        name:   'Unknown Product'
      };
      const numericPrice = parseFloat(product.price) || 0;
      const itemTotal    = numericPrice * cartItem.quantity;
      
      return {
        ...cartItem,
        product: { ...product, price: numericPrice },
        itemTotal,
      };
    });
    
    const subtotal = itemsWithDetails.reduce((sum, item) => sum + item.itemTotal, 0);
    
    return {
      subtotal,
      itemCount:  itemsWithDetails.length,
      totalItems: itemsWithDetails.reduce((sum, item) => sum + item.quantity, 0),
      items:      itemsWithDetails,
    };
  } catch (error) {
    console.error('Error calculating cart totals:', error);
    return {
      subtotal:   0,
      itemCount:  cartItems.length,
      totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      items:      cartItems.map(item => ({
        ...item,
        product:   { id: item.productId, active: true, price: 0, name: 'Unknown Product' },
        itemTotal: 0,
      })),
    };
  }
};