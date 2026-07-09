// Repository interface consumed by the service layer:
//   save(order)          -> persists (insert or update) and returns the order
//   findById(id)         -> returns the order or null
//   findAll(status?)     -> returns all orders, optionally filtered by status
//
// This in-memory implementation is the only one that exists today. A
// database-backed repository can replace it without touching services or
// controllers as long as it implements the same three methods.
class InMemoryOrderRepository {
  constructor() {
    this.orders = new Map();
  }

  save(order) {
    this.orders.set(order.id, order);
    return order;
  }

  findById(id) {
    return this.orders.get(id) || null;
  }

  findAll(status) {
    const result = [];
    for (const order of this.orders.values()) {
      if (!status || order.status === status) {
        result.push(order);
      }
    }
    return result;
  }

  clear() {
    this.orders.clear();
  }
}

module.exports = { InMemoryOrderRepository, orderRepository: new InMemoryOrderRepository() };
