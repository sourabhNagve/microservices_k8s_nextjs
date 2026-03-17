'use client';

import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/components/Toast';

export default function AddToCartButton({ 
  productId, 
  quantity = 1, 
  className = '', 
  title = 'Add to Cart',
  disabled = false 
}) {
  const { addToCart } = useCart();
  const toast = useToast();

  const handleAddToCart = async (e) => {
    e.preventDefault();
    
    if (disabled) return;
    
    try {
      const result = await addToCart(productId, quantity);
      if (result.success) {
        toast.success('Item added to cart!');
      } else {
        toast.error(result.error || 'Failed to add to cart');
      }
    } catch (err) {
      toast.error('An error occurred while adding to cart');
    }
  };

  return (
    <button
      onClick={handleAddToCart}
      disabled={disabled}
      className={`p-2 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title={title}
    >
      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    </button>
  );
}
