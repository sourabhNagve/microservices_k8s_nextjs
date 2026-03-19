'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { CheckCircle2, Loader2, Package, CreditCard, ClipboardList, CheckCheck } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import ShippingForm from '@/components/payment/ShippingForm';
import PaymentForm from '@/components/payment/PaymentForm';
import OrderSummary from '@/components/payment/OrderSummary';

// ─── Constants ────────────────────────────────────────────────────────────────
const TAX_RATE                = 0.08;
const FREE_SHIPPING_THRESHOLD = 100;
const STANDARD_SHIPPING       = 9.99;
const EXPRESS_SHIPPING        = 19.99;
const ORDER_API               = process.env.NEXT_PUBLIC_ORDER_SERVICE_URL   || 'http://localhost:3006';
const PAYMENT_API             = process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL || 'http://localhost:3007'; // ✅ added

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toConsistentUUID = (id) => {
  if (!id) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(String(id))) return String(id);
  return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
};

const stripUndefined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

const calcTotals = (cartSummary, shippingMethod) => {
  const subtotal = cartSummary?.totalAmount ?? 0;
  const tax      = subtotal * TAX_RATE;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD
    ? 0
    : shippingMethod === 'express' ? EXPRESS_SHIPPING : STANDARD_SHIPPING;
  return { subtotal, tax, shipping, total: subtotal + tax + shipping };
};

// ─── Step config ──────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, title: 'Shipping', icon: Package },
  { id: 2, title: 'Payment',  icon: CreditCard },
  { id: 3, title: 'Review',   icon: ClipboardList },
  { id: 4, title: 'Done',     icon: CheckCheck },
];

// ─── Progress bar ─────────────────────────────────────────────────────────────
const StepIndicator = ({ currentStep }) => (
  <nav aria-label="Checkout progress" className="mb-8">
    <ol className="flex items-center justify-between">
      {STEPS.map((step, index) => {
        const Icon     = step.icon;
        const isActive = currentStep === step.id;
        const isDone   = currentStep > step.id;
        return (
          <li key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isDone   ? 'bg-green-500 text-white' :
                isActive ? 'bg-blue-600 text-white'  :
                           'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }`}>
                {isDone
                  ? <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                  : <Icon className="w-5 h-5" aria-hidden="true" />}
              </div>
              <span className={`mt-1.5 text-xs font-medium hidden sm:block ${
                isActive ? 'text-blue-600 dark:text-blue-400'  :
                isDone   ? 'text-green-600 dark:text-green-400' :
                           'text-gray-400'
              }`}>
                {step.title}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${
                currentStep > step.id ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'
              }`} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router                          = useRouter();
  const { cart, cartSummary, clearCart } = useCart();
  const { user }                        = useAuth();
  const toast                           = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading,     setLoading]     = useState(false);

  const [orderData, setOrderData] = useState({
    shippingInfo:    {},
    billingInfo:     {},
    paymentMethod:   null,
    shippingMethod:  'standard',
    paymentIntentId: null,  // ✅ added — stores Stripe paymentIntentId after payment step
  });

  useEffect(() => {
    if (!user) {
      router.push('/auth/signin?returnUrl=' + encodeURIComponent('/checkout'));
      return;
    }
    if (cart && cart.length === 0) router.push('/cart');
  }, [user, cart, router]);

  useEffect(() => {
    if (!user) return;
    setOrderData((prev) => ({
      ...prev,
      billingInfo: {
        firstName: user.firstName ?? '',
        lastName:  user.lastName  ?? '',
        email:     user.email     ?? '',
      },
    }));
  }, [user]);

  const totals = useMemo(
    () => calcTotals(cartSummary, orderData.shippingMethod),
    [cartSummary, orderData.shippingMethod]
  );

  const handleShippingSubmit = useCallback((shippingInfo) => {
    setOrderData((prev) => ({ ...prev, shippingInfo }));
    setCurrentStep(2);
  }, []);

  // ✅ stores paymentIntentId from PaymentForm
  const handlePaymentSubmit = useCallback((paymentData) => {
    setOrderData((prev) => ({ ...prev, ...paymentData }));
    setCurrentStep(3);
  }, []);

  // ── Order submission ───────────────────────────────────────────────────────
  const handleOrderSubmit = useCallback(async () => {
    if (!user?.id) {
      toast.error('User session expired. Please sign in again.');
      router.push('/auth/signin');
      return;
    }

    const invalidItem = cart.find((item) => {
      const price = parseFloat(item.product?.price ?? item.price ?? 0);
      return !price || price <= 0;
    });
    if (invalidItem) {
      toast.error(`Invalid price for "${invalidItem.product?.name ?? 'a product'}". Please remove it and try again.`);
      return;
    }

    setLoading(true);

    try {
      // ── Health check ────────────────────────────────────────────────────
      const ac            = new AbortController();
      const healthTimeout = setTimeout(() => ac.abort(), 4000);
      try {
        const health = await fetch(`${ORDER_API}/health`, { signal: ac.signal });
        if (!health.ok) throw new Error();
      } catch {
        throw new Error('Order service is unavailable. Please try again later.');
      } finally {
        clearTimeout(healthTimeout);
      }

      const token = typeof window !== 'undefined'
        ? localStorage.getItem('auth_token')
        : null;

      // ── Build order payload ──────────────────────────────────────────────
      const orderItems = cart.map((item) => {
        const price = parseFloat(item.product?.price ?? item.price ?? 0);
        return {
          productId:   String(item.productId ?? ''),
          productName: item.product?.name ?? item.name ?? 'Product',
          productSku:  item.product?.sku  ?? item.sku  ?? '',
          quantity:    item.quantity,
          unitPrice:   price,
          totalPrice:  price * item.quantity,
        };
      });

      const shippingInfo = stripUndefined({
        firstName:    orderData.shippingInfo?.firstName    ?? '',
        lastName:     orderData.shippingInfo?.lastName     ?? '',
        email:        orderData.shippingInfo?.email        ?? user.email ?? '',
        phone:        orderData.shippingInfo?.phone,
        addressLine1: orderData.shippingInfo?.addressLine1 ?? '',
        addressLine2: orderData.shippingInfo?.addressLine2,
        city:         orderData.shippingInfo?.city         ?? '',
        state:        orderData.shippingInfo?.state        ?? '',
        postalCode:   orderData.shippingInfo?.postalCode   ?? '',
        country:      orderData.shippingInfo?.country      ?? 'US',
      });

      const billingInfo = stripUndefined({
        firstName:    orderData.billingInfo?.firstName,
        lastName:     orderData.billingInfo?.lastName,
        email:        orderData.billingInfo?.email,
        phone:        orderData.billingInfo?.phone,
        addressLine1: orderData.billingInfo?.addressLine1,
        addressLine2: orderData.billingInfo?.addressLine2,
        city:         orderData.billingInfo?.city,
        state:        orderData.billingInfo?.state,
        postalCode:   orderData.billingInfo?.postalCode,
        country:      orderData.billingInfo?.country,
      });

      const payload = {
        userId:         toConsistentUUID(user.id),
        items:          orderItems,
        shippingInfo,
        billingInfo,
        shippingMethod: orderData.shippingMethod ?? 'standard',
      };

      // ── Create order ─────────────────────────────────────────────────────
      const res = await fetch(`${ORDER_API}/api/orders`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errData = {};
        try { errData = await res.json(); } catch { /* ignore */ }
        throw new Error(errData?.error ?? errData?.message ?? `HTTP ${res.status}: Failed to create order`);
      }

      const orderResult = await res.json();
      if (!orderResult?.order) throw new Error('Invalid response from order service.');

      // ── ✅ Record payment in payment service ──────────────────────────────
      if (orderData.paymentIntentId) {
        try {
          const paymentRes = await fetch(`${PAYMENT_API}/api/payments/verify-and-record`, {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              paymentIntentId: orderData.paymentIntentId,
              orderId:         orderResult.order.id,
              userId:          toConsistentUUID(user.id),
              amount:          totals.total,
            }),
          });

          if (paymentRes.ok) {
            console.log('[CheckoutPage] Payment recorded successfully');
          } else {
            console.warn('[CheckoutPage] Payment recording failed — order still created');
          }
        } catch (e) {
          // Non-critical — order is created, payment can be reconciled later
          console.warn('[CheckoutPage] Payment recording error (non-critical):', e);
        }
      }

      // ── Clear cart ───────────────────────────────────────────────────────
      try {
        await clearCart();
      } catch (e) {
        console.warn('[CheckoutPage] Cart clear failed (non-critical):', e);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('lastOrder', JSON.stringify(orderResult.order));
      }

      toast.success('Order placed successfully!');
      setCurrentStep(4);

    } catch (err) {
      console.error('[CheckoutPage] handleOrderSubmit error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, cart, orderData, totals, clearCart, toast, router]);

  // ── Step rendering ─────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Shipping Information</h2>
            <ShippingForm onSubmit={handleShippingSubmit} initialData={orderData.shippingInfo} />
          </div>
        );

      case 2:
        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Payment Method</h2>
            <PaymentForm onSubmit={handlePaymentSubmit} amount={totals.total} />
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              ← Back to Shipping
            </button>
          </div>
        );

      case 3:
        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Review Your Order</h2>
            <OrderSummary
              cart={cart}
              cartSummary={cartSummary}
              shippingInfo={orderData.shippingInfo}
              billingInfo={orderData.billingInfo}
              shippingMethod={orderData.shippingMethod}
            />
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="flex-1 py-3 px-6 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                ← Back to Payment
              </button>
              <button
                type="button"
                onClick={handleOrderSubmit}
                disabled={loading}
                className="flex-1 py-3 px-6 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Processing…</>
                ) : 'Place Order'}
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-8 border border-gray-100 dark:border-gray-800 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Order Confirmed!</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Thank you for your order. A confirmation email is on its way.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => router.push('/orders')}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                View My Orders
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-6 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!user || !cart) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading checkout…</p>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

          <StepIndicator currentStep={currentStep} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">{renderStep()}</div>

            {currentStep < 4 && (
              <div className="lg:col-span-1">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md p-6 border border-gray-100 dark:border-gray-800 sticky top-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Order Summary</h3>
                  <OrderSummary
                    cart={cart}
                    cartSummary={cartSummary}
                    compact
                    shippingInfo={orderData.shippingInfo}
                    shippingMethod={orderData.shippingMethod}
                  />
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Subtotal</span>
                      <span>${totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Shipping</span>
                      <span className={totals.shipping === 0 && totals.subtotal > 0 ? 'text-green-600 dark:text-green-400' : ''}>
                        {totals.subtotal <= 0 ? '—' : totals.shipping === 0 ? 'Free' : `$${totals.shipping.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
                      <span>${totals.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span>Total</span>
                      <span>${totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Elements>
  );
}