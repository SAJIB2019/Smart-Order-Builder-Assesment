# Smart Order Builder

Smart Order Builder is a browser-only staff ordering application for the DevsStream Limited frontend assessment. It builds configurable breakfasts from API-provided menu data, validates generic rules, reserves shared ingredient stock, computes exact promotional pricing, checks out persistent JSON orders, and answers deterministic sales questions through Gemini function calling.

`Assesment.pdf` is the product source of truth. [ANSWERS.md](./ANSWERS.md) contains the eight required code-generated answers, [DECISIONS.md](./DECISIONS.md) records D1–D6 and C1–C2, and [TEST_REPORT.md](./TEST_REPORT.md) records TC-01–TC-20.

## Technology stack

- React 19 with strict TypeScript
- Vite 8
- MSW 2 for the browser mock API and Node test interception
- IndexedDB for authoritative same-origin persistence and cross-tab transaction serialization
- Vitest, React Testing Library, jest-dom, fake IndexedDB, and V8 coverage
- ESLint and Prettier
- Google Gemini SDK with a Flash model and function calling
- Lightweight responsive CSS

There is no real backend. MSW handlers call typed mock-server services, which call the same pure domain engines used by tests.

## Setup

Requirements: a current Node.js release compatible with the lockfile and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the URL printed by Vite. The browser MSW server starts in development and production/preview builds, so the order builder works without Gemini; the sales assistant requires a task-scoped Gemini key.

## Environment variables

`.env.example` intentionally contains only:

```dotenv
VITE_GEMINI_API_KEY=
```

Put a real key only in `.env.local`, which is ignored by Git. Because Vite exposes `VITE_` variables to browser code, this key is visible to the browser user; that is an assessment-specific compromise, not a production secret-management design.

## Commands

| Command                 | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`           | Start Vite development mode with browser MSW.                                   |
| `npm run build`         | Run strict type checking and create the production bundle.                      |
| `npm run preview`       | Preview the production bundle locally.                                          |
| `npm run typecheck`     | Run TypeScript without emitting files.                                          |
| `npm run lint`          | Run ESLint with zero warnings allowed.                                          |
| `npm run format:check`  | Check repository formatting.                                                    |
| `npm run test`          | Run all deterministic Vitest/RTL tests.                                         |
| `npm run test:watch`    | Run Vitest in watch mode.                                                       |
| `npm run test:coverage` | Run the suite with V8 coverage.                                                 |
| `npm run answers`       | Exhaustively compute and print Q1–Q8 from production engines and official data. |

## Architecture

The project is a small layered frontend:

```text
React features and hooks
        ↓ typed ApiClient
MSW HTTP handlers
        ↓
Cart/Order mock-server services
        ↓
Pure rules, stock, pricing, order, and statistics functions
        ↓
IndexedDB authoritative state (in-memory adapter in focused tests)
```

- `src/domain/` contains framework-free calculations and types.
- `src/mocks/fixtures/` is the only assessment-specific menu/stock definition.
- `src/mocks/services/` owns authoritative cart, reservation, and checkout transactions.
- `src/mocks/store/` provides persistent IndexedDB and deterministic in-memory adapters.
- `src/mocks/handlers/` exposes those services over MSW endpoints.
- `src/services/api/` is the typed browser client.
- `src/features/` and `src/hooks/` own presentation and interaction state without duplicating domain calculations.
- `src/services/gemini/` owns model selection, tool execution orchestration, and provider error mapping.

## Rules engine

`validate(config, groups, rules)` is pure and data-driven. It validates unknown IDs and quantities, then evaluates `min`, `max`, `step`, `maxDistinct`, `maxPerOption`, `requires`, `excludes`, and `overrideLimit`, returning every violation with its group or rule identifier. Components render the returned violations and use `canAddToCart`; they contain no Croissant, Tofu, Hollandaise, or other fixture-specific branches.

## Stock engine

Stock is tracked by ingredient, so options that consume the same ingredient compete for one finite quantity. Pure functions aggregate recipes, multiply usage by cart quantity, report all shortages, calculate additional capacity, compute edit net differences, and atomically apply or release allocations. Unlimited stock is a discriminated value rather than a large sentinel number, and failed mutations return the original snapshot.

## Pricing engine

Money is integer poisha. `priceCart(cart, menu, promos, serverTime)` applies the required order: unit subtotal, P2 cheapest-free Extras, P1 combo percentage, cart quantity, larger of C1/C2 with C1 winning ties, VAT, then final whole-BDT rounding. Percentage calculations use exact integer/BigInt half-up arithmetic; only the final payable rounds to whole BDT. The `/price` endpoint adds injectable latency/failure behavior, while the hook combines a 300 ms debounce, aborts, generation keys, configuration identity, and echoed request IDs so stale responses cannot overwrite current prices.

## Reservation lifecycle and server clock

Add to Cart validates the configuration and computes the full allocation before committing one cart item, reservation, stock snapshot, and idempotency record. A reservation expires exactly five minutes after mock-server time; expiry releases active stock once, marks the item read-only, rejects edits, and still allows removal. Checkout converts active reservations to sold stock, which expiry cleanup never releases.

The injected server clock defaults to 90 seconds ahead of the browser. API responses include `serverTime`; the client derives an offset and calculates countdowns from synchronized server time rather than raw browser `Date.now()`.

## Race-condition handling

The browser mock server stores one authoritative state record in IndexedDB. Every reserve, edit, remove, expiry, seed initialization, and checkout uses one IndexedDB `readwrite` transaction, so same-origin tabs serialize read-modify-write operations against the latest committed state. Each cart mutation also sends the last cart version seen by that tab; the server validates it inside the same transaction and returns HTTP 409 with the current version instead of overwriting a newer cart. The client then reloads authoritative cart and inventory state and asks the user to review and retry. BroadcastChannel only announces committed changes; it is not the lock or the conflict decision-maker.

## Idempotency

The client creates one key per logical Add or Pay operation and reuses it for repeated clicks and retries. The mock server stores a request fingerprint and result identity in the same transaction as the successful mutation. An exact replay returns the original item or order; the same key with different input returns an idempotency conflict; failures before commit leave no record and remain retryable.

## Gemini function calling

The assistant follows this flow:

```text
question → Gemini selects one allowlisted tool → TypeScript validates arguments
         → latest persisted orders are loaded → pure statistics function runs
         → only the compact computed result returns to Gemini for phrasing
```

Gemini never receives raw orders for arithmetic. Tool names and arguments use a closed registry, unsupported customer questions return a deterministic limitation directly from TypeScript, and every automated test injects a mocked model client. The client uses `gemini-3.5-flash-lite`, retries a provider `503` once with `gemini-3.1-flash-lite`, preserves the provider's signed function-call part for the result turn, and reports persistent high demand clearly. Missing keys, invalid keys, quota/429 responses, service unavailability, network failures, invalid tool calls, and unexpected responses have distinct handling and Retry states.

## Persistence and order JSON

The six supplied seed orders load exactly once and are priced at their historical `createdAt` timestamps without consuming current inventory. Successful checkout stores an immutable, schema-versioned order snapshot containing BDT/poisha metadata, menu labels/prices, line configurations, the authoritative pricing breakdown, payment label, and separate attempted-versus-applied coupon fields. IndexedDB preserves orders and reservations across refreshes; the first authoritative transaction after reload expires overdue holds once and retains still-valid holds. Download `orders.json` exports the documented order envelope.

The unfinished builder configuration is stored separately in versioned local-storage JSON. On reload it is parsed defensively and revalidated against the current API menu rules and ingredient stock before display. An incomplete or newly out-of-stock draft remains editable but cannot be submitted, an unknown/malformed option draft is discarded, and restoring a draft never creates a reservation or changes server stock.

## Trade-offs

- A browser-only mock server satisfies the brief and keeps the solution deployable as static assets, but it cannot provide cross-device or hostile-client guarantees.
- IndexedDB transactions provide genuine same-browser/origin serialization; BroadcastChannel improves freshness but cannot coordinate different browsers or devices.
- Optimistic cart versions reject stale writes clearly, at the cost of asking the losing tab to review and retry against the reloaded cart.
- Checkout-time price locking keeps coupon cutoffs correct and preserves immutable historical totals, while cart totals remain estimates until Pay succeeds.
- Exhaustive answer generation favors explainable correctness over speed; Q2 evaluates over 1.3 million bounded candidates through the real engines and takes several seconds.
- Calling Gemini directly from the browser is simple for the assessment but exposes the task-scoped key. A production system should proxy calls through a secured backend.

## Known limitations

- There is no real authentication, payment processing, backend database, or cross-device synchronization.
- Automated tests mock Gemini deterministically. A live development-browser smoke test on 2026-11-26 verified order-count and total-revenue function calls, but provider capacity remains externally controlled.
- Persisted schemas are versioned; the newly added cart version defaults safely for pre-bonus IndexedDB records, but there is no general multi-version migration framework.
- In environments without IndexedDB, the fallback store is explicitly single-context and in-memory.
- The assessment filename remains `Assesment.pdf` to preserve the supplied artifact.

## Unfinished features

Parts A–G are implemented and all mandatory acceptance tests pass. Submission is still blocked until the author personally reviews D1–D6 and C1–C2 in `DECISIONS.md`; repository push, deployment, placing the task-only Gemini key in the submission form, and the one-shot submission are intentionally left to the user and require explicit permission.

## Verification and time record

The final independent requirement audit is in [FINAL_AUDIT.md](./FINAL_AUDIT.md), with exact acceptance evidence in [TEST_REPORT.md](./TEST_REPORT.md). Run the commands above in the current checkout for reproducible results; live Gemini smoke-test evidence remains separate from deterministic automated verification.

Actual implementation hours were not reliably recorded, so this README does not invent an estimate.
