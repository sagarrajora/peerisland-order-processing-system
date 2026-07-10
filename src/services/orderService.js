const { randomUUID } = require('crypto');
const { orderRepository } = require('../repositories/orderRepository');
const { ORDER_STATUS, canTransition } = require('../models/orderStatus');
const { NotFoundError, ConflictError } = require('../utils/errors');

// items.reduce(...) alone can produce values like 3.3000000000000003 for
// perfectly ordinary inputs (e.g. quantity 3, price 1.1) because of binary
// floating-point representation. Round to the nearest cent so totalAmount is
// always a clean two-decimal money value.
function roundToCents(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function placeOrder({ customerId, items }) {
  const now = new Date().toISOString();
  const totalAmount = roundToCents(
    items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  );

  const order = {
    id: randomUUID(),
    customerId,
    items,
    totalAmount,
    status: ORDER_STATUS.PENDING,
    createdAt: now,
    updatedAt: now,
  };

  return orderRepository.save(order);
}

function getOrder(id) {
  const order = orderRepository.findById(id);
  if (!order) {
    throw new NotFoundError(`Order ${id} not found`);
  }
  return order;
}

function listOrders(status) {
  return orderRepository.findAll(status);
}

function updateOrderStatus(id, nextStatus) {
  const order = getOrder(id);
  if (!canTransition(order.status, nextStatus)) {
    throw new ConflictError(
      `Cannot transition order from ${order.status} to ${nextStatus}`
    );
  }
  return applyStatusChange(order, nextStatus);
}

function cancelOrder(id) {
  const order = getOrder(id);
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new ConflictError(
      `Only PENDING orders can be cancelled (current status: ${order.status})`
    );
  }
  return applyStatusChange(order, ORDER_STATUS.CANCELLED);
}

// Builds a new order snapshot and hands it to the repository explicitly,
// rather than mutating `order` in place and relying on it being the same
// object reference the repository happens to hold internally. That aliasing
// is true for the in-memory Map today but isn't guaranteed by the repository
// interface, so a DB-backed implementation must not be required to honor it.
function applyStatusChange(order, status) {
  const updated = { ...order, status, updatedAt: new Date().toISOString() };
  return orderRepository.save(updated);
}

module.exports = { placeOrder, getOrder, listOrders, updateOrderStatus, cancelOrder };
