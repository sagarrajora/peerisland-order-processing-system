// Single source of truth for order statuses and the transitions allowed
// between them. Both the API (PATCH /orders/:id/status) and the phase-2
// background job must go through canTransition() so the rules never diverge.
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

// Forward pipeline only. CANCELLED is deliberately not reachable through
// this map - cancellation is a separate, PENDING-only operation handled by
// orderService.cancelOrder, not by the generic status-update endpoint.
const ALLOWED_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.PROCESSING],
  [ORDER_STATUS.PROCESSING]: [ORDER_STATUS.SHIPPED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
});

function canTransition(fromStatus, toStatus) {
  return (ALLOWED_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

module.exports = { ORDER_STATUS, ALLOWED_TRANSITIONS, canTransition };
