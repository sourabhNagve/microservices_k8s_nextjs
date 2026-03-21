import Joi from 'joi';

// ─── Notification validation ──────────────────────────────────────────────────
const notificationSchema = Joi.object({
  userId:    Joi.string().uuid().required()
    .messages({ 'string.guid': 'userId must be a valid UUID' }),
  type:      Joi.string()
    .valid('info', 'success', 'warning', 'error', 'order', 'payment', 'shipping', 'promotion')
    .required(),
  title:     Joi.string().min(1).max(255).required(),
  message:   Joi.string().min(1).max(5000).required(),
  data:      Joi.object().optional(),
  priority:  Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  channel:   Joi.string().valid('in_app', 'email', 'sms', 'push', 'webhook').default('in_app'),
  expiresAt: Joi.date().iso().optional(),
});

export const validateNotification = (data) =>
  notificationSchema.validate(data, { abortEarly: true, stripUnknown: true });

// ─── Notification template validation ─────────────────────────────────────────
const notificationTemplateSchema = Joi.object({
  name:      Joi.string().min(1).max(100).required(),
  type:      Joi.string()
    .valid('info', 'success', 'warning', 'error', 'order', 'payment', 'shipping', 'promotion')
    .required(),
  subject:   Joi.string().min(1).max(255).required(),
  content:   Joi.string().min(1).max(10000).required(),
  channel:   Joi.string().valid('email', 'sms', 'push', 'in_app').default('email'),
  variables: Joi.object().default({}),
});

export const validateNotificationTemplate = (data) =>
  notificationTemplateSchema.validate(data, { abortEarly: true, stripUnknown: true });
