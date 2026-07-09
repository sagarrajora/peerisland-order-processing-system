const { z } = require('zod');
const { ORDER_STATUS } = require('../models/orderStatus');

const statusValues = Object.values(ORDER_STATUS);

const orderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().positive('quantity must be greater than 0'),
  price: z.number().nonnegative('price must be >= 0'),
});

const createOrderSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  items: z.array(orderItemSchema).min(1, 'items must be a non-empty array'),
});

const orderStatusEnum = z.enum(statusValues, {
  errorMap: () => ({ message: `status must be one of: ${statusValues.join(', ')}` }),
});

const statusUpdateSchema = z.object({
  status: orderStatusEnum,
});

const listOrdersQuerySchema = z.object({
  status: orderStatusEnum.optional(),
});

module.exports = { createOrderSchema, statusUpdateSchema, listOrdersQuerySchema };
