'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { useToast } from '@/components/Toast';

const ORDER_API = process.env.NEXT_PUBLIC_ORDER_SERVICE_URL || 'http://localhost:3006';

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

const STATUS_COLORS = {
  pending:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  shipped:    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  delivered:  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled:  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function AdminOrderDetailPage() {
  const { id }    = useParams();
  const router    = useRouter();
  const toast     = useToast();

  const [order,          setOrder]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [newStatus,      setNewStatus]      = useState('');
  const [notes,          setNotes]          = useState('');
  const [updating,       setUpdating]       = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res   = await fetch(`${ORDER_API}/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrder(data.order);
      setNewStatus(data.order.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleStatusUpdate = async () => {
    if (newStatus === order.status) {
      toast.error('Status is already ' + newStatus);
      return;
    }
    setUpdating(true);
    try {
      const token = getToken();
      const res   = await fetch(`${ORDER_API}/api/orders/${id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: newStatus, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrder(data.order);
      toast.success(`Order status updated to ${newStatus}`);
      setNotes('');
    } catch (err) {
      toast.error(err.message ?? 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  );

  if (error || !order) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertCircle className="w-10 h-10 text-red-500" />
      <p className="text-gray-600 dark:text-gray-400">{error ?? 'Order not found'}</p>
      <Link href="/admin/orders" className="text-blue-600 hover:underline text-sm">← Back to Orders</Link>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/orders" className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Order #{order.order_number ?? order.id?.slice(0, 8)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Placed {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`ml-auto inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[order.status]}`}>
          {order.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Order items */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Order Items</h2>
            <div className="space-y-3">
              {order.items?.map((item, i) => (
                <div key={item.id ?? i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.product_name}</p>
                    <p className="text-xs text-gray-500">Qty {item.quantity} × ${Number(item.unit_price).toFixed(2)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    ${Number(item.total_price).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between font-bold text-gray-900 dark:text-white">
              <span>Total</span>
              <span>${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>

          {/* Shipping info */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Shipping Address</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p className="font-medium text-gray-900 dark:text-white">{order.shipping_first_name} {order.shipping_last_name}</p>
              <p>{order.shipping_address_line1}</p>
              {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
              <p>{order.shipping_city}, {order.shipping_state} {order.shipping_postal_code}</p>
              <p>{order.shipping_country}</p>
              {order.shipping_email && <p className="mt-2">{order.shipping_email}</p>}
              {order.shipping_phone  && <p>{order.shipping_phone}</p>}
            </div>
          </div>
        </div>

        {/* Update status */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Update Status</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Add a note about this status change…"
                />
              </div>
              <button
                onClick={handleStatusUpdate}
                disabled={updating || newStatus === order.status}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {updating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                  : <><CheckCircle2 className="w-4 h-4" /> Update Status</>}
              </button>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Summary</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Subtotal',  value: `$${Number(order.subtotal ?? 0).toFixed(2)}` },
                { label: 'Tax',       value: `$${Number(order.tax_amount ?? 0).toFixed(2)}` },
                { label: 'Shipping',  value: `$${Number(order.shipping_cost ?? 0).toFixed(2)}` },
                { label: 'Total',     value: `$${Number(order.total_amount).toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>{label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}