const request = require('supertest');
const createApp = require('../src/app');
const orderService = require('../src/services/orderService');
const job = require('../src/jobs/processPendingOrdersJob');
const { ORDER_STATUS } = require('../src/models/orderStatus');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

describe('processPendingOrdersJob', () => {
  const originalIntervalEnv = process.env.PENDING_ORDERS_JOB_INTERVAL_MS;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.PENDING_ORDERS_JOB_INTERVAL_MS = '1000';
  });

  afterEach(() => {
    job.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalIntervalEnv === undefined) {
      delete process.env.PENDING_ORDERS_JOB_INTERVAL_MS;
    } else {
      process.env.PENDING_ORDERS_JOB_INTERVAL_MS = originalIntervalEnv;
    }
  });

  it('reads the interval from the env var instead of a hard-coded value', () => {
    expect(job.getIntervalMs()).toBe(1000);
  });

  it('moves PENDING orders to PROCESSING once the configured interval elapses', async () => {
    const created = await request(app).post('/orders').send(validOrderPayload());

    job.start();
    jest.advanceTimersByTime(1000);

    const res = await request(app).get(`/orders/${created.body.id}`);
    expect(res.body.status).toBe(ORDER_STATUS.PROCESSING);
  });

  it('leaves CANCELLED and SHIPPED orders untouched', async () => {
    const cancelled = await request(app).post('/orders').send(validOrderPayload());
    await request(app).post(`/orders/${cancelled.body.id}/cancel`);

    const shipped = await request(app).post('/orders').send(validOrderPayload());
    await request(app).patch(`/orders/${shipped.body.id}/status`).send({ status: 'PROCESSING' });
    await request(app).patch(`/orders/${shipped.body.id}/status`).send({ status: 'SHIPPED' });

    job.start();
    jest.advanceTimersByTime(1000);

    const cancelledRes = await request(app).get(`/orders/${cancelled.body.id}`);
    const shippedRes = await request(app).get(`/orders/${shipped.body.id}`);
    expect(cancelledRes.body.status).toBe('CANCELLED');
    expect(shippedRes.body.status).toBe('SHIPPED');
  });

  it('does not overwrite a cancel that lands mid-run, after the PENDING snapshot was taken', () => {
    // orderA and orderB are both PENDING when the job takes its snapshot.
    const orderA = orderService.placeOrder({
      customerId: 'cust-a',
      items: [{ productId: 'p1', quantity: 1, price: 10 }],
    });
    const orderB = orderService.placeOrder({
      customerId: 'cust-b',
      items: [{ productId: 'p1', quantity: 1, price: 10 }],
    });

    const realUpdateStatus = orderService.updateOrderStatus;
    // While the job is transitioning orderA, simulate a concurrent
    // POST /orders/:id/cancel landing on orderB - a request that arrives
    // after the job already snapshotted PENDING orders but before the loop
    // reaches orderB.
    jest.spyOn(orderService, 'updateOrderStatus').mockImplementation((id, status) => {
      if (id === orderA.id) {
        orderService.cancelOrder(orderB.id);
      }
      return realUpdateStatus(id, status);
    });

    const result = job.runOnce();

    expect(orderService.getOrder(orderA.id).status).toBe(ORDER_STATUS.PROCESSING);
    expect(orderService.getOrder(orderB.id).status).toBe('CANCELLED');
    expect(result.checked).toBe(2);
    expect(result.transitioned).toBe(1);
  });
});
