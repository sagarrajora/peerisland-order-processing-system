const orderService = require('../services/orderService');

function createOrder(req, res) {
  const order = orderService.placeOrder(req.body);
  res.status(201).json(order);
}

function getOrder(req, res) {
  const order = orderService.getOrder(req.params.id);
  res.json(order);
}

function listOrders(req, res) {
  const orders = orderService.listOrders(req.query.status);
  res.json(orders);
}

function updateOrderStatus(req, res) {
  const order = orderService.updateOrderStatus(req.params.id, req.body.status);
  res.json(order);
}

function cancelOrder(req, res) {
  const order = orderService.cancelOrder(req.params.id);
  res.json(order);
}

module.exports = { createOrder, getOrder, listOrders, updateOrderStatus, cancelOrder };
