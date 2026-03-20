'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingCart, Package, Menu, X, CheckCircle2,
  Loader2, ArrowRight, Facebook, Twitter,
} from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import AuthenticatedLink from '@/components/AuthenticatedLink';
import AddToCartButton from '@/components/AddToCartButton';
import { useCart } from '@/contexts/CartContext';

// ─── Constants ────────────────────────────────────────────────────────────────
// Use NEXT_PUBLIC_ prefix — PRODUCT_SERVICE_URL is a server-side env var
// and is undefined in the browser. All client-side env vars must be prefixed.
const PRODUCT_API = `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL ?? 'http://localhost:3003'}/api/products?limit=6`;

const NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/cart',     label: 'Cart', authenticated: true, showBadge: true },
];

const FOOTER_QUICK_LINKS = [
  { href: '/products',     label: 'Products' },
  { href: '/auth/signin',  label: 'Sign In' },
  { href: '/auth/signup',  label: 'Sign Up' },
  { href: '/orders',       label: 'My Orders' },
];

const FOOTER_SUPPORT_LINKS = [
  { href: '/help',    label: 'Help Center' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms',   label: 'Terms of Service' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normalise  = (item) => item.product ?? item;
const fmt        = { price: (n) => `$${Number(n ?? 0).toFixed(2)}` };

// ─── Product card ─────────────────────────────────────────────────────────────
const FeaturedCard = ({ item }) => {
  const product = normalise(item);
  const inStock = product.status === 'active' || product.active ||
                  (product.stock_quantity ?? product.stock ?? 0) > 0;

  return (
    <div className="group bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-xl transition-all duration-300 flex flex-col">
      {/* Image */}
      <div className="relative overflow-hidden">
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="w-full h-48 sm:h-56 object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-48 sm:h-56 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600" aria-hidden="true" />
          </div>
        )}

        <div
          className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          aria-hidden="true"
        />

        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            inStock ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mb-1">
            {product.name}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 leading-relaxed">
            {product.description ?? 'No description available.'}
          </p>
        </div>

        <div className="flex items-baseline justify-between mb-4">
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {fmt.price(product.price)}
          </span>
          {product.originalPrice && (
            <span className="text-sm text-gray-400 line-through">
              {fmt.price(product.originalPrice)}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/products/${product.id}`}
            className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors text-center"
          >
            View Details
          </Link>
          <AddToCartButton
            productId={product.id}
            disabled={!inStock}
            title={`Add ${product.name} to Cart`}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);

  const { cartSummary } = useCart();

  // ── Fetch featured products ──────────────────────────────────────────────
  const fetchFeaturedProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(PRODUCT_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeaturedProducts(data.products?.slice(0, 6) ?? []);
    } catch (err) {
      console.error('[Home] fetchFeaturedProducts:', err);
      // Non-critical — just show empty state, don't surface error to user
      setFeaturedProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeaturedProducts();
  }, [fetchFeaturedProducts]);
  // Note: debug console.logs for localStorage removed — use browser DevTools instead

  const cartCount = cartSummary?.itemCount ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            <Link href="/" className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">
              MicroStore
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/products"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Products
              </Link>

              {/* Cart with badge */}
              <AuthenticatedLink
                href="/cart"
                className="relative px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
              >
                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                Cart
                {cartCount > 0 && (
                  <span className="min-w-[1.1rem] h-[1.1rem] bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 font-semibold">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </AuthenticatedLink>

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

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 pt-3 space-y-1 border-t border-gray-100 dark:border-gray-800">
              <Link
                href="/products"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Products
              </Link>
              <AuthenticatedLink
                href="/cart"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                Cart
                {cartCount > 0 && (
                  <span className="min-w-[1.1rem] h-[1.1rem] bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 font-semibold">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </AuthenticatedLink>
              <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                <UserMenu />
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="relative py-20 sm:py-28 overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
          {/* Decorative blobs */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-0 w-80 h-80 bg-blue-400 rounded-full blur-3xl opacity-20 animate-pulse" />
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-400 rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />
          </div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
              Welcome to{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-pink-400">
                MicroStore
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              Your one-stop shop for quality products with fast delivery and excellent customer service.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-blue-600 font-semibold rounded-full text-base hover:bg-blue-50 hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              Browse Products
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ── Featured Products ─────────────────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Featured Products
              </h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                Handpicked products from our latest collection
              </p>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading products…</p>
              </div>
            )}

            {/* Products grid */}
            {!loading && featuredProducts.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuredProducts.map((item) => {
                    const product = normalise(item);
                    return <FeaturedCard key={product.id} item={item} />;
                  })}
                </div>

                <div className="text-center mt-12">
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 px-6 py-3 border-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 font-semibold rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-all duration-200"
                  >
                    View All Products
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </>
            )}

            {/* Empty state */}
            {!loading && featuredProducts.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Package className="w-8 h-8 text-gray-400" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  No products available
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Check back later for new arrivals.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">

            {/* Brand */}
            <div className="md:col-span-2">
              <p className="text-xl font-bold mb-3">MicroStore</p>
              <p className="text-gray-400 text-sm leading-relaxed mb-5 max-w-sm">
                Your trusted online marketplace for quality products and exceptional service.
              </p>
              <div className="flex gap-3">
                <a href="#" aria-label="Facebook" className="text-gray-500 hover:text-white transition-colors">
                  <Facebook className="w-5 h-5" aria-hidden="true" />
                </a>
                <a href="#" aria-label="Twitter / X" className="text-gray-500 hover:text-white transition-colors">
                  <Twitter className="w-5 h-5" aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                Quick Links
              </h3>
              <ul className="space-y-2">
                {FOOTER_QUICK_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                Support
              </h3>
              <ul className="space-y-2">
                {FOOTER_SUPPORT_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-gray-400 hover:text-white transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-sm text-gray-500">
              © {new Date().getFullYear()} MicroStore. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
