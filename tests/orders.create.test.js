const request = require('supertest');
const createApp = require('../src/app');
const { validOrderPayload } = require('./helpers/fixtures');

const app = createApp();

describe('POST /orders', () => {
  it('creates an order with computed totalAmount and PENDING status', async () => {
    const res = await request(app).post('/orders').send(validOrderPayload());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      customerId: 'cust-1',
      status: 'PENDING',
      totalAmount: 19,
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toBe(res.body.updatedAt);
  });

  it('rounds totalAmount to the nearest cent despite floating-point sums', async () => {
    const res = await request(app)
      .post('/orders')
      .send(validOrderPayload({ items: [{ productId: 'p1', quantity: 3, price: 1.1 }] }));

    expect(res.status).toBe(201);
    // 3 * 1.1 sums to 3.3000000000000003 in raw floating-point arithmetic.
    expect(res.body.totalAmount).toBe(3.3);
  });

  it('rejects an empty items array with 400', async () => {
    const res = await request(app).post('/orders').send(validOrderPayload({ items: [] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-positive quantity with 400', async () => {
    const res = await request(app)
      .post('/orders')
      .send(validOrderPayload({ items: [{ productId: 'p1', quantity: 0, price: 5 }] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a negative price with 400', async () => {
    const res = await request(app)
      .post('/orders')
      .send(validOrderPayload({ items: [{ productId: 'p1', quantity: 1, price: -1 }] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing customerId with 400', async () => {
    const payload = validOrderPayload();
    delete payload.customerId;

    const res = await request(app).post('/orders').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
