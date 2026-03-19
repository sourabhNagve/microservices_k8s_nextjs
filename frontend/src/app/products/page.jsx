'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search, SlidersHorizontal, X, Menu, ArrowLeft,
  ShoppingBag, AlertCircle, Loader2, CheckCircle2, Package,
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import AuthenticatedLink from '@/components/AuthenticatedLink';
import AddToCartButton from '@/components/AddToCartButton';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRODUCT_API = `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/api/products`;

const NAV_LINKS = [
  { href: '/',         label: 'Home' },
  { href: '/products', label: 'Products', active: true },
  { href: '/cart',     label: 'Cart', authenticated: true },
];

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: '1',   label: 'Electronics' },
  { value: '2',   label: 'Clothing' },
  { value: '3',   label: 'Books' },
  { value: '4',   label: 'Home & Garden' },
  { value: '5',   label: 'Sports' },
];

const SORT_OPTIONS = [
  { value: 'name',       label: 'Name (A–Z)' },
  { value: 'price-low',  label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'stock',      label: 'Stock Level' },
];

const DEFAULT_FILTERS = { search: '', category: 'all', sort: 'name' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Normalise API response — handles both { product: {...} } and flat shapes */
const normalise = (item) => item.product ?? item;

const fmt = {
  price: (n) => `$${Number(n ?? 0).toFixed(2)}`,
};

// ─── Product Card ─────────────────────────────────────────────────────────────
const ProductCard = ({ item, isInCart }) => {
  const product  = normalise(item);
  const inStock  = product.status === 'active' || product.active || (product.stock_quantity ?? product.stock ?? 0) > 0;
  const imgSrc   = product.images?.[0];

  return (
    <div className="group bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg transition-all duration-300 flex flex-col">

      {/* Image */}
      <div className="relative overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={product.name}
            className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-44 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-300 dark:text-gray-600" aria-hidden="true" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" aria-hidden="true" />

        {/* Stock badge */}
        <div className="absolute top-2.5 right-2.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            inStock
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}>
            {inStock ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>

        {/* In-cart indicator — always visible, not hover-only */}
        {isInCart && (
          <div className="absolute top-2.5 left-2.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-white">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
              In Cart
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mb-1 text-sm">
            {product.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
            {product.description ?? 'No description available.'}
          </p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {fmt.price(product.price)}
          </span>
          {product.sku && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {product.sku}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/products/${product.id}`}
            className="flex-1 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors text-center"
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
export default function ProductsPage() {
  const [products,      setProducts]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [filters,       setFilters]       = useState(DEFAULT_FILTERS);
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const { isProductInCart } = useCart();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(PRODUCT_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load products.`);
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (err) {
      console.error('[ProductsPage] fetchProducts:', err);
      setError(err.message ?? 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Filter + sort — memoised so it only recalculates when deps change ───────
  const displayedProducts = useMemo(() => {
    const term = filters.search.toLowerCase();

    const filtered = products.filter((item) => {
      const p = normalise(item);
      const matchesSearch =
        !term ||
        p.name?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term);
      const matchesCategory =
        filters.category === 'all' ||
        p.categoryId?.toString() === filters.category;
      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      const pa = normalise(a);
      const pb = normalise(b);
      switch (filters.sort) {
        case 'name':
          return (pa.name ?? '').localeCompare(pb.name ?? '');
        case 'price-low':
          return parseFloat(pa.price ?? 0) - parseFloat(pb.price ?? 0);
        case 'price-high':
          return parseFloat(pb.price ?? 0) - parseFloat(pa.price ?? 0);
        case 'stock':
          return (
            (pb.stock_quantity ?? pb.stock ?? 0) -
            (pa.stock_quantity ?? pa.stock ?? 0)
          );
        default:
          return 0;
      }
    });
  }, [products, filters]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

// ✅ line 211 — sort is not a filter, don't treat it as one
const hasActiveFilters =
  filters.search !== '' ||
  filters.category !== 'all';

  const inCartCount = useMemo(
    () => displayedProducts.filter((item) => isProductInCart(normalise(item).id)).length,
    [displayedProducts, isProductInCart]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">
              MicroStore
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ href, label, active, authenticated }) => {
                const className = `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`;
                return authenticated ? (
                  <AuthenticatedLink key={href} href={href} className={className}>{label}</AuthenticatedLink>
                ) : (
                  <Link key={href} href={href} className={className}>{label}</Link>
                );
              })}
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
              {NAV_LINKS.map(({ href, label, authenticated }) =>
                authenticated ? (
                  <AuthenticatedLink
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {label}
                  </AuthenticatedLink>
                ) : (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {label}
                  </Link>
                )
              )}
              <div className="flex items-center justify-between px-3 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
                <UserMenu />
                <ThemeToggle />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Products</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Discover our full collection
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Home
            </Link>
            {/* Mobile filter toggle */}
            <button
              onClick={() => setFilterPanelOpen((o) => !o)}
              className="lg:hidden inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 w-4 h-4 rounded-full bg-white text-blue-600 text-xs flex items-center justify-center font-bold">
                  !
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Search + Filters ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search products…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {filters.search && (
              <button
                onClick={() => setFilter('search', '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Filter selects — always visible on lg, toggle on mobile */}
          <div className={`${filterPanelOpen ? 'flex' : 'hidden lg:flex'} flex-col sm:flex-row gap-3`}>
            <div className="flex-1">
              <label htmlFor="category-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Category
              </label>
              <select
                id="category-filter"
                value={filters.category}
                onChange={(e) => setFilter('category', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label htmlFor="sort-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Sort By
              </label>
              <select
                id="sort-filter"
                value={filters.sort}
                onChange={(e) => setFilter('sort', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading products…</p>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-8 h-8 text-red-500" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Failed to load products
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
            <button
              onClick={fetchProducts}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── Empty ─────────────────────────────────────────────────────── */}
        {!loading && !error && displayedProducts.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ShoppingBag className="w-8 h-8 text-gray-400" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No products found
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {hasActiveFilters
                ? 'Try adjusting your search or filters.'
                : 'No products are available right now.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* ── Products grid ─────────────────────────────────────────────── */}
        {!loading && !error && displayedProducts.length > 0 && (
          <>
            {/* Results bar */}
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">{displayedProducts.length}</span>
                {' '}product{displayedProducts.length !== 1 ? 's' : ''}
                {hasActiveFilters && ' found'}
              </p>
              {inCartCount > 0 && (
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  {inCartCount} in cart
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayedProducts.map((item) => {
                const product = normalise(item);
                return (
                  <ProductCard
                    key={product.id}
                    item={item}
                    isInCart={isProductInCart(product.id)}
                  />
                );
              })}
            </div>
          </>
        )}

      </main>
    </div>
  );
}