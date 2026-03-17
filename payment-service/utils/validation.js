import Joi from 'joi';

// Payment validation schema
export const validatePayment = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required(),
    paymentMethod: Joi.string().valid('card', 'paypal', 'bank_transfer').required(),
    provider: Joi.string().valid('stripe', 'paypal', 'bank').required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().default('USD'),
    providerTransactionId: Joi.string().optional(),
    gatewayResponse: Joi.object().optional()
  });

  return schema.validate(data);
};

// Payment method validation schema
export const validatePaymentMethod = (data) => {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    methodType: Joi.string().valid('card', 'bank_account').required(),
    provider: Joi.string().required(),
    providerMethodId: Joi.string().optional(),
    isDefault: Joi.boolean().default(false),
    cardLast4: Joi.string().pattern(/^\d{4}$/).optional(),
    cardBrand: Joi.string().optional(),
    cardExpiryMonth: Joi.number().integer().min(1).max(12).optional(),
    cardExpiryYear: Joi.number().integer().min(new Date().getFullYear()).optional(),
    billingEmail: Joi.string().email().optional()
  });

  return schema.validate(data);
};
