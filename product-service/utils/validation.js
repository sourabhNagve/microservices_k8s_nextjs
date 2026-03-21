import Joi from 'joi';

// FIX 1 (original lines 35-39): categoryId was validated as a UUID but the
// schema defines it as an integer foreign key (serial 'id' in categories table).
// Changed to Joi.number().integer().positive() to match the actual DB column.

// FIX 2 (original lines 44-53): SKU used .alphanum() which rejects hyphens and
// underscores. Real-world SKUs commonly use both (e.g. 'PROD-001', 'SKU_ABC').

// FIX 3: images validated as URI strings with no max length per URL. Added
// max(2048) and https-only scheme to block javascript: / data: URIs.

// FIX 4: 'stockQuantity' field name in validation did not match 'stock' in the
// DB schema — validated value was silently dropped. Renamed to 'stock'.

// FIX 5: 'status' field validated but the schema has boolean 'active', not a
// status enum. Replaced with 'active: Joi.boolean()'.

// ─── Product creation ─────────────────────────────────────────────────────────
const validateProduct = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Product name must be at least 2 characters long',
      'string.max': 'Product name cannot exceed 255 characters',
      'any.required': 'Product name is required',
    }),
    description: Joi.string().max(2000).optional().messages({
      'string.max': 'Description cannot exceed 2000 characters',
    }),
    price: Joi.number().positive().precision(2).required().messages({
      'number.positive': 'Price must be a positive number',
      'number.precision': 'Price can have maximum 2 decimal places',
      'any.required': 'Price is required',
    }),
    // FIX 1: integer FK, not UUID
    categoryId: Joi.number().integer().positive().required().messages({
      'number.base': 'Category ID must be a number',
      'number.integer': 'Category ID must be an integer',
      'any.required': 'Category ID is required',
    }),
    // FIX 2: allow hyphens and underscores
    sku: Joi.string().pattern(/^[A-Za-z0-9_-]{3,100}$/).required().messages({
      'string.pattern.base': 'SKU must be 3–100 chars: letters, numbers, hyphens, underscores',
      'any.required': 'SKU is required',
    }),
    // FIX 4: renamed from stockQuantity to stock
    stock: Joi.number().integer().min(0).default(0).messages({
      'number.min': 'Stock cannot be negative',
      'number.integer': 'Stock must be an integer',
    }),
    weight: Joi.number().positive().precision(2).optional(),
    dimensions: Joi.object({
      length: Joi.number().positive().optional(),
      width:  Joi.number().positive().optional(),
      height: Joi.number().positive().optional(),
      unit:   Joi.string().valid('cm', 'in', 'ft').default('cm').optional(),
    }).optional(),
    // FIX 3: https only, max 2048 chars per URL
    images: Joi.array()
      .items(Joi.string().uri({ scheme: ['https'] }).max(2048))
      .max(10).optional()
      .messages({ 'array.max': 'Maximum 10 images allowed' }),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional()
      .messages({ 'array.max': 'Maximum 20 tags allowed' }),
    featured: Joi.boolean().default(false).optional(),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── Product update ───────────────────────────────────────────────────────────
const validateProductUpdate = (data) => {
  const schema = Joi.object({
    name:        Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(2000).allow('').optional(),
    price:       Joi.number().positive().precision(2).optional(),
    categoryId:  Joi.number().integer().positive().optional(),  // FIX 1
    sku:         Joi.string().pattern(/^[A-Za-z0-9_-]{3,100}$/).optional(),  // FIX 2
    stock:       Joi.number().integer().min(0).optional(),  // FIX 4
    weight:      Joi.number().positive().precision(2).optional(),
    dimensions: Joi.object({
      length: Joi.number().positive().optional(),
      width:  Joi.number().positive().optional(),
      height: Joi.number().positive().optional(),
      unit:   Joi.string().valid('cm', 'in', 'ft').default('cm').optional(),
    }).optional(),
    images: Joi.array()
      .items(Joi.string().uri({ scheme: ['https'] }).max(2048))
      .max(10).optional(),  // FIX 3
    tags:     Joi.array().items(Joi.string().max(50)).max(20).optional(),
    featured: Joi.boolean().optional(),
    active:   Joi.boolean().optional(),  // FIX 5: was 'status'
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── Stock update ─────────────────────────────────────────────────────────────
// FIX 6 (original): quantity min was 1 — rejected quantity=0 for 'set' to zero
// out stock. Changed to min(0).
const validateStockUpdate = (data) => {
  const schema = Joi.object({
    quantity: Joi.number().integer().min(0).required().messages({
      'number.min': 'Quantity must be 0 or greater',
      'number.integer': 'Quantity must be an integer',
      'any.required': 'Quantity is required',
    }),
    operation: Joi.string().valid('add', 'subtract', 'set').default('set').messages({
      'any.only': 'Operation must be one of: add, subtract, set',
    }),
  });

  return schema.validate(data, { abortEarly: true });
};

// ─── Search ───────────────────────────────────────────────────────────────────
const validateSearch = (data) => {
  const schema = Joi.object({
    term:  Joi.string().min(2).max(100).required(),
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  });
  return schema.validate(data, { abortEarly: true });
};

export { validateProduct, validateProductUpdate, validateStockUpdate, validateSearch };