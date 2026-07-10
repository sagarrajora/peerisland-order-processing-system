const request = require('supertest');
const createApp = require('../src/app');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

async function createOrder() {
  const res = await request(app).post('/orders').send(validOrderPayload());
  return res.body;
}

describe('POST /orders/:id/cancel', () => {
  it('cancels a PENDING order', async () => {
    const order = await createOrder();

    const res = await request(app).post(`/orders/${order.id}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('returns 409 when the order is PROCESSING', async () => {
    const order = await createOrder();
    await request(app).patch(`/orders/${order.id}/status`).send({ status: 'PROCESSING' });

    const res = await request(app).post(`/orders/${order.id}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/PROCESSING/);
  });

  it('returns 409 when the order is SHIPPED', async () => {
    const order = await createOrder();
    await request(app).patch(`/orders/${order.id}/status`).send({ status: 'PROCESSING' });
    await request(app).patch(`/orders/${order.id}/status`).send({ status: 'SHIPPED' });

    const res = await request(app).post(`/orders/${order.id}/cancel`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/SHIPPED/);
  });

  it('returns 404 when the order does not exist', async () => {
    const res = await request(app).post('/orders/does-not-exist/cancel');

    expect(res.status).toBe(404);
  });
});
