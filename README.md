# Order Processing System

A REST API for an e-commerce order processing system: place orders, look them
up, list/filter them, and move them through a status lifecycle.

> **Status:** Phase 1 (scaffold + core API) complete. Phase 2 (background job)
> and Phase 3 (test suite) land in follow-up commits — see
> `peerislands-assignment-prompt.md` for the phase breakdown and `AI_USAGE.md`
> for the AI-assistance log.

## Stack

- Node.js 20+, Express
- Zod for request validation
- In-memory data store behind a repository interface (see below)
- Jest + Supertest for tests (added in Phase 3)

## Setup

```bash
npm install
npm start        # node src/server.js
npm run dev       # node --watch src/server.js (auto-restart)
npm test          # jest
```

The server listens on `PORT` (default `3000`).

## Project structure

```
src/
  routes/          Express route definitions
  controllers/      Thin HTTP layer: parse request, call service, shape response
  services/         All business logic (validation of business rules, status transitions)
  repositories/      Persistence, currently in-memory
  models/            Order status enum + allowed transitions (single source of truth)
  validation/         Zod schemas for request bodies/queries
  middleware/         validate(), centralized errorHandler
  jobs/              Background jobs (Phase 2)
tests/               Jest + Supertest suite (Phase 3)
```

Business logic lives in `services/`, not `controllers/` — controllers only
translate HTTP <-> service calls.

## Data model

```
Order {
  id: string (uuid)
  customerId: string
  items: [{ productId: string, quantity: number, price: number }]
  totalAmount: number       // computed server-side from items, never trusted from the client
  status: PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED
  createdAt: string (ISO 8601)
  updatedAt: string (ISO 8601)
}
```

Status transitions are enforced by `src/models/orderStatus.js`:

```
PENDING -> PROCESSING -> SHIPPED -> DELIVERED
```

`CANCELLED` is reachable only from `PENDING`, and only through the dedicated
`POST /orders/:id/cancel` endpoint — it is intentionally excluded from the
generic transition map so `PATCH /orders/:id/status` can never be used to
cancel an order or move it out of `CANCELLED`/`DELIVERED`.

## API

All error responses share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Codes used: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `CONFLICT` (409),
`INTERNAL_ERROR` (500).

### Create an order

`POST /orders`

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
        "customerId": "cust-1",
        "items": [
          { "productId": "p1", "quantity": 2, "price": 9.5 }
        ]
      }'
```

`201 Created` with the order (status `PENDING`, `totalAmount` computed as
`sum(quantity * price)`). `400 VALIDATION_ERROR` if `items` is empty/missing,
or any item has non-positive `quantity` or negative `price`.

### Get an order

`GET /orders/:id` -> `200` with the order, or `404 NOT_FOUND`.

### List orders

`GET /orders` -> all orders.
`GET /orders?status=PENDING` -> orders filtered by status.
`400 VALIDATION_ERROR` if `status` isn't one of the five valid values.

### Update order status

`PATCH /orders/:id/status`

```bash
curl -X PATCH http://localhost:3000/orders/<id>/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "PROCESSING" }'
```

`200` on a valid forward transition. `409 CONFLICT` on an invalid one (e.g.
`PENDING -> DELIVERED`), with a message naming the current status.
`400 VALIDATION_ERROR` if `status` isn't a recognized value.

### Cancel an order

`POST /orders/:id/cancel` -> `200` with status `CANCELLED`, only if the order
is currently `PENDING`. Otherwise `409 CONFLICT` naming the current status.

## Design decisions

- **Repository interface.** `src/repositories/orderRepository.js` exposes only
  `save(order)`, `findById(id)`, and `findAll(status?)`. The service layer
  depends on that interface, not on the in-memory `Map` behind it, so a real
  database-backed repository can be dropped in later by implementing the same
  three methods — no changes needed in `services/` or `controllers/`.
- **`totalAmount` is server-computed.** The client sends `items`; the server
  derives the total. This avoids trusting a client-supplied total that could
  be manipulated or drift from the actual item prices.
- **Cancellation is not a status transition.** `ALLOWED_TRANSITIONS` in
  `src/models/orderStatus.js` only encodes the forward pipeline
  (`PENDING -> PROCESSING -> SHIPPED -> DELIVERED`). Cancelling is a separate
  service function with its own `PENDING`-only guard, reached only via
  `POST /orders/:id/cancel`. This keeps `PATCH /orders/:id/status` simple
  (forward-only) and makes the cancel rule impossible to bypass through the
  generic status endpoint.
- **Zod for validation**, not hand-rolled `if` checks, so every rule
  (non-empty items, positive quantity, non-negative price, valid enum values)
  is declared once as a schema and reused by a small `validateBody`/
  `validateQuery` middleware pair.

## Adding authentication (not implemented)

No auth is required for this assignment, but the seam is already there:

- Add an `authenticate` middleware (e.g. verifying a JWT bearer token) mounted
  in `src/app.js` ahead of `orderRoutes`, populating `req.user`.
- Scope orders to their owner by filtering `findAll`/`findById` by
  `req.user.id` in the service layer (or by adding a `customerId` check
  before returning an order in `getOrder`), so customers can only see and
  cancel their own orders.
- Add an `authorize(role)` middleware for any admin-only routes (e.g. an
  admin being allowed to move any order to any status).
