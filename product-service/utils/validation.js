import Joi from 'joi';

// Product creation validation
const validateProduct = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(2)
      .max(255)
      .required()
      .messages({
        'string.min': 'Product name must be at least 2 characters long',
        'string.max': 'Product name cannot exceed 255 characters',
        'any.required': 'Product name is required'
      }),
    
    description: Joi.string()
      .max(2000)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 2000 characters'
      }),
    
    price: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Price must be a positive number',
        'number.precision': 'Price can have maximum 2 decimal places',
        'any.required': 'Price is required'
      }),
    
    categoryId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.uuid': 'Category ID must be a valid UUID',
        'any.required': 'Category ID is required'
      }),
    
    sku: Joi.string()
      .alphanum()
      .min(3)
      .max(100)
      .required()
      .messages({
        'string.alphanum': 'SKU must contain only alphanumeric characters',
        'string.min': 'SKU must be at least 3 characters long',
        'string.max': 'SKU cannot exceed 100 characters',
        'any.required': 'SKU is required'
      }),
    
    stockQuantity: Joi.number()
      .integer()
      .min(0)
      .default(0)
      .messages({
        'number.min': 'Stock quantity cannot be negative',
        'number.integer': 'Stock quantity must be an integer'
      }),
    
    minStockLevel: Joi.number()
      .integer()
      .min(0)
      .default(5)
      .messages({
        'number.min': 'Minimum stock level cannot be negative',
        'number.integer': 'Minimum stock level must be an integer'
      }),
    
    weight: Joi.number()
      .positive()
      .precision(2)
      .optional()
      .messages({
        'number.positive': 'Weight must be a positive number',
        'number.precision': 'Weight can have maximum 2 decimal places'
      }),
    
    dimensions: Joi.object({
      length: Joi.number().positive().optional(),
      width: Joi.number().positive().optional(),
      height: Joi.number().positive().optional(),
      unit: Joi.string().valid('cm', 'in', 'ft').default('cm').optional()
    }).optional(),
    
    images: Joi.array()
      .items(Joi.string().uri())
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 images allowed'
      }),
    
    tags: Joi.array()
      .items(Joi.string().max(50))
      .max(20)
      .optional()
      .messages({
        'array.max': 'Maximum 20 tags allowed'
      }),
    
    featured: Joi.boolean()
      .default(false)
      .optional()
  });

  return schema.validate(data);
};

// Product update validation
const validateProductUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string()
      .min(2)
      .max(255)
      .optional()
      .messages({
        'string.min': 'Product name must be at least 2 characters long',
        'string.max': 'Product name cannot exceed 255 characters'
      }),
    
    description: Joi.string()
      .max(2000)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 2000 characters'
      }),
    
    price: Joi.number()
      .positive()
      .precision(2)
      .optional()
      .messages({
        'number.positive': 'Price must be a positive number',
        'number.precision': 'Price can have maximum 2 decimal places'
      }),
    
    categoryId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.uuid': 'Category ID must be a valid UUID'
      }),
    
    sku: Joi.string()
      .alphanum()
      .min(3)
      .max(100)
      .optional()
      .messages({
        'string.alphanum': 'SKU must contain only alphanumeric characters',
        'string.min': 'SKU must be at least 3 characters long',
        'string.max': 'SKU cannot exceed 100 characters'
      }),
    
    stockQuantity: Joi.number()
      .integer()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Stock quantity cannot be negative',
        'number.integer': 'Stock quantity must be an integer'
      }),
    
    minStockLevel: Joi.number()
      .integer()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Minimum stock level cannot be negative',
        'number.integer': 'Minimum stock level must be an integer'
      }),
    
    weight: Joi.number()
      .positive()
      .precision(2)
      .optional()
      .messages({
        'number.positive': 'Weight must be a positive number',
        'number.precision': 'Weight can have maximum 2 decimal places'
      }),
    
    dimensions: Joi.object({
      length: Joi.number().positive().optional(),
      width: Joi.number().positive().optional(),
      height: Joi.number().positive().optional(),
      unit: Joi.string().valid('cm', 'in', 'ft').default('cm').optional()
    }).optional(),
    
    images: Joi.array()
      .items(Joi.string().uri())
      .max(10)
      .optional()
      .messages({
        'array.max': 'Maximum 10 images allowed'
      }),
    
    tags: Joi.array()
      .items(Joi.string().max(50))
      .max(20)
      .optional()
      .messages({
        'array.max': 'Maximum 20 tags allowed'
      }),
    
    featured: Joi.boolean()
      .optional(),
    
    status: Joi.string()
      .valid('active', 'inactive', 'discontinued')
      .optional()
  });

  return schema.validate(data);
};

// Stock update validation
const validateStockUpdate = (data) => {
  const schema = Joi.object({
    quantity: Joi.number()
      .integer()
      .min(1)
      .required()
      .messages({
        'number.min': 'Quantity must be at least 1',
        'number.integer': 'Quantity must be an integer',
        'any.required': 'Quantity is required'
      }),
    
    operation: Joi.string()
      .valid('add', 'subtract', 'set')
      .default('set')
      .messages({
        'any.only': 'Operation must be one of: add, subtract, set'
      })
  });

  return schema.validate(data);
};

// Search validation
const validateSearch = (data) => {
  const schema = Joi.object({
    term: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Search term must be at least 2 characters long',
        'string.max': 'Search term cannot exceed 100 characters',
        'any.required': 'Search term is required'
      }),
    
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.min': 'Page must be at least 1',
        'number.integer': 'Page must be an integer'
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .messages({
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100',
        'number.integer': 'Limit must be an integer'
      })
  });

  return schema.validate(data);
};

export {
  validateProduct,
  validateProductUpdate,
  validateStockUpdate,
  validateSearch
};
