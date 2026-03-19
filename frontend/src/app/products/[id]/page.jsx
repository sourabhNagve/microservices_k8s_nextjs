'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, ShoppingBag, Package, AlertCircle,
  CheckCircle2, XCircle, Loader2, Menu, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import AddToCartButton from '@/components/AddToCartButton';

// ─── Constants ────────────────────────────────────────────────────────────────
// ✅ env vars instead of hardcoded URLs
const PRODUCT_API   = `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/api/products`;
const INVENTORY_API = `${process.env.NEXT_PUBLIC_INVENTORY_SERVICE_URL}/api/inventory/product`;
const MAX_QTY       = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = {
  price: (n) => `$${Number(n ?? 0).toFixed(2)}`,
};

// ─── Nav links ────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: '/',         label: 'Home' },
  { href: '/products', label: 'Products' },
  { href: '/cart',     label: 'Cart' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const SpecRow = ({ label, value, valueClass = '' }) => (
  <div className="flex justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
    <span className={`text-sm font-medium text-gray-900 dark:text-white ${valueClass}`}>
      {value ?? '—'}
    </span>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const router    = useRouter();
  const params    = useParams();
  const productId = params?.id;

  const [product,        setProduct]        = useState(null);
  const [inventory,      setInventory]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [quantity,       setQuantity]       = useState(1);
  const [activeImage,    setActiveImage]    = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { isProductInCart, getCartItemQuantity } = useCart();

  // ── Fetch product + inventory in parallel ─────────────────────────────────
  const loadData = useCallback(async () => {
    if (!productId) return;

    setLoading(true);
    setError(null);
    setQuantity(1);      // ✅ reset quantity when product changes
    setActiveImage(0);   // ✅ reset image index when product changes

    const [productRes, inventoryRes] = await Promise.allSettled([
      fetch(`${PRODUCT_API}/${productId}`),
      fetch(`${INVENTORY_API}/${productId}`),
    ]);

    // ── Product ──
    if (productRes.status === 'fulfilled' && productRes.value.ok) {
      try {
        const data = await productRes.value.json();
        const p = data.product ?? (data.id ? data : null);
        if (p) setProduct(p);
        else setError('Product not found.');
      } catch {
        setError('Failed to parse product data.');
      }
    } else {
      // ✅ fulfilled but not ok → use .value.status
      // ✅ rejected → use .reason, not .value (which doesn't exist on rejected)
      if (productRes.status === 'rejected') {
        setError('Failed to load product. Please check your connection.');
      } else {
        const status = productRes.value?.status;
        setError(status === 404 ? 'Product not found.' : 'Failed to load product.');
      }
    }

    // ── Inventory — non-critical, failures are silent ──
    if (inventoryRes.status === 'fulfilled' && inventoryRes.value.ok) {
      try {
        const data = await inventoryRes.value.json();
        setInventory(data.inventory ?? []);
      } catch {
        // inventory is display-only — don't block the page
      }
    }

    setLoading(false);
  }, [productId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stock calculations ────────────────────────────────────────────────────
  const totalStock     = inventory.reduce((s, i) => s + (i.quantity  ?? 0), 0);
  const reservedStock  = inventory.reduce((s, i) => s + (i.reserved  ?? 0), 0);
  const availableStock = inventory.reduce((s, i) => s + ((i.quantity ?? 0) - (i.reserved ?? 0)), 0);
  const isInStock      = availableStock > 0;

  // ✅ if inventory hasn't loaded yet, fall back to MAX_QTY so button isn't
  // permanently disabled while inventory is still fetching
  const maxQuantity = inventory.length > 0
    ? Math.min(availableStock, MAX_QTY)
    : MAX_QTY;

  const stockPct = totalStock > 0
    ? Math.min(100, Math.round((availableStock / totalStock) * 100))
    : 0;

  const stockBarColor =
    stockPct > 50 ? 'bg-green-500' :
    stockPct > 20 ? 'bg-yellow-500' :
                    'bg-red-500';

  const inCart      = product ? isProductInCart(product.id) : false;
  const cartQty     = product ? getCartItemQuantity(product.id) : 0;
  const images      = product?.images ?? [];
  const hasMultiple = images.length > 1;

  const changeImage = (dir) =>
    setActiveImage((prev) => (prev + dir + images.length) % images.length);

  // ── Loading / Error screens ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading product…</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-red-500" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {error ?? 'Product not found'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            The product you're looking for may have been removed or doesn't exist.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Go Back
            </button>
            <Link
              href="/products"
              className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              All Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="font-bold text-lg text-gray-900 dark:text-white tracking-tight">
              MicroStore
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
              <button
                className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Back link */}
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Products
        </Link>

        {/* ── Main card ────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex flex-col md:flex-row">

            {/* Image panel */}
            <div className="md:w-1/2 bg-gray-50 dark:bg-gray-950 p-6 flex flex-col gap-4">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                {images.length > 0 ? (
                  <Image
                    src={images[activeImage]}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <Package className="w-16 h-16" aria-hidden="true" />
                  </div>
                )}

                {hasMultiple && (
                  <>
                    <button
                      onClick={() => changeImage(-1)}
                      aria-label="Previous image"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 dark:bg-gray-900/80 rounded-full flex items-center justify-center shadow hover:bg-white dark:hover:bg-gray-900 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => changeImage(1)}
                      aria-label="Next image"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 dark:bg-gray-900/80 rounded-full flex items-center justify-center shadow hover:bg-white dark:hover:bg-gray-900 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>

              {hasMultiple && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      aria-label={`View image ${i + 1}`}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors ${
                        activeImage === i
                          ? 'border-blue-500'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                      }`}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info panel */}
            <div className="md:w-1/2 p-6 sm:p-8 flex flex-col">
              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  {product.name}
                </h1>

                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {fmt.price(product.price)}
                  </span>
                  {product.originalPrice && (
                    <span className="text-lg text-gray-400 line-through">
                      {fmt.price(product.originalPrice)}
                    </span>
                  )}
                  {product.originalPrice && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      {Math.round((1 - product.price / product.originalPrice) * 100)}% off
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  {product.sku && (
                    <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
                      SKU: {product.sku}
                    </span>
                  )}
                  {product.category && (
                    <span className="px-2.5 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
                      {product.category}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                  {product.description ?? 'No description available for this product.'}
                </p>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                {inCart && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-4">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    Already in cart ({cartQty} {cartQty === 1 ? 'item' : 'items'})
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1 || !isInStock}
                      aria-label="Decrease quantity"
                      className="w-10 h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                      disabled={quantity >= maxQuantity || !isInStock}
                      aria-label="Increase quantity"
                      className="w-10 h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <AddToCartButton
                    productId={product.id}
                    quantity={quantity}
                    disabled={!isInStock}
                    className="flex-1 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  />
                </div>

                <p className={`text-xs ${isInStock ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {isInStock
                    ? `✓ ${availableStock} unit${availableStock !== 1 ? 's' : ''} available`
                    : '⚠ Currently out of stock'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom panels ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Product Details</h2>
            <div>
              <SpecRow label="Product ID" value={product.id} />
              <SpecRow label="SKU"        value={product.sku} />
              <SpecRow label="Category"   value={product.category} />
              <SpecRow
                label="Status"
                value={product.status === 'active' || product.active ? 'Active' : 'Inactive'}
                valueClass={
                  product.status === 'active' || product.active
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              />
              <SpecRow
                label="Weight"
                value={product.weight != null ? `${product.weight} lbs` : null}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Stock Information</h2>
            <div>
              <SpecRow label="Total Stock"        value={`${totalStock} units`} />
              <SpecRow
                label="Available"
                value={`${availableStock} units`}
                valueClass={availableStock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
              />
              <SpecRow label="Reserved"           value={`${reservedStock} units`} />
              <SpecRow
                label="Warehouse Locations"
                value={`${inventory.length} location${inventory.length !== 1 ? 's' : ''}`}
              />
            </div>

            <div className="mt-5">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Stock Level</span>
                <span className="font-medium text-gray-900 dark:text-white">{stockPct}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${stockBarColor}`}
                  style={{ width: `${stockPct}%` }}
                  role="progressbar"
                  aria-valuenow={stockPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Stock level"
                />
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}