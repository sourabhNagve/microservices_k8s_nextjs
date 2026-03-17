'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingBag, X, AlertCircle, Shield, Menu, ArrowLeft, Trash2,
  Minus, Plus, Loader2, RefreshCw,
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/components/Toast';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import AuthGuard from '@/components/AuthGuard';

// ─── Constants ────────────────────────────────────────────────────────────────
const FREE_SHIPPING_THRESHOLD = 100;
const FLAT_SHIPPING_RATE      = 10;
const TAX_RATE                = 0.08; // applied on subtotal only (pre-shipping)
const MAX_QUANTITY            = 99;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getProductId = (item) =>
  item.productId ?? item.product?.id ?? item.id ?? null;

const getProduct = (item) => ({
  id:          getProductId(item),
  name:        item.product?.name   ?? item.name   ?? 'Unknown Product',
  price:       item.product?.price  ?? item.price  ?? 0,
  images:      item.product?.images ?? item.images ?? [],
  sku:         item.product?.sku    ?? item.sku,
  maxQuantity: item.product?.stock  ?? item.maxQuantity ?? MAX_QUANTITY,
});

const calcShipping = (subtotal) => {
  if (subtotal <= 0) return 0;
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  return isFreeShipping ? 0 : FLAT_SHIPPING_RATE;
};

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
  >
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700">
      <p id="confirm-dialog-title" className="text-gray-800 dark:text-white font-medium mb-6">
        {message}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          Clear Cart
        </button>
      </div>
    </div>
  </div>
);

// ─── CartItem ─────────────────────────────────────────────────────────────────
const CartItem = ({ item, onRemove }) => {
  const product   = getProduct(item);
  const productId = getProductId(item);

  const [quantity,   setQuantity]   = useState(item.quantity);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const previousQty   = useRef(item.quantity);
  const debounceTimer = useRef(null);

  const { updateCartItem } = useCart();
  const toast = useToast();

  // Sync if parent cart state changes externally
  useEffect(() => {
    setQuantity(item.quantity);
  }, [item.quantity]);

  // Clean up pending debounce on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Debounced API call — fires 400ms after user stops clicking
  const syncToServer = useCallback(
    (newQty) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(async () => {
        setIsUpdating(true);
        try {
          const result = await updateCartItem(productId, newQty);
          if (!result.success) {
            toast.error(result.error ?? 'Failed to update cart');
            setQuantity(previousQty.current); // rollback
          } else {
            previousQty.current = newQty; // commit new baseline
          }
        } catch {
          toast.error('Could not update cart. Please try again.');
          setQuantity(previousQty.current); // rollback
        } finally {
          setIsUpdating(false);
        }
      }, 400);
    },
    [productId, updateCartItem, toast]
  );

  const changeQuantity = (delta) => {
    const newQty = quantity + delta;
    if (newQty < 1 || newQty > product.maxQuantity) return;
    setQuantity(newQty); // optimistic — instant UI update
    syncToServer(newQty);
  };

  const handleRemove = async () => {
    if (isRemoving) return; // prevent double-fire
    setIsRemoving(true);
    try {
      await onRemove(productId);
    } finally {
      setIsRemoving(false);
    }
  };

  // Warn user if productId is missing — helps catch data shape issues early
  if (!productId) {
    console.warn('[CartItem] item is missing a valid productId:', item);
  }

  const price     = Number(product.price) || 0;
  const lineTotal = (price * quantity).toFixed(2);

  return (
    <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 hover:border-gray-200 dark:hover:border-gray-700 transition-colors">

      {/* Image */}
      <div className="flex-shrink-0 self-start">
        {product.images.length > 0 ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            width={88}
            height={88}
            className="w-20 h-20 rounded-xl object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xs">
            No image
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate text-base">
            {product.name}
          </h3>
          <button
            onClick={handleRemove}
            disabled={isRemoving}
            aria-label={`Remove ${product.name} from cart`}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRemoving
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <X className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>

        {product.sku && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">SKU: {product.sku}</p>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Quantity controls */}
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => changeQuantity(-1)}
              disabled={quantity <= 1 || isUpdating}
              aria-label="Decrease quantity"
              className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <span className="w-9 text-center text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
              {isUpdating
                ? <Loader2 className="inline w-3 h-3 animate-spin" aria-hidden="true" />
                : quantity}
            </span>

            <button
              onClick={() => changeQuantity(1)}
              disabled={isUpdating || quantity >= product.maxQuantity}
              aria-label="Increase quantity"
              className="w-8 h-8 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ${price.toFixed(2)} × {quantity}
            </p>
            <p className="text-base font-bold text-gray-900 dark:text-white">
              ${lineTotal}
            </p>
          </div>
        </div>

        {/* Stock warning — shown when approaching max */}
        {quantity >= product.maxQuantity && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Maximum available quantity reached.
          </p>
        )}
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CartPage() {
  const [mobileMenuOpen,    setMobileMenuOpen]    = useState(false);
  const [showClearConfirm,  setShowClearConfirm]  = useState(false);

  const { cart, loading, error, cartSummary, removeFromCart, clearCart, getCartTotal, refetch } = useCart();
  const toast = useToast();

  // Single source of truth — always in sync with rendered items
  const itemCount  = cart.length;
  const cartTotal  = getCartTotal();
  const shipping   = calcShipping(cartTotal);
  const tax        = cartTotal * TAX_RATE;
  const finalTotal = cartTotal + shipping + tax;

  // Amount needed to unlock free shipping (only positive values)
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);

  const handleRemoveItem = async (productId) => {
    try {
      const result = await removeFromCart(productId);
      if (!result.success) toast.error(result.error ?? 'Failed to remove item');
      else toast.success('Item removed');
    } catch {
      toast.error('Could not remove item. Please try again.');
    }
  };

  const handleClearCart = async () => {
    setShowClearConfirm(false);
    try {
      const result = await clearCart();
      if (!result.success) toast.error(result.error ?? 'Failed to clear cart');
      else toast.success('Cart cleared');
    } catch {
      toast.error('Could not clear cart. Please try again.');
    }
  };

  const navLinks = [['/', 'Home'], ['/products', 'Products'], ['/cart', 'Cart']];

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

        {/* Confirm dialog */}
        {showClearConfirm && (
          <ConfirmDialog
            message="Remove all items from your cart?"
            onConfirm={handleClearCart}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}

        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">
                MicroStore
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      href === '/cart'
                        ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
                <div className="ml-2 flex items-center gap-2">
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </nav>

              {/* Mobile toggle */}
              <button
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen
                  ? <X className="w-5 h-5" aria-hidden="true" />
                  : <Menu className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>

            {/* Mobile nav — closes on link click */}
            {mobileMenuOpen && (
              <div className="md:hidden pb-4 space-y-1 border-t border-gray-100 dark:border-gray-800 mt-1 pt-3">
                {navLinks.map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {label}
                  </Link>
                ))}
                <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                  <UserMenu />
                  <ThemeToggle />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Page header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Shopping Cart
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Continue Shopping
              </Link>
              {cart.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Clear Cart
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Cart items */}
            <div className="lg:col-span-2 space-y-3">

              {/* Loading state */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading cart…</p>
                </div>
              )}

              {/* Error state — uses refetch instead of hard reload */}
              {!loading && error && (
                <div className="text-center py-16">
                  <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-500" aria-hidden="true" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                  <button
                    onClick={refetch}
                    className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && cart.length === 0 && (
                <div className="text-center py-20">
                  <div className="w-16 h-16 mx-auto mb-5 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                    <ShoppingBag className="w-8 h-8 text-gray-400" aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Your cart is empty
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Add something to get started.
                  </p>
                  <Link
                    href="/products"
                    className="inline-block px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                  >
                    Browse Products
                  </Link>
                </div>
              )}

              {/* Cart items list */}
              {!loading && !error && cart.map((item, index) => {
                const id = getProductId(item);
                return (
                  <CartItem
                    key={id ?? `cart-item-${index}`}
                    item={item}
                    onRemove={handleRemoveItem}
                  />
                );
              })}
            </div>

            {/* Order summary */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 sticky top-24">
                <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-5">
                  Order Summary
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${cartTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Shipping</span>
                    <span className={`font-medium ${
                      shipping === 0 && cartTotal > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {cartTotal <= 0 ? '—' : shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}`}
                    </span>
                  </div>

                  {/* Free shipping nudge — only shown when amount is strictly positive */}
                  {cartTotal > 0 && amountToFreeShipping > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded-lg px-3 py-2">
                      Add ${amountToFreeShipping.toFixed(2)} more for free shipping
                    </p>
                  )}

                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${tax.toFixed(2)}
                    </span>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex justify-between">
                    <span className="font-bold text-gray-900 dark:text-white">Total</span>
                    <span className="font-bold text-gray-900 dark:text-white text-lg">
                      ${finalTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {cart.length > 0 ? (
                    <Link
                      href="/checkout"
                      className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all text-center block"
                    >
                      Proceed to Checkout
                    </Link>
                  ) : (
                    <Link
                      href="/products"
                      className="block w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 text-center transition-colors"
                    >
                      Browse Products
                    </Link>
                  )}
                </div>

                {/* Trust badge */}
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                  Secure checkout
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </AuthGuard>
  );
}