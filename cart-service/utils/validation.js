import Joi from 'joi';

// Cart item validation
export const validateCartItem = (data) => {
  const schema = Joi.object({
    userId: Joi.number().integer().positive().required(),
    productId: Joi.string().required(),
    quantity: Joi.number().integer().min(1).max(100).default(1)
  });

  return schema.validate(data);
};

// Cart update validation
export const validateCartUpdate = (data) => {
  const schema = Joi.object({
    userId: Joi.number().integer().positive().required(),
    productId: Joi.string().required(),
    quantity: Joi.number().integer().min(1).max(100).required()
  });

  return schema.validate(data);
};

// User ID validation
export const validateUserId = (data) => {
  const schema = Joi.object({
    userId: Joi.number().integer().positive().required()
  });

  return schema.validate(data);
};
