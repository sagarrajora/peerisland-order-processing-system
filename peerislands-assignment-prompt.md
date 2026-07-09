# Prompt for PeerIslands Take-Home (Order Processing System, Node.js)

Use in Cursor / ChatGPT. Run the phases as separate prompts, not one giant one — you get better code and a real AI-usage story for the writeup.

---

## Master Prompt (Phase 1 — scaffold + core API)

You are a senior Node.js backend engineer. Build an E-commerce Order Processing System as a REST API.

**Stack:** Node.js 20+, Express, in-memory data store behind a repository interface (so it can be swapped for a DB later — state this in the README), Jest + Supertest for tests.

**Project structure:** `src/routes`, `src/controllers`, `src/services`, `src/repositories`, `src/jobs`, `tests/`. Keep business logic in services, not controllers.

**Endpoints:**

1. `POST /orders` — create an order with `customerId` and `items[]` (each item: `productId`, `quantity`, `price`). Validate: items non-empty, quantity > 0, price >= 0. New orders start as `PENDING`. Compute and store `totalAmount`. Return 201 with the order.
2. `GET /orders/:id` — return the order or 404 with a JSON error body.
3. `GET /orders` — list all orders; optional `?status=` query filter. Reject invalid status values with 400.
4. `PATCH /orders/:id/status` — update status. Enforce valid transitions only: PENDING → PROCESSING → SHIPPED → DELIVERED. Reject invalid transitions with 409 and a message stating the current status.
5. `POST /orders/:id/cancel` — cancel only if status is `PENDING`; set status to `CANCELLED`. Otherwise 409.

**Rules:**
- Statuses: PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED. Define as a constant/enum in one place.
- Orders have `id` (uuid), `customerId`, `items`, `totalAmount`, `status`, `createdAt`, `updatedAt`.
- Centralized error-handling middleware; consistent JSON error format `{ error: { code, message } }`.
- Input validation with a library (zod or joi), not hand-rolled ifs.
- No auth required, but note in README how it would be added.

Deliver: full code, `package.json` with scripts (`start`, `dev`, `test`), and a README covering setup, API docs with example requests, and design decisions.

---

## Phase 2 — background job

Add a background job that runs every 5 minutes and moves all `PENDING` orders to `PROCESSING`.

Requirements:
- Implement as a separate module in `src/jobs` with the interval configurable via env var (default 5 min) so tests don't wait 5 minutes.
- The job must reuse the same service-layer transition logic as the API (no duplicate status logic).
- Handle the race condition: an order being cancelled while the job runs must not end up PROCESSING after CANCELLED. Explain how you prevent it.
- Start the job on server boot; export start/stop functions so tests can control it.
- Log each run: how many orders were transitioned.

---

## Phase 3 — tests

Write Jest + Supertest tests:
- Create order: success, empty items, invalid quantity/price.
- Get by id: found and 404.
- List: no filter, valid status filter, invalid status filter.
- Status transitions: each valid transition, at least two invalid ones (e.g. PENDING → DELIVERED, DELIVERED → SHIPPED).
- Cancel: succeeds on PENDING, returns 409 on PROCESSING/SHIPPED.
- Background job: using jest fake timers, verify PENDING → PROCESSING after the interval, and that CANCELLED/SHIPPED orders are untouched.

Target meaningful coverage of the service layer, not a coverage number.

---

## Phase 4 — review pass (run this against the generated code)

Review this codebase as a strict senior engineer. Find: missing input validation, status-transition bugs, race conditions between the background job and cancel, error responses that leak internals, dead code, and anything that would fail under concurrent requests. List each issue with file/line and the fix. Do not rewrite the whole project.

---

## AI-usage log (the part they actually grade)

Keep a running `AI_USAGE.md` as you go. For each phase record: the prompt you used, what the AI produced, what was wrong, how you fixed it. Things AI reliably gets wrong on this exact assignment — check for these and log them when they appear:

- No transition validation on PATCH (accepts DELIVERED → PENDING).
- Background job uses a hard-coded `setInterval(fn, 300000)` that can't be tested and never stops, keeping the process alive after tests finish.
- Cancel check and job transition do read-then-write without guarding, so a cancel during a job run gets overwritten.
- Validation only on create, not on status/query params.
- Tests that wait on the real 5-minute timer or share state between test files.

Fixing 3–4 of these and documenting them is a stronger submission than flawless-looking code with an empty log.
