function validOrderPayload(overrides = {}) {
  return {
    customerId: 'cust-1',
    items: [{ productId: 'p1', quantity: 2, price: 9.5 }],
    ...overrides,
  };
}

module.exports = { validOrderPayload };
