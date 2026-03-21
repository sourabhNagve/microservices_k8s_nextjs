import Joi from 'joi';

// ─── validateInventoryItem ────────────────────────────────────────────────────
// FIX 1 (original lines 4-50): field names used snake_case (product_id,
// warehouse_id, max_stock) but the model's upsert() destructures camelCase
// (productId, warehouseId, maxStock). This meant validated values were passed
// to the model under the wrong key names and silently ignored, so every "add
// inventory" request treated productId as undefined and failed with a DB
// not-null violation.
// Changed all field names to camelCase to match the model interface.
//
// FIX 2 (original): warehouse_id validated as UUID but the schema defines
// warehouses.id as `serial` (integer). Changed to integer.
//
// FIX 3 (original): `reorder_level` was validated but the model uses
// `minStock`. Renamed and aligned.
const validateInventoryItem = (data) => {
  const schema = Joi.object({
    productId: Joi.string().uuid().required().messages({
      'string.uuid':  'Product ID must be a valid UUID',
      'any.required': 'Product ID is required',
    }),

    // FIX 2: integer FK, not UUID
    warehouseId: Joi.number().integer().positive().optional().messages({
      'number.base':    'Warehouse ID must be a number',
      'number.integer': 'Warehouse ID must be an integer',
    }),

    quantity: Joi.number().integer().min(0).required().messages({
      'number.min':     'Quantity must be at least 0',
      'number.integer': 'Quantity must be an integer',
      'any.required':   'Quantity is required',
    }),

    // FIX 3: renamed reorder_level → minStock
    minStock: Joi.number().integer().min(0).default(5).messages({
      'number.min':     'Min stock must be at least 0',
      'number.integer': 'Min stock must be an integer',
    }),

    maxStock: Joi.number().integer().min(1).default(100).messages({
      'number.min':     'Max stock must be at least 1',
      'number.integer': 'Max stock must be an integer',
    }),

    location: Joi.string().max(255).optional().allow(''),

    // FIX 4 (original): cost_per_unit is not a column in the schema — it was
    // validated and accepted but silently dropped. Removed to avoid false
    // confidence that it was persisted. Re-add when the column is added.
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── validateStockUpdate ─────────────────────────────────────────────────────
// FIX 5 (original): field name was transaction_type (snake_case) but the
// route destructures transactionType (camelCase). Renamed.
//
// FIX 6 (original): quantity had no min/max — a caller could send quantity=0
// or a very large number. Added min(1) for in/out operations; adjustments can
// be 0 but not negative. The model handles this distinction, but a min of 1
// here prevents clearly nonsensical requests from reaching the DB.
const validateStockUpdate = (data) => {
  const schema = Joi.object({
    quantity: Joi.number().integer().min(1).required().messages({
      'number.min':     'Quantity must be at least 1',
      'number.integer': 'Quantity must be an integer',
      'any.required':   'Quantity is required',
    }),

    // FIX 5: camelCase to match route destructuring
    transactionType: Joi.string()
      .valid('in', 'out', 'adjustment', 'transfer', 'stock_count')
      .required()
      .messages({
        'any.only':     'Transaction type must be one of: in, out, adjustment, transfer, stock_count',
        'any.required': 'Transaction type is required',
      }),

    reason: Joi.string().max(500).optional().allow(''),

    referenceId: Joi.string().uuid().optional().messages({
      'string.uuid': 'Reference ID must be a valid UUID',
    }),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

// ─── validateWarehouse ────────────────────────────────────────────────────────
const validateWarehouse = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255).required().messages({
      'string.min':   'Warehouse name must be at least 2 characters',
      'string.max':   'Warehouse name cannot exceed 255 characters',
      'any.required': 'Warehouse name is required',
    }),

    location: Joi.string().min(5).max(500).required().messages({
      'string.min':   'Location must be at least 5 characters',
      // FIX 7 (original): max was 255 but the schema column is 500 chars. Aligned.
      'string.max':   'Location cannot exceed 500 characters',
      'any.required': 'Location is required',
    }),

    capacity: Joi.number().integer().min(1).default(1000).messages({
      'number.min':     'Capacity must be at least 1',
      'number.integer': 'Capacity must be an integer',
    }),

    manager: Joi.string().min(2).max(255).optional().messages({
      'string.min': 'Manager name must be at least 2 characters',
      'string.max': 'Manager name cannot exceed 255 characters',
    }),

    // FIX 8 (original): field was `is_active` but the schema column is
    // `active` (boolean). Renamed to `active`.
    active: Joi.boolean().default(true),
  });

  return schema.validate(data, { abortEarly: true, stripUnknown: true });
};

export { validateInventoryItem, validateStockUpdate, validateWarehouse };