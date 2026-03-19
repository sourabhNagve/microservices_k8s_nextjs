'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrder } from '@/contexts/OrderContext';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import {
  Clock, Loader2, Truck, CheckCircle2, XCircle, RefreshCw,
  AlertCircle, Package, ChevronRight, ArrowLeft, HeadphonesIcon,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = {
  date:     (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
  currency: (n) => n != null ? `$${Number(n).toFixed(2)}` : '—',
  title:    (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '',
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS = {
  pending:    { icon: Clock,        color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950',  badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  processing: { icon: Loader2,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950',      badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',      spin: true },
  shipped:    { icon: Truck,        color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  delivered:  { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-950',    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  cancelled:  { icon: XCircle,      color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950',        badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  refunded:   { icon: RefreshCw,    color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-100 dark:bg-gray-800',     badge: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
};
const getStatus = (s) => STATUS[s] ?? STATUS.pending;

// ─── Reusable card wrapper ────────────────────────────────────────────────────
const Card = ({ title, children, className = '' }) => (
  <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 ${className}`}>
    {title && (
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
    )}
    {children}
  </div>
);

// ─── Full-page states ─────────────────────────────────────────────────────────
const FullPageState = ({ icon: Icon, iconClass, title, message, action }) => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
    <div className="text-center max-w-sm">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${iconClass}`}>
        <Icon className="w-8 h-8" aria-hidden="true" />
      </div>
      {title && <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>}
      <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>
      {action}
    </div>
  </div>
);

// ─── Cancel modal ─────────────────────────────────────────────────────────────
const CancelModal = ({ onConfirm, onClose, loading }) => {
  const [reason,   setReason]   = useState('');
  const [touched,  setTouched]  = useState(false); // ✅ track if user has interacted

  const handleConfirm = () => {
    setTouched(true);  // ✅ mark as touched so error shows on submit attempt
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700">
        <h3 id="cancel-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Cancel Order
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          This action cannot be undone. Please tell us why you'd like to cancel.
        </p>

        <div className="mb-5">
          <label htmlFor="cancelReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="cancelReason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setTouched(true); // ✅ mark touched on first keystroke
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
            placeholder="Please let us know why you're cancelling…"
          />
          {/* ✅ only show error after user has interacted */}
          {touched && !reason.trim() && (
            <p className="mt-1 text-xs text-red-500">A reason is required.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Keep Order
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}  // ✅ only disable when loading — let handleConfirm handle validation
            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Cancelling…</>
              : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrderDetailPage() {
  // ✅ also get authLoading to avoid premature redirect
  const { user, loading: authLoading }                              = useAuth();
  const { currentOrder, loading, error, fetchOrder, cancelOrder }  = useOrder();
  const params                                                      = useParams();
  const router                                                      = useRouter();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading,   setCancelLoading]   = useState(false);

  // ✅ wait for authLoading to finish before redirecting
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/signin?returnUrl=' + encodeURIComponent(`/orders/${params.id}`));
    }
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (params.id && user) fetchOrder(params.id);
  }, [params.id, user, fetchOrder]);

  const handleCancelOrder = useCallback(async (reason) => {
    setCancelLoading(true);
    try {
      const result = await cancelOrder(params.id, reason);
      if (result.success) setShowCancelModal(false);
    } finally {
      setCancelLoading(false);
    }
  }, [cancelOrder, params.id]);

  // ── Guards ─────────────────────────────────────────────────────────────────
  // ✅ show loading while auth is still resolving
  if (authLoading || loading) {
    return (
      <FullPageState
        icon={Loader2}
        iconClass="bg-blue-50 dark:bg-blue-950 text-blue-500 animate-spin"
        message={authLoading ? 'Checking authentication…' : 'Loading order details…'}
      />
    );
  }

  if (error) {
    return (
      <FullPageState
        icon={AlertCircle}
        iconClass="bg-red-100 dark:bg-red-950 text-red-500"
        title="Error Loading Order"
        message={error}
        action={
          <button
            onClick={() => fetchOrder(params.id)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try Again
          </button>
        }
      />
    );
  }

  if (!currentOrder) {
    return (
      <FullPageState
        icon={Package}
        iconClass="bg-gray-100 dark:bg-gray-800 text-gray-400"
        title="Order Not Found"
        message="This order doesn't exist or you don't have permission to view it."
        action={
          <Link
            href="/orders"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            View All Orders
          </Link>
        }
      />
    );
  }

  const status     = getStatus(currentOrder.status);
  const StatusIcon = status.icon;
  const canCancel  = currentOrder.status === 'pending';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex items-center gap-2 text-sm">
            <li>
              <Link href="/orders" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Orders
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </li>
            <li className="text-gray-900 dark:text-white font-medium" aria-current="page">
              Order #{currentOrder.orderNumber ?? currentOrder.id?.slice(0, 8)}
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Status card */}
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${status.bg} flex items-center justify-center`}>
                    <StatusIcon
                      className={`w-5 h-5 ${status.color} ${status.spin ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${status.badge}`}>
                      {fmt.title(currentOrder.status)}
                    </span>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Placed {fmt.date(currentOrder.created_at)}
                      {currentOrder.updated_at && ` · Updated ${fmt.date(currentOrder.updated_at)}`}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    >
                      Cancel Order
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push('/support')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <HeadphonesIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    Support
                  </button>
                </div>
              </div>
            </Card>

            {/* Order items */}
            <Card title="Order Items">
              <div className="space-y-4">
                {currentOrder.items?.map((item, index) => (
                  <div
                    key={item.id ?? index}
                    className="flex gap-4 pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0"
                  >
                    <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0 overflow-hidden">
                      {item.productImage
                        ? <img src={item.productImage} alt={item.productName} className="w-full h-full object-cover" />
                        : <Package className="w-6 h-6 text-gray-400 m-auto mt-5" aria-hidden="true" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {item.productName}
                      </h3>
                      {item.productSku && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">SKU: {item.productSku}</p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {fmt.currency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white flex-shrink-0">
                      {fmt.currency(item.totalPrice)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-5">

            <Card title="Order Summary">
              <div className="space-y-2.5 text-sm">
                {[
                  { label: 'Subtotal', value: fmt.currency(currentOrder.subtotal) },
                  { label: 'Tax',      value: fmt.currency(currentOrder.tax_amount) },
                  { label: 'Shipping', value: fmt.currency(currentOrder.shipping_cost) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{label}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{value}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white">Total</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {fmt.currency(currentOrder.total_amount)}
                  </span>
                </div>
              </div>
            </Card>

            <Card title="Shipping">
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {currentOrder.shipping_first_name} {currentOrder.shipping_last_name}
                </p>
                <p>{currentOrder.shipping_address_line1}</p>
                {currentOrder.shipping_address_line2 && <p>{currentOrder.shipping_address_line2}</p>}
                <p>{currentOrder.shipping_city}, {currentOrder.shipping_state} {currentOrder.shipping_postal_code}</p>
                <p>{currentOrder.shipping_country}</p>
                {currentOrder.shipping_email && <p className="mt-2">{currentOrder.shipping_email}</p>}
                {currentOrder.shipping_phone  && <p>{currentOrder.shipping_phone}</p>}
                {currentOrder.shipping_method && (
                  <p className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 capitalize font-medium text-gray-900 dark:text-white">
                    {currentOrder.shipping_method} shipping
                  </p>
                )}
              </div>
            </Card>

            {(currentOrder.tracking_number || currentOrder.carrier) && (
              <Card title="Tracking">
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  {currentOrder.carrier && (
                    <div className="flex justify-between">
                      <span>Carrier</span>
                      <span className="font-medium text-gray-900 dark:text-white">{currentOrder.carrier}</span>
                    </div>
                  )}
                  {currentOrder.tracking_number && (
                    <div className="flex justify-between">
                      <span>Tracking #</span>
                      <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                        {currentOrder.tracking_number}
                      </span>
                    </div>
                  )}
                  {currentOrder.estimated_delivery_date && (
                    <div className="flex justify-between">
                      <span>Est. Delivery</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {fmt.date(currentOrder.estimated_delivery_date)}
                      </span>
                    </div>
                  )}
                  {currentOrder.actual_delivery_date && (
                    <div className="flex justify-between">
                      <span>Delivered</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {fmt.date(currentOrder.actual_delivery_date)}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            )}

          </div>
        </div>
      </div>

      {showCancelModal && (
        <CancelModal
          onConfirm={handleCancelOrder}
          onClose={() => setShowCancelModal(false)}
          loading={cancelLoading}
        />
      )}
    </div>
  );
}