const orderService = require('../services/orderService');
const { ORDER_STATUS } = require('../models/orderStatus');
const { ConflictError } = require('../utils/errors');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getIntervalMs() {
  const raw = process.env.PENDING_ORDERS_JOB_INTERVAL_MS;
  const parsed = Number(raw);
  return raw && Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

let timer = null;

// Snapshots PENDING orders, then transitions each one through the same
// orderService.updateOrderStatus() used by the API. That function re-fetches
// the order by id and re-checks canTransition() against whatever its status
// is *right now* - not the status captured in the snapshot above. So if a
// POST /orders/:id/cancel request lands on an order between the snapshot and
// this loop reaching it, updateOrderStatus sees CANCELLED, canTransition
// (CANCELLED, PROCESSING) is false, and it throws instead of overwriting the
// cancellation. There is no separate read-then-write in the job itself, so
// there's nothing here for a cancel to race against.
function runOnce() {
  const pendingOrders = orderService.listOrders(ORDER_STATUS.PENDING);
  let transitioned = 0;

  for (const order of pendingOrders) {
    try {
      orderService.updateOrderStatus(order.id, ORDER_STATUS.PROCESSING);
      transitioned += 1;
    } catch (err) {
      // A ConflictError here means the order's status changed between the
      // snapshot above and this line (e.g. it was cancelled) - expected and
      // safe to skip. Anything else is a real bug and shouldn't be logged
      // as if it were an ordinary race skip, or it'll go unnoticed.
      if (err instanceof ConflictError) {
        console.warn(`[processPendingOrdersJob] skipped order ${order.id}: ${err.message}`);
      } else {
        console.error(`[processPendingOrdersJob] unexpected error processing order ${order.id}:`, err);
      }
    }
  }

  console.log(
    `[processPendingOrdersJob] run complete: ${transitioned}/${pendingOrders.length} PENDING orders moved to PROCESSING`
  );

  return { checked: pendingOrders.length, transitioned };
}

function start() {
  if (timer) {
    return timer;
  }
  timer = setInterval(runOnce, getIntervalMs());
  // Don't let the interval keep the Node process alive on its own; the
  // server (or Jest) decides the process lifetime, not this background job.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return timer;
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, runOnce, getIntervalMs };
