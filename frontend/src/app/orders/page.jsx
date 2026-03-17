'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package, Clock, Loader2, RefreshCw, ShoppingBag,
  CheckCircle2, XCircle, Truck, RotateCcw, ChevronLeft,
  ChevronRight, AlertCircle,
} from 'lucide-react';
import { useOrder } from '@/contexts/OrderContext';
import { useAuth } from '@/components/AuthProvider';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:    { label: 'Pending',    icon: Clock,         color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950' },
  processing: { label: 'Processing', icon: Loader2,       color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950',    spin: true },
  shipped:    { label: 'Shipped',    icon: Truck,         color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950' },
  delivered:  { label: 'Delivered',  icon: CheckCircle2,  color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-950' },
  cancelled:  { label: 'Cancelled',  icon: XCircle,       color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950' },
  refunded:   { label: 'Refunded',   icon: RotateCcw,     color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-800' },
};
const DEFAULT_STATUS = STATUS_CONFIG.pending;

const StatusBadge = ({ status }) => {
  const cfg  = STATUS_CONFIG[status] ?? DEFAULT_STATUS;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${cfg.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = {
  date:  (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
  price: (n) => `$${Number(n ?? 0).toFixed(2)}`,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { orders, loading, error, fetchOrders, cancelOrder, clearError } = useOrder();
  const router = useRouter();

  const [filters, setFilters] = useState({ status: '', page: 1, limit: 10 });
  const [cancellingId, setCancellingId] = useState(null);

  // ── Auth redirect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin?returnUrl=' + encodeURIComponent('/orders'));
    }
  }, [authLoading, user, router]);

  // ── Fetch on filter / user change ────────────────────────────────────────
  // fetchOrders already throttles internally (OrderContext) — no need to
  // duplicate throttle logic here with window._ordersPageCache
  useEffect(() => {
    if (!user?.id) return;
    fetchOrders(user.id, filters.page, filters.limit, filters.status || null);
  }, [user?.id, filters.page, filters.limit, filters.status, fetchOrders]);

  // Reset to page 1 when status or limit changes
  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]:  value,
      // Reset page when changing status or limit — not when changing page itself
      ...(key !== 'page' ? { page: 1 } : {}),
    }));
  }, []);

  // ── Cancel handler ───────────────────────────────────────────────────────
  const handleCancel = useCallback(async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancellingId(orderId);
    try {
      await cancelOrder(orderId);
    } finally {
      setCancellingId(null);
    }
  }, [cancelOrder]);

  // ── Pagination — derived from server total if available, else local ───────
  // The server should return total count; fall back to local length
  const totalPages = Math.max(1, Math.ceil((orders._total ?? orders.length) / filters.limit));
  const hasNext    = filters.page < totalPages;
  const hasPrev    = filters.page > 1;

  // ── Guards ───────────────────────────────────────────────────────────────
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Your Orders
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track and manage your purchases
          </p>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="status-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Status
              </label>
              <select
                id="status-filter"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Orders</option>
                {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="sm:w-40">
              <label htmlFor="limit-filter" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Per page
              </label>
              <select
                id="limit-filter"
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl mb-6"
          >
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="text-sm flex-1">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" aria-hidden="true" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading orders…</span>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!loading && orders.length === 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <ShoppingBag className="w-8 h-8 text-gray-400" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No orders found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {filters.status
                ? `No ${STATUS_CONFIG[filters.status]?.label.toLowerCase() ?? filters.status} orders yet.`
                : "You haven't placed any orders yet."}
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        )}

        {/* ── Orders list ───────────────────────────────────────────────── */}
        {!loading && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
              >
                <div className="p-5 sm:p-6">

                  {/* Order header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Order #{order.orderNumber ?? order.id?.slice(0, 8)}
                      </h3>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Placed {fmt.date(order.created_at ?? order.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  {/* Items preview — max 3, then "+N more" */}
                  <div className="space-y-3 mb-5">
                    {(order.items ?? []).slice(0, 3).map((item, i) => (
                      <div key={item.id ?? i} className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0 overflow-hidden">
                          {item.productImage
                            ? <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                            : <Package className="w-5 h-5 text-gray-400 m-auto mt-3" aria-hidden="true" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {item.productName ?? 'Product'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Qty {item.quantity} × {fmt.price(item.unitPrice)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {fmt.price(item.totalPrice)}
                        </span>
                      </div>
                    ))}
                    {(order.items?.length ?? 0) > 3 && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 pl-14">
                        +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  {/* Order footer */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm text-gray-900 dark:text-white font-semibold">
                        Total: {fmt.price(order.total_amount ?? order.totalAmount)}
                      </p>
                      {order.tracking_number && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tracking: <span className="font-medium">{order.tracking_number}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/orders/${order.id}`}
                        className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        View Details
                      </Link>

                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          disabled={cancellingId === order.id}
                          className="px-4 py-2 text-sm font-medium rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {cancellingId === order.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Cancelling…</>
                            : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-5 py-4 mt-6 flex items-center justify-between">
            <button
              onClick={() => handleFilterChange('page', filters.page - 1)}
              disabled={!hasPrev}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous
            </button>

            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page <span className="font-medium text-gray-900 dark:text-white">{filters.page}</span> of{' '}
              <span className="font-medium text-gray-900 dark:text-white">{totalPages}</span>
            </span>

            <button
              onClick={() => handleFilterChange('page', filters.page + 1)}
              disabled={!hasNext}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}