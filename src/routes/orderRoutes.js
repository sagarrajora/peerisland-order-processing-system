const express = require('express');
const orderController = require('../controllers/orderController');
const { validateBody, validateQuery } = require('../middleware/validate');
const {
  createOrderSchema,
  statusUpdateSchema,
  listOrdersQuerySchema,
} = require('../validation/orderSchemas');

const router = express.Router();

router.post('/', validateBody(createOrderSchema), orderController.createOrder);
router.get('/', validateQuery(listOrdersQuerySchema), orderController.listOrders);
router.get('/:id', orderController.getOrder);
router.patch('/:id/status', validateBody(statusUpdateSchema), orderController.updateOrderStatus);
router.post('/:id/cancel', orderController.cancelOrder);

module.exports = router;
