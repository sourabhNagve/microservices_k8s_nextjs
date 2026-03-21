import Joi from 'joi';

// FIX 1 (original line 6): productId allowed any non-empty string — a UUID,
// a slug, a numeric string, etc. Constraining it to max 100 chars prevents
// absurdly long product IDs from being written into Redis keys and hash fields.
// Adjust the pattern to match your actual product ID format if it is stricter
// (e.g. UUID: Joi.string().uuid()).
const productIdSchema = Joi.string().trim().max(100).required();

// FIX 2 (original): userId was only validated as a positive integer but the
// route also accepted it from URL params as a string. parseInt is called at the
// route level before validation, so this is fine — documenting it here for
// clarity. The max(2_147_483_647) guard matches PostgreSQL's int4 range so a
// crafted userId cannot overflow the DB column.
const userIdSchema = Joi.number().integer().positive().max(2_147_483_647).required();

// Cart item validation (POST /add)
export const validateCartItem = (data) => {
  const schema = Joi.object({
    userId:    userIdSchema,
    productId: productIdSchema,
    // FIX 3 (original line 8): quantity had a .default(1) but Joi's default()
    // only applies when the key is absent — a caller sending quantity:0 would
    // still fail the min(1) check correctly. However the default is misleading
    // on the schema object used for validation (it mutates the input). Use an
    // optional() with a route-level default instead, which is already done in
    // the route handler. Here we just validate what arrives.
    quantity: Joi.number().integer().min(1).max(1000).required(),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// Cart update validation (PUT /update)
export const validateCartUpdate = (data) => {
  const schema = Joi.object({
    userId:    userIdSchema,
    productId: productIdSchema,
    quantity:  Joi.number().integer().min(1).max(1000).required(),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// User ID validation (used for GET /:userId and DELETE /clear/:userId)
export const validateUserId = (data) => {
  const schema = Joi.object({
    userId: userIdSchema,
  });

  return schema.validate(data, { abortEarly: true });
};

// FIX 4 (new): validation schema for the remove-item route which now uses
// path parameters /:userId/:productId instead of a request body.
export const validateRemoveItem = (data) => {
  const schema = Joi.object({
    userId:    userIdSchema,
    productId: productIdSchema,
  });

  return schema.validate(data, { abortEarly: true });
};