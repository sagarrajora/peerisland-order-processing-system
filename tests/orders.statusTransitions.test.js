const request = require('supertest');
const createApp = require('../src/app');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

async function createOrder() {
  const res = await request(app).post('/orders').send(validOrderPayload());
  return res.body;
}

async function patchStatus(id, status) {
  return request(app).patch(`/orders/${id}/status`).send({ status });
}

describe('PATCH /orders/:id/status', () => {
  it('allows PENDING -> PROCESSING', async () => {
    const order = await createOrder();

    const res = await patchStatus(order.id, 'PROCESSING');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PROCESSING');
  });

  it('allows PROCESSING -> SHIPPED', async () => {
    const order = await createOrder();
    await patchStatus(order.id, 'PROCESSING');

    const res = await patchStatus(order.id, 'SHIPPED');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SHIPPED');
  });

  it('allows SHIPPED -> DELIVERED', async () => {
    const order = await createOrder();
    await patchStatus(order.id, 'PROCESSING');
    await patchStatus(order.id, 'SHIPPED');

    const res = await patchStatus(order.id, 'DELIVERED');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DELIVERED');
  });

  it('rejects PENDING -> DELIVERED with 409 naming the current status', async () => {
    const order = await createOrder();

    const res = await patchStatus(order.id, 'DELIVERED');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/PENDING/);
  });

  it('rejects DELIVERED -> SHIPPED (no backward transitions) with 409', async () => {
    const order = await createOrder();
    await patchStatus(order.id, 'PROCESSING');
    await patchStatus(order.id, 'SHIPPED');
    await patchStatus(order.id, 'DELIVERED');

    const res = await patchStatus(order.id, 'SHIPPED');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/DELIVERED/);
  });

  it('rejects transitioning straight to CANCELLED through this endpoint', async () => {
    const order = await createOrder();

    const res = await patchStatus(order.id, 'CANCELLED');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects an unrecognized status value with 400', async () => {
    const order = await createOrder();

    const res = await patchStatus(order.id, 'NOT_A_STATUS');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the order does not exist', async () => {
    const res = await patchStatus('does-not-exist', 'PROCESSING');

    expect(res.status).toBe(404);
  });
});
