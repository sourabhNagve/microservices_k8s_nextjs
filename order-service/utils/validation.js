import Joi from 'joi';

// Order validation schema
export const validateOrder = (data) => {
  const schema = Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.string(),
      Joi.number()
    ).required(), // Accept UUID, string, or number format for userId
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().required(), // Accept any string format for productId
        productName: Joi.string().min(1).max(255).required(),
        productSku: Joi.string().max(100).optional(),
        quantity: Joi.number().integer().min(1).max(50).required(),
        unitPrice: Joi.number().min(0).required(),
        totalPrice: Joi.number().min(0).required()
      })
    ).min(1).required(),
    shippingInfo: Joi.object({
      firstName: Joi.string().min(1).max(100).required(),
      lastName: Joi.string().min(1).max(100).required(),
      email: Joi.string().email().required(),
      phone: Joi.string().pattern(/^[+]?[\d\s\-\(\)]+$/).optional(),
      addressLine1: Joi.string().min(1).max(255).required(),
      addressLine2: Joi.string().max(255).optional(),
      city: Joi.string().min(1).max(100).required(),
      state: Joi.string().min(1).max(100).required(),
      postalCode: Joi.string().min(3).max(20).required(),
      country: Joi.string().min(1).max(100).required()
    }).required(),
    billingInfo: Joi.object({
      firstName: Joi.string().min(1).max(100).optional(),
      lastName: Joi.string().min(1).max(100).optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^[+]?[\d\s\-\(\)]+$/).optional(),
      addressLine1: Joi.string().max(255).optional(),
      addressLine2: Joi.string().max(255).optional(),
      city: Joi.string().max(100).optional(),
      state: Joi.string().max(100).optional(),
      postalCode: Joi.string().min(3).max(20).optional(),
      country: Joi.string().max(100).optional()
    }).optional(),
    shippingMethod: Joi.string().valid('standard', 'express').default('standard'),
    notes: Joi.string().max(1000).optional()
  });

  return schema.validate(data);
};

// Order status update validation
export const validateOrderStatus = (data) => {
  const schema = Joi.object({
    status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded').required(),
    notes: Joi.string().max(1000).optional()
  });

  return schema.validate(data);
};

// Tracking information validation
export const validateTracking = (data) => {
  const schema = Joi.object({
    trackingNumber: Joi.string().min(1).max(100).required(),
    carrier: Joi.string().min(1).max(50).required(),
    estimatedDelivery: Joi.date().optional()
  });

  return schema.validate(data);
};

// Order ID validation
export const validateOrderId = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().uuid().required()
  });

  return schema.validate(data);
};

// User ID validation
export const validateUserId = (data) => {
  const schema = Joi.object({
    userId: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.string(),
      Joi.number()
    ).required()
  });

  return schema.validate(data);
};
