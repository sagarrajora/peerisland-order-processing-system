const request = require('supertest');
const createApp = require('../src/app');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

describe('GET /orders/:id', () => {
  it('returns the order when it exists', async () => {
    const created = await request(app).post('/orders').send(validOrderPayload());

    const res = await request(app).get(`/orders/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 with a JSON error body when the order does not exist', async () => {
    const res = await request(app).get('/orders/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
