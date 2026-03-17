'use client';

import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getToken } from '@/lib/auth';  // ✅ reads correct 'auth_token' key
import { useAuth } from '@/components/AuthProvider'; // ✅ get real user name

// ✅ outside component — defined once, never recreated on render
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': { color: '#aab7c4' },
    },
    invalid: { color: '#9e2146' },
  },
  hidePostalCode: true,
};

// ✅ env var instead of hardcoded URL
const PAYMENT_API = process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL;

export default function PaymentForm({ onSubmit, amount = 0 }) {
  const stripe   = useStripe();
  const elements = useElements();

  const [loading,             setLoading]             = useState(false);
  const [error,               setError]               = useState(null);
  const [savePaymentMethod,   setSavePaymentMethod]   = useState(false);
  const [paymentMethod,       setPaymentMethod]       = useState('card');

  // ✅ real user name for billing details
  const { user } = useAuth();
  const billingName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || 'Customer'
    : 'Customer';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!stripe || !elements) {
      setError('Payment system not loaded. Please refresh the page.');
      setLoading(false);
      return;
    }

    try {
      const amountInCents = Math.round(amount * 100);

      const response = await fetch(`${PAYMENT_API}/payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ✅ getToken() reads 'auth_token' — correct key
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ amount: amountInCents, currency: 'usd', savePaymentMethod }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? errorData.message ?? 'Failed to create payment intent');
      }

      const { clientSecret } = await response.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setError('Card element not found. Please refresh the page.');
        setLoading(false);
        return;
      }

      const { error: paymentError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name:  billingName,   // ✅ real user name
            email: user?.email,
          },
        },
        setup_future_usage: savePaymentMethod ? 'off_session' : undefined,
      });

      if (paymentError) {
        setError(paymentError.message);
      } else {
        onSubmit({
          paymentMethod:   'card',
          savePaymentMethod,
          paymentIntentId: paymentIntent.id,
        });
      }
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Payment Method Selection */}
      <div>
        <h3 className="text-lg font-medium mb-4">Payment Method</h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input type="radio" name="paymentMethod" value="card"
              checked={paymentMethod === 'card'}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mr-3"
            />
            <span className="text-gray-700 dark:text-gray-300">Credit/Debit Card</span>
          </label>
          <label className="flex items-center">
            <input type="radio" name="paymentMethod" value="paypal"
              checked={paymentMethod === 'paypal'}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mr-3" disabled
            />
            <span className="text-gray-500">PayPal (Coming Soon)</span>
          </label>
        </div>
      </div>

      {/* Card Element */}
      {paymentMethod === 'card' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium mb-4">Card Information</h3>
          {!stripe || !elements ? (
            <div className="bg-white p-4 rounded-lg border border-gray-300 flex items-center justify-center py-8 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="text-gray-600">Loading payment form...</span>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-lg border border-gray-300">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Card Information
              </label>
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white dark:bg-gray-800">
                <CardElement options={CARD_ELEMENT_OPTIONS} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Payment Method */}
      <label className="flex items-center">
        <input type="checkbox" checked={savePaymentMethod}
          onChange={(e) => setSavePaymentMethod(e.target.checked)}
          className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Save payment method for future purchases
        </span>
      </label>

      {/* Error */}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !stripe || !elements}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-3">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            Processing...
          </span>
        ) : `Pay $${amount.toFixed(2)}`}
      </button>

      {/* Security Notice */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-start gap-3">
        <svg className="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium text-gray-900 dark:text-white mb-1">Secure Payment</p>
          <p>Your payment information is encrypted and secure. We never store your card details.</p>
        </div>
      </div>
    </form>
  );
}