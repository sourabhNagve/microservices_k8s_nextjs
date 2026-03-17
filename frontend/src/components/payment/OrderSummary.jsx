'use client';

// ─── Constants ────────────────────────────────────────────────────────────────
const TAX_RATE               = 0.08;
const FREE_SHIPPING_THRESHOLD = 100;
const STANDARD_SHIPPING       = 9.99;
const EXPRESS_SHIPPING        = 19.99;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely resolve price from any cart item shape */
const getItemPrice = (item) =>
  parseFloat(item.product?.price ?? item.price ?? 0);

const getItemKey = (item, index) => {
  // ✅ prefer a stable compound key, fall back to index only as last resort
  const id = item.productId ?? item.product?.id ?? item.id;
  return id != null ? `${id}-${index}` : `cart-item-${index}`;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function OrderSummary({
  cart = [],
  cartSummary = {},
  shippingInfo = {},
  billingInfo = {},
  shippingMethod = 'standard',
  compact = false,
}) {
  // ✅ ?? instead of || so a legitimate 0 isn't replaced
  const subtotal = cartSummary.totalAmount ?? 0;
  const taxAmount = subtotal * TAX_RATE;

  const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal <= 0
    ? 0
    : shippingMethod === 'express' ? EXPRESS_SHIPPING : STANDARD_SHIPPING;

  const totalAmount = subtotal + taxAmount + shippingCost;

  // ── Compact variant ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
          <span className="font-medium">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Shipping</span>
          <span className="font-medium">
            {shippingCost === 0 ? 'FREE' : `$${shippingCost.toFixed(2)}`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Tax</span>
          <span className="font-medium">${taxAmount.toFixed(2)}</span>
        </div>
        <div className="border-t pt-3">
          <div className="flex justify-between">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-lg font-bold text-blue-600">${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Full variant ───────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Order Summary</h3>

      {/* Cart Items */}
      <div className="space-y-4 mb-6">
        {cart.map((item, index) => {
          // ✅ resolve price from product object, not bare item.price
          const price     = getItemPrice(item);
          const lineTotal = (price * item.quantity).toFixed(2);

          return (
            <div
              key={getItemKey(item, index)}
              className="flex items-center space-x-4 pb-4 border-b last:border-b-0"
            >
              {/* Image */}
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0 overflow-hidden">
                {item.product?.images?.[0] ?? item.product?.image ? (
                  <img
                    src={item.product.images?.[0] ?? item.product.image}
                    alt={item.product?.name ?? 'Product'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1 truncate">
                  {item.product?.name ?? 'Product'}
                </h4>
                {item.product?.sku && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">SKU: {item.product.sku}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Qty: {item.quantity}
                  </span>
                  {/* ✅ uses resolved price, not bare item.price */}
                  <span className="text-sm font-medium">${lineTotal}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Price Breakdown */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
          <span className="font-medium">${subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Shipping</span>
          <span className="font-medium">
            {shippingCost === 0
              ? <span className="text-green-600">FREE</span>
              : `$${shippingCost.toFixed(2)}`
            }
          </span>
        </div>

        {shippingCost > 0 && subtotal < FREE_SHIPPING_THRESHOLD && (
          <p className="text-xs text-green-600 dark:text-green-400">
            Add ${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} more for FREE shipping
          </p>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Tax ({(TAX_RATE * 100).toFixed(0)}%)</span>
          <span className="font-medium">${taxAmount.toFixed(2)}</span>
        </div>

        <div className="border-t pt-3">
          <div className="flex justify-between">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-lg font-bold text-blue-600">${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Shipping Info */}
      {Object.keys(shippingInfo).length > 0 && (
        <div className="border-t pt-4 mt-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Shipping Information</h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>{shippingInfo.firstName} {shippingInfo.lastName}</p>
            <p>{shippingInfo.addressLine1}</p>
            {shippingInfo.addressLine2 && <p>{shippingInfo.addressLine2}</p>}
            <p>{shippingInfo.city}, {shippingInfo.state} {shippingInfo.postalCode}</p>
            <p>{shippingInfo.country}</p>
            {shippingInfo.email && <p>Email: {shippingInfo.email}</p>}
            {shippingInfo.phone && <p>Phone: {shippingInfo.phone}</p>}
          </div>
        </div>
      )}

      {/* Billing Info */}
      {Object.keys(billingInfo).length > 0 && (
        <div className="border-t pt-4 mt-6">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Billing Information</h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>{billingInfo.firstName} {billingInfo.lastName}</p>
            {billingInfo.addressLine1 && <p>{billingInfo.addressLine1}</p>}
            {billingInfo.addressLine2 && <p>{billingInfo.addressLine2}</p>}
            {billingInfo.city && <p>{billingInfo.city}, {billingInfo.state} {billingInfo.postalCode}</p>}
            {billingInfo.country && <p>{billingInfo.country}</p>}
            {billingInfo.email && <p>Email: {billingInfo.email}</p>}
            {billingInfo.phone && <p>Phone: {billingInfo.phone}</p>}
          </div>
        </div>
      )}

      {/* Shipping Method */}
      <div className="border-t pt-4 mt-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Shipping Method</h4>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <span className="capitalize">{shippingMethod}</span>
            <span className="ml-2">
              ({shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`})
            </span>
          </div>
          <p className="text-xs mt-1">
            {shippingMethod === 'express' ? '2-3 business days' : '5-7 business days'}
          </p>
        </div>
      </div>
    </div>
  );
}