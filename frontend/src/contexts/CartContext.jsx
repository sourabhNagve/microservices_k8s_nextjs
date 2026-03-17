'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/components/AuthProvider'; // ✅ use context, not lib/auth directly

// ─── Constants ────────────────────────────────────────────────────────────────
// ✅ env var instead of hardcoded URL
const API_BASE    = process.env.NEXT_PUBLIC_CART_SERVICE_URL;
const MAX_RETRIES = 2;

// ─── Context ──────────────────────────────────────────────────────────────────
const CartContext = createContext(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const apiFetch = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text || res.statusText };
  }

  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}: ${res.statusText}`);
    err.status = res.status;
    throw err;
  }

  return body;
};

const calcSummary = (items) => ({
  itemCount:   items.length,
  totalItems:  items.reduce((s, i) => s + (i.quantity || 0), 0),
  totalAmount: parseFloat(
    items.reduce((s, i) => {
      const price = parseFloat(i.product?.price ?? i.price ?? 0);
      return s + price * (i.quantity || 0);
    }, 0).toFixed(2)
  ),
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const CartProvider = ({ children }) => {
  const [cart,        setCart]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [cartSummary, setCartSummary] = useState({ itemCount: 0, totalItems: 0, totalAmount: 0 });

  const mutating = useRef(false);
  const toast    = useToast();

  // ✅ get user from AuthContext — not from localStorage directly
  const { user } = useAuth();
  const userId   = user?.id ?? null;

  const applyCart = useCallback((items) => {
    setCart(items);
    setCartSummary(calcSummary(items));
  }, []);

  // ── fetchCart ──────────────────────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    if (!userId) {
      applyCart([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch(`${API_BASE}/${userId}`);
      applyCart(data.items ?? []);
    } catch (err) {
      if (err.status === 404) {
        applyCart([]);
        return;
      }
      console.error('[CartContext] fetchCart error:', err);
      setError(err.message);
      applyCart([]);
    } finally {
      setLoading(false);
    }
  }, [userId, applyCart]);

  // ── addToCart ──────────────────────────────────────────────────────────────
  const addToCart = useCallback(async (productId, quantity = 1, retryCount = 0) => {
    if (!userId) {
      toast.error('Please sign in to add items to cart');
      return { success: false, error: 'Not authenticated' };
    }

    mutating.current = true;
    setError(null);

    try {
      await apiFetch(`${API_BASE}/add`, {
        method: 'POST',
        body: JSON.stringify({ userId: parseInt(userId), productId, quantity }),
      });

      await fetchCart();
      toast.success(`Added ${quantity} ${quantity === 1 ? 'item' : 'items'} to cart!`);
      return { success: true };
    } catch (err) {
      console.error('[CartContext] addToCart error:', err);

      if (retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 800 * (retryCount + 1)));
        return addToCart(productId, quantity, retryCount + 1);
      }

      setError(err.message);
      toast.error(err.message || 'Failed to add item to cart');
      return { success: false, error: err.message };
    } finally {
      mutating.current = false;
    }
  }, [userId, fetchCart, toast]);

  // ── updateCartItem ─────────────────────────────────────────────────────────
  const updateCartItem = useCallback(async (productId, quantity) => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    setCart(prev => prev.map(item => {
      const id = item.productId ?? item.product?.id;
      if (id !== productId) return item;
      const price = parseFloat(item.product?.price ?? item.price ?? 0);
      return { ...item, quantity, itemTotal: price * quantity };
    }));

    try {
      const data = await apiFetch(`${API_BASE}/update`, {
        method: 'PUT',
        body: JSON.stringify({ userId: parseInt(userId), productId, quantity }),
      });

      if (data.summary) {
        setCartSummary(data.summary);
      } else {
        setCart(current => {
          setCartSummary(calcSummary(current));
          return current;
        });
      }

      return { success: true };
    } catch (err) {
      console.error('[CartContext] updateCartItem error:', err);
      await fetchCart();
      return { success: false, error: err.message };
    }
  }, [userId, fetchCart]);

  // ── removeFromCart ─────────────────────────────────────────────────────────
  const removeFromCart = useCallback(async (productId) => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    setCart(prev => {
      const next = prev.filter(item => (item.productId ?? item.product?.id) !== productId);
      setCartSummary(calcSummary(next));
      return next;
    });

    try {
      await apiFetch(`${API_BASE}/remove`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: parseInt(userId), productId }),
      });
      return { success: true };
    } catch (err) {
      console.error('[CartContext] removeFromCart error:', err);
      await fetchCart();
      return { success: false, error: err.message };
    }
  }, [userId, fetchCart]);

  // ── clearCart ──────────────────────────────────────────────────────────────
  const clearCart = useCallback(async () => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    try {
      await apiFetch(`${API_BASE}/clear/${userId}`, { method: 'DELETE' });
      applyCart([]);
      return { success: true };
    } catch (err) {
      console.error('[CartContext] clearCart error:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [userId, applyCart]);

  // ── Derived helpers ────────────────────────────────────────────────────────
  const isProductInCart = useCallback((productId) =>
    cart.some(item => (item.productId ?? item.product?.id) === productId),
  [cart]);

  const getCartItemQuantity = useCallback((productId) =>
    cart.find(item => (item.productId ?? item.product?.id) === productId)?.quantity ?? 0,
  [cart]);

  const getCartTotal = useCallback(() =>
    cart.reduce((total, item) => {
      const price = parseFloat(item.product?.price ?? item.price ?? 0);
      return total + price * (item.quantity || 0);
    }, 0),
  [cart]);

  // ── Bootstrap — refetch when user changes (login/logout) ──────────────────
  useEffect(() => {
    fetchCart();
  }, [fetchCart]); // fetchCart already depends on userId so this re-runs on auth change

  const value = {
    cart, loading, error, cartSummary,
    refetch: fetchCart,
    addToCart, updateCartItem, removeFromCart, clearCart,
    isProductInCart, getCartItemQuantity, getCartTotal,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};