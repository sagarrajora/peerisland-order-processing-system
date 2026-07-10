const request = require('supertest');
const createApp = require('../src/app');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

describe('GET /orders', () => {
  it('lists all orders when no filter is given', async () => {
    await request(app).post('/orders').send(validOrderPayload());
    await request(app).post('/orders').send(validOrderPayload());

    const res = await request(app).get('/orders');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by a valid status', async () => {
    const cancelled = await request(app).post('/orders').send(validOrderPayload());
    await request(app).post('/orders').send(validOrderPayload());
    await request(app).post(`/orders/${cancelled.body.id}/cancel`);

    const res = await request(app).get('/orders').query({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(cancelled.body.id);
  });

  it('rejects an invalid status filter with 400', async () => {
    const res = await request(app).get('/orders').query({ status: 'NOT_A_STATUS' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
