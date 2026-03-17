import Joi from 'joi';

// Inventory item validation
const validateInventoryItem = (data) => {
  const schema = Joi.object({
    product_id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.uuid': 'Product ID must be a valid UUID',
        'any.required': 'Product ID is required'
      }),
    
    warehouse_id: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.uuid': 'Warehouse ID must be a valid UUID'
      }),
    
    quantity: Joi.number()
      .integer()
      .min(0)
      .required()
      .messages({
        'number.min': 'Quantity must be at least 0',
        'number.integer': 'Quantity must be an integer',
        'any.required': 'Quantity is required'
      }),
    
    reorder_level: Joi.number()
      .integer()
      .min(0)
      .default(10)
      .messages({
        'number.min': 'Reorder level must be at least 0',
        'number.integer': 'Reorder level must be an integer'
      }),
    
    max_stock: Joi.number()
      .integer()
      .min(1)
      .default(1000)
      .messages({
        'number.min': 'Max stock must be at least 1',
        'number.integer': 'Max stock must be an integer'
      }),
    
    cost_per_unit: Joi.number()
      .min(0)
      .default(0)
      .messages({
        'number.min': 'Cost per unit must be at least 0'
      })
  });

  return schema.validate(data);
};

// Stock update validation
const validateStockUpdate = (data) => {
  const schema = Joi.object({
    quantity: Joi.number()
      .integer()
      .required()
      .messages({
        'number.integer': 'Quantity must be an integer',
        'any.required': 'Quantity is required'
      }),
    
    transaction_type: Joi.string()
      .valid('in', 'out', 'adjust', 'transfer')
      .required()
      .messages({
        'any.only': 'Transaction type must be one of: in, out, adjust, transfer',
        'any.required': 'Transaction type is required'
      }),
    
    notes: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Notes cannot exceed 500 characters'
      }),
    
    reference_id: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.uuid': 'Reference ID must be a valid UUID'
      }),
    
    reference_type: Joi.string()
      .max(50)
      .optional()
      .messages({
        'string.max': 'Reference type cannot exceed 50 characters'
      })
  });

  return schema.validate(data);
};

// Warehouse validation
const validateWarehouse = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Warehouse name must be at least 2 characters long',
        'string.max': 'Warehouse name cannot exceed 100 characters',
        'any.required': 'Warehouse name is required'
      }),
    
    location: Joi.string()
      .min(5)
      .max(255)
      .required()
      .messages({
        'string.min': 'Location must be at least 5 characters long',
        'string.max': 'Location cannot exceed 255 characters',
        'any.required': 'Location is required'
      }),
    
    capacity: Joi.number()
      .integer()
      .min(1)
      .default(1000)
      .messages({
        'number.min': 'Capacity must be at least 1',
        'number.integer': 'Capacity must be an integer'
      }),
    
    manager: Joi.string()
      .min(2)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Manager name must be at least 2 characters long',
        'string.max': 'Manager name cannot exceed 100 characters'
      }),
    
    is_active: Joi.boolean()
      .default(true)
  });

  return schema.validate(data);
};

export {
  validateInventoryItem,
  validateStockUpdate,
  validateWarehouse
};
