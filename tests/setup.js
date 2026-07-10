// Runs after every test in every test file. The order repository is a
// module-level singleton (src/repositories/orderRepository.js), so without
// this, orders created in one test file would still be visible to the next
// one that happens to run in the same worker.
const { orderRepository } = require('../src/repositories/orderRepository');

afterEach(() => {
  orderRepository.clear();
});
