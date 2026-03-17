// Product service integration utilities

// Validate if product exists and is active
export const validateProduct = async (productId) => {
  try {
    const response = await fetch(`http://localhost:3003/api/products/${productId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Product not found');
      }
      // If product service is down, allow the cart operation but log the error
      console.warn('Product service unavailable, allowing cart operation:', response.status);
      return { id: productId, active: true, price: 0, name: 'Unknown Product' }; // Fallback product
    }
    
    const data = await response.json();
    const product = data.product;
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Check if product is active/in stock
    if (!product.active) {
      throw new Error('Product is not available');
    }
    
    // Ensure price is a number
    return {
      ...product,
      price: parseFloat(product.price) || 0
    };
  } catch (error) {
    console.error('Product validation error:', error);
    // If product service is completely down, allow the cart operation
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
        const response = await fetch(`http://localhost:3003/api/products/${productId}`);
        if (response.ok) {
          const data = await response.json();
          const product = data.product;
          if (product) {
            // Ensure price is a number
            return {
              ...product,
              price: parseFloat(product.price) || 0
            };
          }
        }
        // Return fallback product if service is down
        return { id: productId, active: true, price: 0, name: 'Unknown Product' };
      } catch (error) {
        // Return fallback product for individual failures
        return { id: productId, active: true, price: 0, name: 'Unknown Product' };
      }
    });
    
    const products = await Promise.all(productPromises);
    return products.filter(product => product !== null);
  } catch (error) {
    console.error('Error fetching product details:', error);
    // Return fallback products for all items
    return productIds.map(id => ({ id, active: true, price: 0, name: 'Unknown Product' }));
  }
};

// Calculate cart totals with product prices
export const calculateCartTotals = async (cartItems) => {
  try {
    if (!cartItems || cartItems.length === 0) {
      return {
        subtotal: 0,
        itemCount: 0,
        totalItems: 0,
        items: []
      };
    }
    
    const productIds = [...new Set(cartItems.map(item => item.productId))];
    const products = await getProductDetails(productIds);
    
    const productMap = products.reduce((map, product) => {
      map[product.id] = product;
      return map;
    }, {});
    
    const itemsWithDetails = cartItems.map(cartItem => {
      const product = productMap[cartItem.productId] || { 
        id: cartItem.productId, 
        active: true, 
        price: 0, 
        name: 'Unknown Product' 
      };
      // Ensure proper number calculation
      const numericPrice = parseFloat(product.price) || 0;
      const itemTotal = numericPrice * cartItem.quantity;
      
      return {
        ...cartItem,
        product: {
          ...product,
          price: numericPrice
        },
        itemTotal: itemTotal
      };
    });
    
    const subtotal = itemsWithDetails.reduce((sum, item) => sum + item.itemTotal, 0);
    
    return {
      subtotal,
      itemCount: itemsWithDetails.length,
      totalItems: itemsWithDetails.reduce((sum, item) => sum + item.quantity, 0),
      items: itemsWithDetails
    };
  } catch (error) {
    console.error('Error calculating cart totals:', error);
    // Return cart with fallback pricing
    return {
      subtotal: 0,
      itemCount: cartItems.length,
      totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      items: cartItems.map(item => ({
        ...item,
        product: { id: item.productId, active: true, price: 0, name: 'Unknown Product' },
        itemTotal: 0
      }))
    };
  }
};
