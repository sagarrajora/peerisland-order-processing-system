# Phase 4 — Review Pass

A strict-senior-engineer pass over the codebase as it stood after Phase 3
(commit `ee97cce`), checking specifically for: missing input validation,
status-transition bugs, race conditions between the background job and
cancel, error responses that leak internals, dead code, and anything that
would fail under concurrent requests. Each finding below is tagged **Fixed**
(code changed on this branch) or **Documented** (real but not actionable
without speculative work the codebase doesn't need yet).

## Fixed

### 1. `totalAmount` computed with raw floating-point arithmetic
**File:** `src/services/orderService.js:14-18` (`placeOrder`, before this fix)

`items.reduce((sum, item) => sum + item.quantity * item.price, 0)` is exposed
directly as `totalAmount` with no rounding. Ordinary, non-adversarial input
reproduces the classic binary floating-point error:

```
POST /orders { items: [{ quantity: 3, price: 1.1, ... }] }
=> totalAmount: 3.3000000000000003
```

A dollar amount with a 17-digit decimal tail will fail exact-match assertions
in any client or downstream test, and is not fit to display or persist as
money.

**Fix:** added `roundToCents()` and applied it to the computed total
(`src/services/orderService.js:10-18`). Regression test added:
`tests/orders.create.test.js` — "rounds totalAmount to the nearest cent
despite floating-point sums".

### 2. Background job's catch-all hid real bugs behind the expected race-skip
**File:** `src/jobs/processPendingOrdersJob.js:29-35` (`runOnce`, before this
fix)

```js
try {
  orderService.updateOrderStatus(order.id, ORDER_STATUS.PROCESSING);
  transitioned += 1;
} catch (err) {
  console.warn(`[processPendingOrdersJob] skipped order ${order.id}: ${err.message}`);
}
```

The only error this loop is *supposed* to swallow is a `ConflictError` from
an order that got cancelled between the snapshot and the write (see Phase 2 /
README "Background job" section for why that's safe to skip). But the catch
block had no `instanceof` check, so a genuine bug — a `TypeError` from a bad
order shape, a `NotFoundError` if a delete endpoint is ever added, anything —
would be logged at the same `console.warn` level with the same wording as a
routine, expected skip. In production that's the kind of thing nobody
notices until orders have silently stopped processing for a real reason.

**Fix:** the catch block now checks `err instanceof ConflictError` and only
treats that case as an expected skip (`console.warn`); anything else is
logged with `console.error` and a distinct "unexpected error" message
(`src/jobs/processPendingOrdersJob.js:32-41`). The loop still continues
either way — one bad order still shouldn't abort the whole run — but the two
situations are no longer indistinguishable in the logs.

## Documented (no code change)

### 3. `updateOrderStatus` / `cancelOrder`'s read-then-write assumes a synchronous repository
**File:** `src/services/orderService.js:45-63`

Both functions do `getOrder(id)` (a read) followed by `applyStatusChange`
(a write), with no atomicity guarantee beyond "nothing else can run in
between." That's true today only because `InMemoryOrderRepository` is fully
synchronous and JavaScript doesn't preempt synchronous code — two concurrent
`PATCH` requests for the same order literally cannot interleave mid-function.
The moment the repository interface gets a real, `async` implementation
(the stated future-DB seam — see README "Repository interface"), an `await`
appears between the read and the write, and this pattern becomes a genuine
lost-update race for concurrent requests against the same order. Nothing to
fix now — the repository is synchronous and the interface doesn't promise
otherwise — but whoever writes the DB-backed repository needs to either wrap
the read+check+write in a transaction/row lock, or add an optimistic check
(e.g. compare `updatedAt`) before saving. Flagging so it isn't rediscovered
the hard way in production.

### 4. `validateQuery`'s `req.query = result.data` depends on Express 4 semantics
**File:** `src/middleware/validate.js:18-27`

Reassigning `req.query` works because Express 4 (`^4.19.2` in `package.json`,
`4.22.2` installed) exposes it as a plain mutable property. In Express 5,
`req.query` is a getter with no setter, and this exact line throws
`TypeError: Cannot set property query of #<IncomingMessage> which has only a
getter`. Not a bug against the pinned dependency, but a known break-on-upgrade
trap worth knowing about before bumping the major version — the fix at that
point is to validate into a new property (e.g. `req.validatedQuery`) instead
of overwriting `req.query`.

### 5. Two exports with no consumers outside their own module
**Files:** `src/repositories/orderRepository.js:38` (`InMemoryOrderRepository`
class) and `src/models/orderStatus.js:27` (`ALLOWED_TRANSITIONS`)

Both are exported alongside the thing that actually gets used
(`orderRepository` singleton, `canTransition()`), but nothing in `src/` or
`tests/` imports the class or the raw map directly. Harmless — the class
export gives tests a way to build a fresh repository instance instead of
relying on the shared singleton's `.clear()`, and the transitions map is a
reasonable thing to expose as documentation of the single source of truth —
but noting it as the closest thing to "dead code" in the codebase.

## Checked, no issue found

- **Input validation:** every client-controlled field (`customerId`, each
  item's `productId`/`quantity`/`price`, the status-update body, the list
  query filter) goes through a Zod schema before reaching a controller. No
  gaps found.
- **Status-transition bugs:** `ALLOWED_TRANSITIONS` only encodes the forward
  pipeline; `CANCELLED` is unreachable from the generic `PATCH` endpoint
  (regression-tested); backward and skip transitions are rejected with 409.
  No gaps found.
- **Race conditions, job vs. cancel:** covered by design (Phase 2) and by a
  targeted test that mocks `updateOrderStatus` to inject a cancel mid-run
  (`tests/backgroundJob.test.js`). No gap found beyond the async-repository
  caveat in finding 3 above.
- **Error responses leaking internals:** `errorHandler` only ever serializes
  `{ code, message }` from `AppError` subclasses for expected errors, and a
  fixed generic message for anything else; the raw error (with stack) goes to
  `console.error`, never to the response body. No gap found.
- **Concurrent requests (current implementation):** synchronous, single-
  threaded, in-memory — by construction there's no interleaving within a
  single request's handler, so no active concurrency bug exists in the code
  as deployed today. See finding 3 for the one place this stops being true
  once the repository is no longer synchronous.
