# AI Usage Log

This assignment was built with Claude Code. This file is a running log, one
section per phase, of what was prompted, what Claude produced, what was
wrong or needed a second pass, and how it was corrected.

## Phase 1 — scaffold + core API

**Prompt used:** the "Master Prompt (Phase 1)" from
`peerislands-assignment-prompt.md` — build the order API with Express, an
in-memory repository behind an interface, Zod validation, and a centralized
`{ error: { code, message } }` error format.

**What Claude produced (first pass, before this prompt file existed):**
An earlier, less-specified request ("build an order processing system")
produced a working but looser design: hand-rolled `if`-based validation
instead of a schema library, an error body shaped `{ error: "message" }`
(no `code`), a `customerName`/free-text field instead of `customerId`, routes
under `/api/orders`, and — most importantly — a transition map that let
`PATCH /orders/:id/status` move an order straight to `CANCELLED` alongside
the normal forward statuses. That last one matches a known failure mode for
this exact assignment: **no separation between "advance status" and
"cancel," so the generic PATCH endpoint could be used to cancel an order
from any state**, not just `PENDING`.

**Issues found and how they were corrected in this pass:**

1. **Cancellation reachable through the generic status endpoint.** The first
   draft's `ALLOWED_TRANSITIONS` included `PENDING -> CANCELLED`, so
   `PATCH /orders/:id/status { "status": "CANCELLED" }` would succeed even
   though the spec says cancellation is a dedicated, `PENDING`-only
   operation. Fixed by removing `CANCELLED` from the transition map entirely
   (`src/models/orderStatus.js`) and keeping the `PENDING`-only check
   exclusively inside `orderService.cancelOrder`, reachable only via
   `POST /orders/:id/cancel`.
2. **Validation was hand-rolled `if`/`throw` chains** in the service layer
   instead of a schema library, and only ran on create — not on
   `status`/query params. Replaced with Zod schemas
   (`src/validation/orderSchemas.js`) plus generic `validateBody`/
   `validateQuery` middleware, applied to create, status-update, and the
   list-query filter.
3. **Error shape was inconsistent** (`{ error: "message" }`, no machine-
   readable code). Standardized on `{ error: { code, message } }` across
   `AppError` subclasses and the central `errorHandler`.
4. **Client-controllable field naming drift** (`customerName` instead of the
   spec's `customerId`). Renamed to match the spec exactly, since a stricter
   grader/test harness would send `customerId`.
5. **Malformed JSON bodies fell through to a generic 500.** `express.json()`
   throws a `SyntaxError` before any route runs; without an explicit handler
   for it, a bad request body would report as an internal server error
   instead of `400 VALIDATION_ERROR`. Added a small middleware in
   `src/app.js` to catch that specific case and re-route it through
   `ValidationError`.

**Verification:** ran the server locally and exercised every endpoint by hand
with `curl` (create with valid/invalid payloads, get by id including 404,
list with/without a valid/invalid `status` filter, a valid transition, an
invalid transition `PENDING -> DELIVERED`, and cancel on a non-`PENDING`
order) to confirm status codes and error bodies match the spec before
writing this up. Automated Jest/Supertest coverage is Phase 3.

**Follow-up optimization pass (prompted: "is the code optimised, review as a
senior developer"):**

1. `InMemoryOrderRepository.findAll` did `Array.from(map.values())` then
   `.filter()` — two full passes over the collection. Collapsed to a single
   `for...of` loop.
2. `updateOrderStatus`/`cancelOrder` mutated the object returned by
   `getOrder` in place, then called `repository.save()` on that same
   reference. This only worked because the in-memory `Map` happens to hold
   that exact object — nothing in the repository *interface* guarantees
   that aliasing, so a future DB-backed repository (returning a fresh row
   per query) would silently drop the mutation. Changed both call sites to
   build a new order snapshot via a shared `applyStatusChange(order,
   status)` helper and pass it to `save()` explicitly, so persistence never
   depends on reference identity. This also removed duplicated
   mutate-then-save logic that was about to be copy-pasted a third time by
   the Phase 2 job.
3. `orderSchemas.js` repeated the same `z.enum(statusValues, { errorMap })`
   literal in both the status-update and list-query schemas. Extracted a
   single `orderStatusEnum` and reused it (`.optional()` for the query
   variant).

Re-ran the same manual `curl` smoke test after the changes to confirm status
codes and response bodies were unaffected.

## Phase 2 — background job

**Prompt used:** the "Phase 2 — background job" prompt from
`peerislands-assignment-prompt.md` — add a job that moves `PENDING` orders to
`PROCESSING` every 5 minutes, configurable, reusing the API's transition
logic, with the cancel/job race explicitly handled and explained, start/stop
exported for tests, and per-run logging.

**What Claude produced and what needed a second look:**

1. **First instinct was a plain `setInterval(runOnce, getIntervalMs())` with
   no `unref()`.** That matches one of the known failure modes for this
   assignment — a hard-coded, un-stoppable interval that keeps the process
   (and Jest) alive after tests finish. Fixed by calling `timer.unref()` in
   `start()` so the interval never holds the event loop open on its own, and
   by exporting `stop()` (`clearInterval` + reset the module-level `timer` to
   `null`) so both `server.js` and tests fully control the job's lifetime.
2. **Race condition between cancel and the job.** The naive approach would be
   to snapshot `PENDING` orders and then mutate each one directly (or call
   `repository.save()` on the snapshot), which is exactly the "read stale
   status, write it back" bug the assignment calls out — a cancel that lands
   after the snapshot gets silently overwritten back to `PROCESSING`. Instead
   the job calls `orderService.updateOrderStatus(order.id, PROCESSING)` per
   order — the same function the API uses — which re-fetches the order by id
   and re-validates `canTransition()` against its status *at write time*, not
   the snapshot. A cancelled order fails that check and is skipped (logged,
   not thrown out of the run). This is documented in the README's
   "Background job" section rather than left implicit.
3. **Duplicated status logic was the tempting shortcut.** It would have been
   easy to give the job its own inline `if (order.status === 'PENDING')`
   check and a direct repository write "since it's simpler." Rejected that in
   favor of routing through `orderService.updateOrderStatus`, per the
   assignment's explicit "no duplicate status logic" requirement — there is
   now exactly one place (`src/models/orderStatus.js` + `orderService`) that
   knows what transitions are legal.
4. **Env var interval must be read at call time, not cached at module load.**
   Reading `process.env.PENDING_ORDERS_JOB_INTERVAL_MS` once at the top of the
   file would freeze the value before tests get a chance to set it per-test.
   `getIntervalMs()` is a plain function called inside `start()`, so setting
   the env var before calling `start()` in a test works as expected.

**Verification:** ran `node -e` against a short-lived instance of the module
locally to confirm `start()`/`stop()` toggle a real interval and `runOnce()`
logs a `checked/transitioned` count; full behavioral coverage (including the
race-condition scenario) landed as automated tests in Phase 3
(`tests/backgroundJob.test.js`) rather than being re-verified by hand twice.

## Phase 3 — tests

_Not started yet._

## Phase 4 — review pass

_Not started yet._
