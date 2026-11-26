# Smart Order Builder — Progress Tracker

Last updated: 2026-11-26 (Asia/Dhaka)

## Current state

**Phase:** Parts A–G, acceptance verification, computed answers, and submission documentation complete.

| Area | Status | Evidence / next gate |
|---|---|---|
| Source review | Complete | All 4 scanned PDF pages visually inspected; `orders.seed.json` inspected. |
| Planning documents | Complete | `AGENTS.md`, `REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`, `DECISIONS.md`, `PROGRESS.md`. |
| Project foundation | Complete | React 19, strict TypeScript, Vite, MSW browser/Node wiring, Vitest/RTL, ESLint, Prettier, coverage, and lightweight CSS. |
| Domain/API foundation | Complete | Generic domain contracts, fixture, menu/stock/price/cart/inventory/reservation/checkout/order endpoints, typed client, server clock, and shared persistent IndexedDB store boundary. |
| D1–D6 | Complete | D1–D6 are resolved and implemented consistently. |
| C1 | Complete | Integer-poisha risk and TC-06 VAT half-up working documented before pricing code. |
| C2 | Complete | Eight supported tool contracts were documented before Gemini integration. |
| Part A | Complete | Pure validation and dynamic builder wiring render every violation and gate Add/Save; TC-01–TC-04 pass. |
| Part B | Complete | Shared ingredient calculations, per-option capacity controls, 1–3 item quantity, shortages, and authoritative edit transactions pass TC-08–TC-11. |
| Part C | Complete | Pure six-step engine, typed `/price`, exact simulated latency/failure defaults, debounced race-safe hook, Retry/preserved configuration UI, pricing breakdown, and TC-05–TC-07/TC-12 pass. |
| Part D | Complete | Atomic idempotent add/edit/remove/expiry, five-minute holds, server-offset countdowns, shared IndexedDB transactions, D1/D3, and TC-13–TC-15 pass. |
| Part E | Complete | Atomic Pay, sold-stock conversion, seed initialization/historical pricing, persistent versioned orders, JSON download, D4/D6, and TC-16–TC-17 pass. |
| Part F | Complete | Pure statistics, closed Gemini function calling, latest-order reads, chat/error/Retry UI, D5/C2, and TC-18–TC-20 pass. |
| Complete UI | Complete | Responsive builder, cart/edit/reservations, coupon-aware checkout, orders history/export, and assistant are connected to authoritative APIs. |
| Part G | Complete | Refresh-safe reservations, transactional cart versions/conflict reload, and revalidated unfinished drafts are implemented and deterministically tested. |
| Required `ANSWERS.md` | Complete | `npm run answers` computes Q1–Q8 from official data and production engines; Q3/Q8 include working. |
| Required final `README.md` | Complete | Setup, architecture, engines, concurrency, trade-offs, limitations, unfinished work, and time-record status documented. |
| Submission/deployment | Not authorized | Never push, deploy, paste keys, or submit without user permission. |

## Completed steps

### 2026-11-25 — Planning and traceability

- Confirmed the repository initially contains only `.git`, `.DS_Store`, `Assesment.pdf`, and `orders.seed.json`.
- Confirmed `Assesment.pdf` is a four-page image-only PDF; rendered and visually inspected every page because text extraction was unavailable.
- Extracted Parts A–G, Appendix A fixture/rules/stock, all six Appendix B seed orders, TC-01–TC-20, D1–D6, C1–C2, Q1–Q8, and all submission deliverables.
- Recorded ambiguities, missing files, technical risks, requirement-to-test ownership, and a simple layered architecture.
- Created persistent working rules and a sequential implementation plan.
- No application code, dependency files, secrets, or seed data were created or changed.

### 2026-11-25 — Project initialization

- Initialized a React 19.3.1 + Vite 8.3.8 application with TypeScript strict mode and a minimal responsive application shell.
- Added the requested domain, feature, mock-server, service, test, and script directory boundaries without implementing business logic.
- Configured MSW with one shared handler list, `setupWorker` for browser development, `setupServer` for automated tests, and the generated public service-worker asset.
- Configured Vitest 5.1.1, React Testing Library, jest-dom, jsdom, V8 coverage, deterministic test cleanup, and one shell smoke test.
- Configured ESLint 10, TypeScript ESLint, React Hooks/Refresh rules, Prettier, and lightweight CSS.
- Added all required npm scripts, `.gitignore`, and `.env.example` containing only `VITE_GEMINI_API_KEY=`.
- Preserved `Assesment.pdf`, `orders.seed.json`, and all planning documents. No decision, checkpoint, menu fixture, endpoint, or business engine was implemented.
- Registry compatibility note: current MSW 3.x/late 2.x depended on an unavailable `tldts-core@^7.5.6`; MSW 2.10.5 and jsdom 26.1.0 are pinned compatible releases. npm audit reports zero vulnerabilities.

### 2026-11-25 — TypeScript domain, fixture, and mock API foundation

- Added strict models for products, menus, groups/options, ingredients/consumption, configurations, group constraints, discriminated cross-group rules/promotions, cart items, reservations, stock allocations, pricing breakdowns, payment methods, runtime orders, and discriminated API responses/errors.
- Added a branded `Poisha` type with runtime enforcement of non-negative safe integers. No pricing engine was implemented; C1 remains unresolved.
- Transcribed the official Build Your Breakfast fixture in one assessment-specific module: base price, five groups, sixteen option IDs/prices/recipes, fourteen stock levels including explicit unlimited Ketchup/Chili, R1–R4, P2/P1/C1/C2, VAT, and rounding metadata.
- Added typed `GET /api/menu` and `GET /api/stock` MSW handlers shared by browser and Node tests, plus a typed API client.
- Added an injectable server clock with a default +90-second offset; every API success includes server time and store version metadata.
- Added a generic mock-store contract with snapshot reads, subscriptions, expected-version transactions, and explicit capability metadata. The current adapter is deliberately single-context/memory-only and does not claim that tabs share state.
- Kept D6 unresolved by defining `Order` only as a generic runtime aggregate; no persisted/export JSON order schema or behavior was implemented.
- Added focused unit/integration tests for exact fixture integrity, integer money, server clock, store capability/version behavior, and menu/stock API responses.

### 2026-11-25 — Part A generic rules engine

- Added pure `validate(config, groups, rules)` with typed, UI-ready `isValid`, `canAddToCart`, and complete violation output.
- Implemented data-driven `min`, `max`, total-multiple `step`, `maxDistinct`, `maxPerOption`, `requires`, `excludes`, and `overrideLimit`; active overrides replace base maxima.
- Added runtime boundary violations for unknown option IDs and non-integer, negative, or unsafe quantities without allowing bad values into rule calculations.
- Kept all assessment-specific IDs and definitions out of the engine. An alternate fixture with entirely different IDs verifies that rules are interpreted from supplied data.
- Added focused unit coverage for valid/invalid configurations, all supported constraints and rules, simultaneous violations, inclusive boundaries, boundary input errors, and override metadata.
- Added immutable official acceptance coverage for TC-01, TC-02, TC-03, and TC-04 with exact configurations, messages, identifiers, and complete violation arrays.
- No stock, pricing, reservation, cart mutation, checkout, Gemini, or builder UI behavior was implemented.

### 2026-11-25 — Part B ingredient-based shared stock engine

- Re-read the scanned PDF's Part B, D1, Appendix A stock/recipes, and TC-08–TC-11 before implementation.
- Added pure functions for aggregated configuration requirements, cart-quantity multiplication, remaining stock, per-option additional capacity, complete availability/shortage checks, net allocation differences, allocation application, safe release, and atomic edit swaps.
- Stock is keyed only by ingredient ID. Duplicate allocation entries are normalized, different options can share one ingredient, and unlimited availability remains explicit and unchanged by apply/release operations.
- Runtime cart quantity is restricted to integer values 1–3. Invalid allocations, over-release attempts, insufficient stock, and failed edits return the original stock snapshot without partial changes or negative quantities.
- Added a D1 draft proposing versioned atomic saves, preserved edit drafts, authoritative refresh, exact shortage messaging, and adjust/retry recovery. It remains explicitly unapproved and no cross-tab UX or transaction transport was implemented.
- Added unit coverage for shared egg use, unlimited stock, capacity, quantity changes, unchanged edits, failed edits, complete shortages, valid/invalid releases, duplicate normalization, malformed input, and a fixture with different option/ingredient IDs.
- Added domain acceptance coverage for TC-08 through TC-11. TC-10's price remains pending Part C, and all authoritative API transaction wiring remains pending Part D.

### 2026-11-25 — Part C pure pricing engine

- Re-read all four scanned PDF pages, including the exact C1 wording, six pricing steps, D2, Appendix A prices, and TC-05–TC-07.
- Completed C1 before pricing code: documented binary floating-point risk and the manual TC-06 calculation `150,950 × 500 / 10,000 = 7,547.5 → 7,548` poisha VAT.
- Resolved D2 by locking authoritative totals at successful checkout. Preview/cart totals remain estimates repriced with current server time; historical seeds use `createdAt`.
- Added pure `priceCart(cart, menu, promos, serverTime)` driven by supplied menu groups/options, promotion definitions, pricing policy, coupon code, cap, cutoff time zone, and tie priorities.
- Added exact integer/BigInt half-up helpers. Every percentage rounds to poisha; only final payable rounds to a 100-poisha whole-BDT boundary.
- Added typed line/cart breakdowns, all eligible cart-discount candidates, and attempted/matched/eligible/applied coupon status.
- Added unit coverage for subtotals, single/multiple cheapest-free units, combo thresholds, promotion order, quantities, cart thresholds, caps, ties, cutoff, VAT/final rounding, historical timestamps, unknown coupons, and an alternate-ID promotion fixture.
- Added exact official acceptance coverage: TC-05 A = 38,000, B = 67,950, C = 49,000 poisha; TC-06 payable = 158,500 poisha; TC-07 payable = 163,700 poisha.
- Investigated one initial unit-test discrepancy: Omelette ×2 consumes four egg ingredients but counts as only two Eggs-group units, so the combo correctly remained ineligible until Fried ×2 was added to meet the configured group threshold.

### 2026-11-25 — Part C asynchronous price preview

- Added typed `POST /price`, which calls the existing pure `priceCart` engine with the mock store's menu/promotions and injectable server clock.
- Added exact production-like defaults of 200–1500 ms latency and 15% failure, with an injectable simulation boundary so tests never depend on uncontrolled randomness.
- Added a reusable 300 ms debounced `usePricePreview` hook with explicit idle/debouncing/loading/success/error request state and none/current/stale preview freshness.
- Combined `AbortController` cleanup with monotonic generations, canonical configuration keys, and echoed request IDs. Identity checks remain authoritative if cancellation is ignored or responses resolve out of order.
- Added a data-driven minimal order builder that loads menu groups/options through the mock API, retains configuration independently from preview failures, offers Retry, hides stale amounts, and renders the engine-produced pricing breakdown.
- Added endpoint, simulation, hook, UI, cleanup, and exact TC-12 tests covering debounce, rapid changes, out-of-order responses, cancellation, failure, Retry, configuration preservation, and unmounting.

### 2026-11-26 — Part D cart and reservations

- Resolved D1 with same-origin IndexedDB `readwrite` transactions as the genuine cross-tab mutual-exclusion and commit boundary; BroadcastChannel only announces commits so other tabs can refresh. Documented the same-browser/origin limitation and explicit single-context fallback when IndexedDB is unavailable.
- Resolved D3 by expiring the original hold, making the item read-only/removable, rejecting late edits with a clear message, and preserving the caller-owned draft for a new idempotent add.
- Added typed MSW operations for get cart, add, edit, remove, inventory, and explicit expiry cleanup, with server time and state version metadata on success and failure.
- Added a server-authoritative cart service that reuses validation, stock, and pricing engines. Add/edit mutations calculate everything before assigning stock, item, reservation, and idempotency state together.
- Added server-level Add to Cart idempotency records and UI logical-operation key reuse. Replays return the original item/reservation, while a key reused with different input returns a conflict.
- Added exact five-minute reservations, idempotent stock release, active-item-only price estimates, expired-item removal, edit rejection, and a client countdown derived from the response server/browser offset.
- Added deterministic injected-failure, fake-clock/timer, API, UI, IndexedDB cross-context, and official TC-08–TC-11/TC-13–TC-15 coverage. `fake-indexeddb` is test-only and production uses the browser's native IndexedDB implementation.

### 2026-11-26 — Part E checkout and orders as JSON

- Resolved D4 with server-owned injected order IDs/timestamps, one client key per logical Pay, atomic successful idempotency records, exact replay, changed-request conflict, and safe retry after pre-commit failure.
- Resolved D6 with a versioned immutable `BDT`/`poisha` schema containing product/option snapshots, line quantities/prices, the complete authoritative pricing breakdown, and separate attempted-versus-applied coupon fields.
- Added pure stored-order creation, historical seed pricing, export-envelope creation, and deterministic serialization. The six supplied seed orders price to 339, 713, 1,271, 578, 866, and 1,228 BDT, totaling 4,995 BDT.
- Added strict runtime validation of the supplied `orders.seed.json`. Persistent state records seed schema initialization, never duplicates official IDs, and historical orders do not consume current inventory.
- Added one atomic checkout transaction that expires due holds first, validates active items, locks final server-time pricing, marks their reservations sold, appends the order, clears the cart, and commits the Pay key together. Injected failures preserve the active cart, stock, reservations, orders, and retry key availability.
- Added typed checkout/orders/export MSW endpoints and client methods, plus a minimal label-only payment UI, attempted coupon input, retry-safe Pay, persistent order count, and Download `orders.json`.
- Added deterministic domain, API, UI, failure, expiry, sold-stock, seed-history, no-duplication, IndexedDB refresh, JSON validity, and exact TC-16/TC-17 coverage.

### 2026-11-26 — Part F sales assistant chatbot

- Completed C2 before integration with the exact question/function/argument/output contract, and resolved D5 with a closed tool registry plus a direct deterministic response when customer data is absent.
- Added seven pure statistics functions over immutable stored orders. Seed results are 6 orders, 499,500 poisha revenue, 83,250 poisha average, Fried as best seller with 10 units, card as 214,500-poisha leading payment method, and 3 actually applied coupons.
- Added the official `@google/genai` client using `gemini-3.8-flash`, forced function selection, strict name/argument validation, local deterministic execution, and a second model turn that receives only the computed compact result for natural-language phrasing.
- Added typed handling for missing/invalid keys, quota/429, network failures, invalid tools/arguments, unavailable orders, and unexpected responses. The assistant exposes loading/error/Retry states and never blocks the order builder.
- Added a suggested-question chat panel. Every question loads the latest persisted orders immediately before tool execution, so successful checkouts appear without reload.
- Added mocked provider, orchestration, statistics, UI, alternate-data, and official TC-18–TC-20 coverage. No automated test or verification command sends a live Gemini request.
- Documented the browser-exposed `VITE_GEMINI_API_KEY` as an assessment-only compromise; a real task-scoped key remains outside Git and must be created/submitted manually by the user.

### 2026-11-26 — Complete staff frontend UI

- Replaced the minimal assessment controls with one responsive staff workspace: sticky navigation, dynamic builder, cart/reservations, checkout, order history, and sales assistant.
- Kept menu-specific data out of components. Product/group/option names, prices, constraints, recipes, stock capacities, validation, discounts, and totals are rendered from API responses and existing pure engines.
- Added accessible quantity steppers for every option and item quantity 1–3, effective group-limit summaries, finite/unlimited additional capacities, disabled unavailable increases, complete validation lists, and ingredient shortage quantities.
- Added authoritative add, retry-safe edit, remove, expiry, coupon preview, payment, and order-refresh flows. Editing reuses the existing stock net-difference transaction and retains the draft on failure; expired rows remain removable and visibly read-only.
- Added reusable pricing summaries for item, reserved cart, and coupon-aware checkout totals, including unit/cart discounts, coupon outcome, VAT, and final payable without React-side recalculation.
- Added persisted order-history cards with Bangladesh timestamps, payment labels, configured line details, totals, and the existing valid `orders.json` download.
- Added semantic regions, skip navigation, visible focus states, keyboard-operable controls, loading skeletons, empty/success/error states, reduced-motion support, and responsive layouts.
- Added full RTL workflow coverage using real mock-server services for build → reserve → edit → coupon → pay → history, plus alternate API-menu rendering and authoritative store assertions.
- Manually verified the live browser at 1440×1000 and 390×844. Desktop and mobile had no application console errors; the mobile document measured 390px content/viewport width after fixing grid min-content overflow.

### 2026-11-26 — Independent official acceptance QA

- Re-read all four rendered assessment pages and independently transcribed canonical configurations A, B, and C plus every Section 9 expected result.
- Audited the complete implementation and existing test suite for exact-value assertions, deterministic async behavior, mock-server transaction boundaries, and mocked Gemini execution.
- Executed explicit TC-01–TC-20 tests. TC-08–TC-11 run at both pure-domain and authoritative-service levels, producing 24 passing acceptance executions across 7 files.
- Strengthened TC-19 to pin the official seed result (Fried ×10) before proving that modified review data changes the answer to Scrambled ×17.
- Added MSW/RTL TC-14 coverage proving a failed reservation retains configuration, holds no stock, creates no idempotency record, and succeeds on Retry with the same logical key. Labeled the existing RTL triple-click test explicitly as TC-13.
- Reconfirmed generic behavior with alternate rule IDs, ingredient IDs, pricing promotion IDs, and a modified API-rendered menu.
- Created `TEST_REPORT.md` with exact official expectations, observed results, source files, and PASS status for all 20 cases.

### 2026-11-26 — Computed answers and submission documentation

- Re-read all four assessment pages and transcribed Section 10's Q1–Q8 wording exactly into the executable answer output and traceability document.
- Added `npm run answers`, backed by a strict TypeScript/Vitest program that imports the official fixture, supplied seed parser, and production rules, stock, pricing, order, and statistics engines.
- Made Q2 exhaustive rather than heuristic: the program evaluated 1,368,570 bounded candidates and 502,200 rule-valid, in-stock configurations, reporting both 360.00-BDT ties caused by optional zero-price Ketchup.
- Generated `ANSWERS.md` from the successful command output. Q3 includes both full pricing sequences, while Q8 audits all four coupon attempts and explains the rejected 13:10 order.
- Audited D1–D6 and C1–C2 against the implementation, corrected D1/D3 wording to match the actual UI, and marked every decision/checkpoint explanation for mandatory personal review.
- Added the final `README.md` covering setup, commands, architecture, engines, reservations/time, races, idempotency, Gemini, persistence, trade-offs, limitations, unfinished Part G work, and the absence of a reliable hours record.
- Confirmed `.env.example` contains exactly `VITE_GEMINI_API_KEY=` and no secret value.

### 2026-11-26 — Part G bonus persistence and versioning

- Re-ran the complete mandatory suite before bonus work: 35 files/156 tests passed, followed by all 24 acceptance executions covering TC-01–TC-20.
- Kept reservations in the authoritative IndexedDB state across refreshes. Each transaction expires overdue active holds against server time, increments the cart version once when the cart changes, and cannot release an already-ended allocation again.
- Added a dedicated cart version distinct from the store's internal transaction version. Add, edit, remove, and checkout now carry and validate `cartVersion` within the same authoritative transaction; exact idempotency replays remain successful even when the original request version is old.
- Added 409 conflict handling that reloads authoritative cart and inventory state, preserves the pending configuration/edit, and requires an explicit review/retry instead of overwriting another tab.
- Added a schema-versioned unfinished-configuration repository. Restored drafts are parsed and revalidated against current API menu rules and stock, while incomplete or unavailable drafts remain unreserved and cannot bypass normal Add validation.
- Added deterministic fake-IndexedDB refresh/two-tab tests plus RTL coverage for unfinished-draft restoration and automatic authoritative reload after a conflict.

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-25 | PDF page count/render | 4/4 pages rendered and inspected. |
| 2026-11-25 | PDF embedded text | None; visual inspection fallback used as required. |
| 2026-11-25 | Seed structure | Top-level schema metadata plus exactly 6 orders; no prices. |
| 2026-11-25 | Planning coverage audit | Complete: Parts A–G, 20/20 tests, D1–D6, C1–C2, Q1–Q8, Appendix A/B, and deliverables present. |
| 2026-11-25 | `npm run typecheck` | Passed with strict TypeScript. |
| 2026-11-25 | `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | `npm run test` | Passed: 1 file, 1 smoke test. |
| 2026-11-25 | `npm run test:coverage` | Passed: 80% statements/lines, 100% branches/functions for the initial measured source. |
| 2026-11-25 | `npm run build` | Passed: Vite production bundle generated in `dist/`. |
| 2026-11-25 | `npm run dev -- --host 127.0.0.1` | Passed outside the restricted sandbox; app shell and `/mockServiceWorker.js` both returned HTTP 200. |
| 2026-11-25 | `npm run format:check` | Passed. Existing authoritative/planning artifacts are excluded from automatic reformatting. |
| 2026-11-25 | `npm audit` (install audit) | Passed: 0 vulnerabilities. |
| 2026-11-25 | Domain/API `npm run test` | Passed: 6 files, 18 tests. |
| 2026-11-25 | Domain/API `npm run test:coverage` | Passed: 89.09% statements, 88.23% branches, 87.5% functions, 92.45% lines. |
| 2026-11-25 | Domain/API `npm run typecheck` | Passed with all strict flags. |
| 2026-11-25 | Domain/API `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | Domain/API `npm run build` | Passed; development-only mock data remains absent from the production bundle. |
| 2026-11-25 | Domain/API `npm run format:check` | Passed. |
| 2026-11-25 | Part A `npm run test` | Passed: 8 files, 35 tests including TC-01–TC-04. |
| 2026-11-25 | Part A `npm run typecheck` | Passed with all strict flags. |
| 2026-11-25 | Part A `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | Part A `npm run format:check` | Passed. |
| 2026-11-25 | Part A `npm run test:coverage` | Passed: 93.43% statements, 91.13% branches, 93.18% functions, 94.81% lines overall; rules engine 96.34% statements/lines and 100% functions. |
| 2026-11-25 | Part A `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-25 | Part B `npm run test` | Passed: 10 files, 58 tests including domain-level TC-08–TC-11. |
| 2026-11-25 | Part B `npm run typecheck` | Passed with all strict flags. |
| 2026-11-25 | Part B `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | Part B `npm run format:check` | Passed. |
| 2026-11-25 | Part B `npm run test:coverage` | Passed: 93.33% statements, 87.8% branches, 93.42% functions, 94.64% lines overall; stock engine 93.24% statements and 94.48% lines. |
| 2026-11-25 | Part B `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-25 | Part C `npm run test` | Passed: 12 files, 76 tests including exact TC-05–TC-07. |
| 2026-11-25 | Part C `npm run typecheck` | Passed with all strict flags. |
| 2026-11-25 | Part C `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | Part C `npm run format:check` | Passed. |
| 2026-11-25 | Part C `npm run test:coverage` | Passed: 92.85% statements, 86.8% branches, 96.03% functions, 93.66% lines overall; pricing domain 92.02% statements and 100% functions. |
| 2026-11-25 | Part C `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-25 | Async preview focused tests | Passed: 4 files, 13 deterministic tests including TC-12. |
| 2026-11-25 | Async preview full `npm run test` | Passed: 16 files, 89 tests. |
| 2026-11-25 | Async preview `npm run typecheck` | Passed with all strict flags. |
| 2026-11-25 | Async preview `npm run lint` | Passed with zero warnings. |
| 2026-11-25 | Async preview `npm run test:coverage` | Passed: 91.68% statements, 81.68% branches, 93.82% functions, 92.39% lines overall. |
| 2026-11-25 | Async preview `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-25 | Async preview `npm run format:check` | Passed. |
| 2026-11-26 | Part D focused tests | Passed: 6 files, 22 deterministic tests covering transactions, API/UI behavior, cross-tab races, countdowns, and TC-08–TC-15. |
| 2026-11-26 | Part D `npm run typecheck` | Passed with all strict flags. |
| 2026-11-26 | Part D `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Part D full `npm run test` | Passed: 22 files, 111 tests. |
| 2026-11-26 | Part D `npm run test:coverage` | Passed: 81.57% statements, 69.05% branches, 83.15% functions, 83.05% lines overall. |
| 2026-11-26 | Part D `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-26 | Part D `npm run format:check` | Passed. |
| 2026-11-26 | Part E focused tests | Passed: 5 files, 15 deterministic tests covering seeds, checkout, API/UI, persistence/export, and TC-16–TC-17. |
| 2026-11-26 | Part E `npm run typecheck` | Passed with all strict flags. |
| 2026-11-26 | Part E `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Part E full `npm run test` | Passed: 27 files, 126 tests. |
| 2026-11-26 | Part E `npm run test:coverage` | Passed: 82.26% statements, 70.18% branches, 85.55% functions, 83.89% lines overall. |
| 2026-11-26 | Part E `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-26 | Part E `npm run format:check` | Passed. |
| 2026-11-26 | Part F focused tests | Passed: stats, tool allowlist/validation, mocked SDK/orchestration, UI states, modified data, and TC-18–TC-20. |
| 2026-11-26 | Part F `npm run typecheck` | Passed with all strict flags. |
| 2026-11-26 | Part F `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Part F full `npm run test` | Passed: 33 files, 152 tests. |
| 2026-11-26 | Part F `npm run test:coverage` | Passed: 83.1% statements, 71.37% branches, 87.04% functions, 84.92% lines overall; sales assistant UI has 100% line coverage. |
| 2026-11-26 | Part F `npm run format:check` | Passed. |
| 2026-11-26 | Part F `npm run build` | Passed; Vite production bundle generated successfully. A non-failing large-chunk advisory remains because the browser SDK is bundled. |
| 2026-11-26 | Part F live Gemini call | Not run: no real API key was read or committed; provider behavior is covered with injected deterministic mocks. |
| 2026-11-26 | Complete UI focused RTL | Passed: dynamic API menu, rapid Add protection, build/reserve/edit/coupon/pay/history workflow, checkout, shell, and assistant states. |
| 2026-11-26 | Complete UI `npm run typecheck` | Passed with all strict flags. |
| 2026-11-26 | Complete UI `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Complete UI full `npm run test` | Passed: 34 files, 154 tests. |
| 2026-11-26 | Complete UI `npm run test:coverage` | Passed: 84.6% statements, 73.83% branches, 87.66% functions, 86.64% lines overall. |
| 2026-11-26 | Complete UI `npm run format:check` | Passed. |
| 2026-11-26 | Complete UI `npm run build` | Passed; main bundle 256.23 kB and lazy assistant bundle 436.23 kB, with no chunk-size warning. |
| 2026-11-26 | Desktop browser 1440×1000 | Passed: two-column builder/sticky total, all staff sections rendered, MSW data loaded, and no application console errors. |
| 2026-11-26 | Mobile browser 390×844 | Passed: single-column controls, all navigation links available, document width exactly matched viewport width, and no application console errors. |
| 2026-11-26 | Independent acceptance-only run | Passed: 7 files, 24 executed tests covering TC-01–TC-20; TC-08–TC-11 executed at two layers. |
| 2026-11-26 | Independent QA targeted RTL/MSW | Passed: 3 files, 7 tests including rapid Add TC-13 and failure/Retry TC-14. |
| 2026-11-26 | Independent QA `npm run typecheck` | Passed with strict TypeScript. |
| 2026-11-26 | Independent QA `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Independent QA full `npm run test` | Passed: 34 files, 155 tests. |
| 2026-11-26 | Independent QA `npm run test:coverage` | Passed: 85.33% statements, 75.90% branches, 87.90% functions, 87.28% lines. |
| 2026-11-26 | Independent QA `npm run format:check` | Passed. |
| 2026-11-26 | Independent QA `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-26 | Computed answers `npm run answers` | Passed: 1 executable TypeScript test; Q1–Q8 printed from official data and production engines. |
| 2026-11-26 | Documentation phase `npm run typecheck` | Passed with strict TypeScript. |
| 2026-11-26 | Documentation phase `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Documentation phase full `npm run test` | Passed: 35 files, 156 tests including the answer generator. |
| 2026-11-26 | Documentation phase `npm run test:coverage` | Passed: 84.95% statements, 74.76% branches, 87.68% functions, 86.94% lines. |
| 2026-11-26 | Documentation phase `npm run format:check` | Passed. |
| 2026-11-26 | Documentation phase `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-26 | `.env.example` secret check | Passed: one empty `VITE_GEMINI_API_KEY=` declaration; no real key. |
| 2026-11-26 | Part G pre-implementation `npm run test` | Passed: 35 files, 156 tests. |
| 2026-11-26 | Part G pre-implementation acceptance suite | Passed: 7 files, 24 executions covering TC-01–TC-20. |
| 2026-11-26 | Part G focused tests | Passed: 2 files, 9 tests for refresh, expiry, conflicts/reload, and draft restoration. |
| 2026-11-26 | Part G final `npm run typecheck` | Passed with strict TypeScript. |
| 2026-11-26 | Part G final `npm run lint` | Passed with zero warnings. |
| 2026-11-26 | Part G final full `npm run test` | Passed: 36 files, 164 tests. |
| 2026-11-26 | Part G final `npm run test:coverage` | Passed: 84.41% statements, 74.44% branches, 87.99% functions, 86.40% lines. |
| 2026-11-26 | Part G final `npm run build` | Passed; Vite production bundle generated successfully. |
| 2026-11-26 | Part G final `npm run answers` | Passed: Q1–Q8 recomputed from production engines. |
| 2026-11-26 | Part G final `npm run format:check` | Passed. |

## Next step (wait for user instruction)

Wait for the user's next instruction. Parts A–G, the complete UI, TC-01–TC-20 verification, `ANSWERS.md`, and `README.md` are complete. The user must personally review `DECISIONS.md`; a live Gemini-key check, push/deployment, and the one-shot submission remain permission-gated or user-owned.

## Update template for every future implementation step

```md
### YYYY-MM-DD — <step>
- Scope completed:
- Files/modules changed:
- Requirements/tests covered:
- Commands run and results:
- Browser/external behavior verified (or not verified):
- Decisions/risks/remaining issues:
- Commit:
- Next step:
```
