import Joi from 'joi';

// ─── validateOrder ────────────────────────────────────────────────────────────
// FIX 1 (original lines 5-9): userId accepted Joi.alternatives with uuid,
// string, or number — effectively any value. This makes server-side ownership
// checks unreliable because the same user might be represented as "123", 123,
// or a UUID depending on which format the client chose.
// Tightened to UUID only (matching auth-service's user ID format).
// If your auth-service still issues integer IDs, use Joi.number().integer().positive()
// instead, but pick one and enforce it consistently.
export const validateOrder = (data) => {
  const schema = Joi.object({
    userId: Joi.string().uuid().required().messages({
      'string.uuid': 'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),

    items: Joi.array().items(
      Joi.object({
        productId:   Joi.string().uuid().required().messages({
          'string.uuid': 'productId must be a valid UUID',
        }),
        productName: Joi.string().min(1).max(255).required(),
        productSku:  Joi.string().max(100).optional(),
        quantity:    Joi.number().integer().min(1).max(100).required(),
        unitPrice:   Joi.number().min(0).precision(2).required(),
        // FIX 2 (original): totalPrice was accepted from the client but the
        // model now recomputes it server-side (unitPrice * quantity). The field
        // is still accepted here for backwards compatibility with existing
        // clients but will be overwritten by the model — documented clearly.
        totalPrice:  Joi.number().min(0).optional(),
      })
    ).min(1).max(50).required().messages({  // FIX 3: max 50 items per order
      'array.min': 'Order must contain at least one item',
      'array.max': 'Order cannot contain more than 50 items',
    }),

    shippingInfo: Joi.object({
      firstName:    Joi.string().min(1).max(100).required(),
      lastName:     Joi.string().min(1).max(100).required(),
      email:        Joi.string().email().required(),
      phone:        Joi.string().pattern(/^[+]?[\d\s\-()]+$/).max(20).optional(),
      addressLine1: Joi.string().min(1).max(255).required(),
      addressLine2: Joi.string().max(255).optional().allow(''),
      city:         Joi.string().min(1).max(100).required(),
      state:        Joi.string().min(1).max(100).required(),
      postalCode:   Joi.string().min(3).max(20).required(),
      country:      Joi.string().min(1).max(100).required(),
    }).required(),

    billingInfo: Joi.object({
      firstName:    Joi.string().max(100).optional(),
      lastName:     Joi.string().max(100).optional(),
      email:        Joi.string().email().optional(),
      phone:        Joi.string().pattern(/^[+]?[\d\s\-()]+$/).max(20).optional(),
      addressLine1: Joi.string().max(255).optional().allow(''),
      addressLine2: Joi.string().max(255).optional().allow(''),
      city:         Joi.string().max(100).optional(),
      state:        Joi.string().max(100).optional(),
      postalCode:   Joi.string().min(3).max(20).optional(),
      country:      Joi.string().max(100).optional(),
    }).optional(),

    shippingMethod: Joi.string().valid('standard', 'express').default('standard'),
    notes:          Joi.string().max(1000).optional().allow(''),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── validateOrderStatus ──────────────────────────────────────────────────────
export const validateOrderStatus = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
      .required(),
    notes: Joi.string().max(1000).optional().allow(''),
  });

  return schema.validate(data, { abortEarly: true });
};

// ─── validateTracking ─────────────────────────────────────────────────────────
export const validateTracking = (data) => {
  const schema = Joi.object({
    trackingNumber:   Joi.string().min(1).max(100).required(),
    carrier:          Joi.string().min(1).max(50).required(),
    // FIX 4: estimatedDelivery must be in the future — a past delivery date is
    // almost always a client-side error.
    estimatedDelivery: Joi.date().min('now').optional().messages({
      'date.min': 'Estimated delivery date must be in the future',
    }),
  });

  return schema.validate(data, { abortEarly: true });
};

// ─── validateOrderId ──────────────────────────────────────────────────────────
export const validateOrderId = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().uuid().required(),
  });

  return schema.validate(data);
};

// ─── validateUserId ───────────────────────────────────────────────────────────
// FIX 5 (original): same over-broad alternatives() as in validateOrder.
// Tightened to UUID to match the ownership-check logic in the route handlers.
export const validateUserId = (data) => {
  const schema = Joi.object({
    userId: Joi.string().uuid().required().messages({
      'string.uuid': 'userId must be a valid UUID',
      'any.required': 'userId is required',
    }),
  });

  return schema.validate(data);
};