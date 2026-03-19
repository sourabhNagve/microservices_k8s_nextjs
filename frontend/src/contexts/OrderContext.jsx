'use client';

import {
  createContext, useContext, useReducer, useCallback, useRef, useMemo,
} from 'react';
import { useToast } from '@/components/Toast';
import { getToken } from '@/lib/auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const ORDER_API   = process.env.NEXT_PUBLIC_ORDER_SERVICE_URL;
const THROTTLE_MS = 5000;
const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toConsistentUUID = (id) => {
  if (!id) return null;
  if (UUID_REGEX.test(String(id))) return String(id);
  return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
};

const apiFetch = async (url, options = {}) => {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  let body;
  try {
    body = await res.json();
  } catch {
    body = { error: res.statusText };
  }

  if (!res.ok) {
    const err = new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return body;
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
const initialState = {
  orders:       [],
  total:        0,
  currentOrder: null,
  loading:      false,
  error:        null,
  orderStats:   null,
};

const ACTIONS = {
  SET_LOADING:       'SET_LOADING',
  SET_ERROR:         'SET_ERROR',
  CLEAR_ERROR:       'CLEAR_ERROR',
  SET_ORDERS:        'SET_ORDERS',
  SET_CURRENT_ORDER: 'SET_CURRENT_ORDER',
  ADD_ORDER:         'ADD_ORDER',
  UPDATE_ORDER:      'UPDATE_ORDER',
  SET_ORDER_STATS:   'SET_ORDER_STATS',
};

const orderReducer = (state, { type, payload }) => {
  switch (type) {
    case ACTIONS.SET_LOADING:
      return { ...state, loading: payload };

    case ACTIONS.SET_ERROR:
      return { ...state, error: payload, loading: false };

    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };

    case ACTIONS.SET_ORDERS:
      return {
        ...state,
        orders:  payload.orders,
        total:   payload.total,
        loading: false,
        error:   null,
      };

    case ACTIONS.SET_CURRENT_ORDER:
      return { ...state, currentOrder: payload, loading: false, error: null };

    case ACTIONS.ADD_ORDER:
      return {
        ...state,
        orders:  [payload, ...state.orders],
        total:   state.total + 1,
        loading: false,
        error:   null,
      };

    case ACTIONS.UPDATE_ORDER:
      return {
        ...state,
        loading:      false,
        error:        null,
        orders:       state.orders.map((o) => (o.id === payload.id ? payload : o)),
        currentOrder: state.currentOrder?.id === payload.id ? payload : state.currentOrder,
      };

    case ACTIONS.SET_ORDER_STATS:
      return { ...state, orderStats: payload, loading: false, error: null };

    default:
      return state;
  }
};

// ─── Context ──────────────────────────────────────────────────────────────────
const OrderContext = createContext(null);

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrder must be used within an OrderProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function OrderProvider({ children }) {
  const [state, dispatch] = useReducer(orderReducer, initialState);
  const toast = useToast();
  const throttleCache = useRef(new Map());

  const isThrottled = useCallback((key) => {
    const cache = throttleCache.current;
    const now   = Date.now();
    for (const [k, ts] of cache.entries()) {
      if (now - ts > THROTTLE_MS * 2) cache.delete(k);
    }
    const last = cache.get(key);
    if (last && now - last < THROTTLE_MS) return true;
    cache.set(key, now);
    return false;
  }, []);

  const fetchOrders = useCallback(async (userId, page = 1, limit = 20, status = null) => {
    const uid = toConsistentUUID(userId);
    if (!uid) {
      dispatch({ type: ACTIONS.SET_ORDERS, payload: { orders: [], total: 0 } });
      return;
    }

    const key = `orders-${uid}-${page}-${limit}-${status ?? 'all'}`;
    if (isThrottled(key)) return;

    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(limit), ...(status ? { status } : {}),
      });
      const data = await apiFetch(`${ORDER_API}/api/orders/user/${uid}?${params}`);
      dispatch({
        type:    ACTIONS.SET_ORDERS,
        payload: {
          orders: data.orders ?? [],
          total:  data.total ?? data.orders?.length ?? 0,
        },
      });
    } catch (err) {
      console.error('[OrderContext] fetchOrders:', err);
      if (err.status === 429) {
        toast.error('Too many requests. Please wait a moment.');
        dispatch({ type: ACTIONS.SET_LOADING, payload: false });
        return;
      }
      if (err.status === 422 || err.message?.includes('Validation')) {
        dispatch({ type: ACTIONS.SET_ORDERS, payload: { orders: [], total: 0 } });
        return;
      }
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    }
  }, [isThrottled, toast]);

  // ✅ fixed — added /api/orders/
  const fetchOrder = useCallback(async (orderId) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await apiFetch(`${ORDER_API}/api/orders/${orderId}`);
      dispatch({ type: ACTIONS.SET_CURRENT_ORDER, payload: data.order });
    } catch (err) {
      console.error('[OrderContext] fetchOrder:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    }
  }, [toast]);

  // ✅ fixed — added /api/orders
  const createOrder = useCallback(async (orderData) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await apiFetch(`${ORDER_API}/api/orders`, {
        method: 'POST',
        body:   JSON.stringify(orderData),
      });
      dispatch({ type: ACTIONS.ADD_ORDER, payload: data.order });
      toast.success('Order created successfully!');
      return { success: true, order: data.order };
    } catch (err) {
      console.error('[OrderContext] createOrder:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
      return { success: false, error: err.message };
    }
  }, [toast]);

  // ✅ fixed — added /api/orders/
  const updateOrderStatus = useCallback(async (orderId, status, notes = null) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await apiFetch(`${ORDER_API}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ status, ...(notes ? { notes } : {}) }),
      });
      dispatch({ type: ACTIONS.UPDATE_ORDER, payload: data.order });
      toast.success('Order status updated!');
      return { success: true };
    } catch (err) {
      console.error('[OrderContext] updateOrderStatus:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
      return { success: false, error: err.message };
    }
  }, [toast]);

  // ✅ fixed — added /api/orders/
  const cancelOrder = useCallback(async (orderId, reason = null) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await apiFetch(`${ORDER_API}/api/orders/${orderId}/cancel`, {
        method: 'PATCH',
        body:   JSON.stringify({ ...(reason ? { reason } : {}) }),
      });
      dispatch({ type: ACTIONS.UPDATE_ORDER, payload: data.order });
      toast.success('Order cancelled.');
      return { success: true };
    } catch (err) {
      console.error('[OrderContext] cancelOrder:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
      return { success: false, error: err.message };
    }
  }, [toast]);

  // ✅ fixed — added /api/orders/
  const addTracking = useCallback(async (orderId, trackingNumber, carrier, estimatedDelivery) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const data = await apiFetch(`${ORDER_API}/api/orders/${orderId}/tracking`, {
        method: 'POST',
        body:   JSON.stringify({ trackingNumber, carrier, estimatedDelivery }),
      });
      dispatch({ type: ACTIONS.UPDATE_ORDER, payload: data.order });
      toast.success('Tracking information added!');
      return { success: true };
    } catch (err) {
      console.error('[OrderContext] addTracking:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
      return { success: false, error: err.message };
    }
  }, [toast]);

  const fetchOrderStats = useCallback(async (userId, startDate = null, endDate = null) => {
    const uid = toConsistentUUID(userId);
    if (!uid) return;

    dispatch({ type: ACTIONS.SET_LOADING, payload: true });
    try {
      const params = new URLSearchParams({
        ...(startDate ? { startDate } : {}),
        ...(endDate   ? { endDate }   : {}),
      });
      const data = await apiFetch(`${ORDER_API}/api/orders/user/${uid}/stats?${params}`);
      dispatch({ type: ACTIONS.SET_ORDER_STATS, payload: data.stats });
    } catch (err) {
      console.error('[OrderContext] fetchOrderStats:', err);
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      toast.error(err.message);
    }
  }, [toast]);

  const clearError = useCallback(() => dispatch({ type: ACTIONS.CLEAR_ERROR }), []);

  const value = useMemo(() => ({
    orders:       state.orders,
    total:        state.total,
    currentOrder: state.currentOrder,
    loading:      state.loading,
    error:        state.error,
    orderStats:   state.orderStats,
    fetchOrders, fetchOrder, createOrder,
    updateOrderStatus, cancelOrder, addTracking,
    fetchOrderStats, clearError,
  }), [
    state,
    fetchOrders, fetchOrder, createOrder,
    updateOrderStatus, cancelOrder, addTracking,
    fetchOrderStats, clearError,
  ]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export default OrderContext;