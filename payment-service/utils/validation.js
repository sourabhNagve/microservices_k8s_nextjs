import Joi from 'joi';

// ─── validatePayment ──────────────────────────────────────────────────────────
// FIX 1 (original): amount had only .positive() — no upper limit. A malformed
// request could create a payment record for $999,999,999. Added a reasonable
// maximum matching Stripe's limit for most currencies.
//
// FIX 2 (original): currency accepted any string with no length restriction.
// Added exact 3-character validation matching ISO 4217 currency codes.
//
// FIX 3 (original): no abortEarly option or stripUnknown — extra fields in
// the body were passed through to the model and stored in the DB.
export const validatePayment = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().uuid().required().messages({
      'string.uuid':  'orderId must be a valid UUID',
      'any.required': 'orderId is required',
    }),

    userId: Joi.string().uuid().required().messages({
      'string.uuid':  'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),

    paymentMethod: Joi.string()
      .valid('card', 'paypal', 'bank_transfer', 'refund')
      .required()
      .messages({
        'any.only':     'paymentMethod must be one of: card, paypal, bank_transfer, refund',
        'any.required': 'paymentMethod is required',
      }),

    provider: Joi.string()
      .valid('stripe', 'paypal', 'bank', 'system')
      .required()
      .messages({
        'any.only':     'provider must be one of: stripe, paypal, bank, system',
        'any.required': 'provider is required',
      }),

    amount: Joi.number()
      .positive()
      .max(999_999.99)   // FIX 1: reasonable upper bound
      .precision(2)
      .required()
      .messages({
        'number.positive': 'amount must be positive',
        'number.max':      'amount exceeds maximum allowed value',
        'any.required':    'amount is required',
      }),

    // FIX 2: 3-character ISO 4217 currency code
    currency: Joi.string()
      .length(3)
      .uppercase()
      .default('USD')
      .messages({
        'string.length': 'currency must be a 3-character ISO 4217 code (e.g. USD)',
      }),

    providerTransactionId: Joi.string().max(255).optional(),
    gatewayResponse:       Joi.object().optional(),

    // FIX 4: status and processedAt are included so verify-and-record can
    // pass them directly to create() without validation errors.
    status:      Joi.string()
      .valid('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')
      .optional(),
    processedAt: Joi.date().iso().optional(),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── validatePaymentMethod ────────────────────────────────────────────────────
// FIX 5 (original): card expiry validation was only `min(currentYear)` — a
// month in a past month of the current year was accepted. Added a combined
// check via a Joi.custom() validator.
//
// FIX 6 (original): provider had no constraint — any string was accepted.
// Tightened to known providers.
export const validatePaymentMethod = (data) => {
  const schema = Joi.object({
    userId: Joi.string().uuid().required().messages({
      'string.uuid':  'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),

    methodType: Joi.string()
      .valid('card', 'bank_account')
      .required()
      .messages({
        'any.only':     'methodType must be one of: card, bank_account',
        'any.required': 'methodType is required',
      }),

    // FIX 6: constrained to known providers
    provider: Joi.string()
      .valid('stripe', 'paypal', 'bank')
      .required()
      .messages({
        'any.only':     'provider must be one of: stripe, paypal, bank',
        'any.required': 'provider is required',
      }),

    providerMethodId: Joi.string().max(255).optional(),
    isDefault:        Joi.boolean().default(false),

    cardLast4: Joi.string().pattern(/^\d{4}$/).optional().messages({
      'string.pattern.base': 'cardLast4 must be exactly 4 digits',
    }),

    cardBrand: Joi.string().max(50).optional(),

    cardExpiryMonth: Joi.number().integer().min(1).max(12).optional().messages({
      'number.min': 'cardExpiryMonth must be between 1 and 12',
      'number.max': 'cardExpiryMonth must be between 1 and 12',
    }),

    // FIX 5: cross-field expiry validation
    cardExpiryYear: Joi.number()
      .integer()
      .min(new Date().getFullYear())
      .optional()
      .messages({
        'number.min': 'cardExpiryYear cannot be in the past',
      }),

    billingEmail: Joi.string().email().max(255).optional(),
  }).custom((value, helpers) => {
    // FIX 5: reject cards whose expiry month/year combination is in the past
    const { cardExpiryMonth, cardExpiryYear } = value;
    if (cardExpiryMonth && cardExpiryYear) {
      const now      = new Date();
      const monthEnd = new Date(cardExpiryYear, cardExpiryMonth, 0, 23, 59, 59);
      if (monthEnd < now) {
        return helpers.error('any.invalid', {
          message: 'Card has expired — expiry date is in the past',
        });
      }
    }
    return value;
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};