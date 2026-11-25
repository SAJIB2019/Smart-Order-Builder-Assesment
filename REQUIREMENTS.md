# Smart Order Builder — Requirement Traceability

## Source and interpretation

This document traces the complete four-page `Assesment.pdf` and the supplied `orders.seed.json`. The PDF is authoritative. Status values are `Pending`, `Partial`, `Complete`, `Blocked by decision/checkpoint`, or `Bonus gated`. The project foundation, typed domain contracts, official fixture, and read-only mock API are initialized; rules, stock mutation, and pricing engines have not been implemented yet.

The assessment is a logic assessment, not a design assessment. A plain, clean, responsive UI is sufficient. The primary grading targets are exact Section 9 results, correctness under races/stock pressure/edits, and the developer's ability to explain the decisions and code.

## Global constraints

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| G-01 | React 18+, strict TypeScript, Vite, MSW, Vitest + React Testing Library, Gemini API free tier/Flash model. | Tooling/app shell | Config inspection; build; tests | Partial — React 19, strict TypeScript, Vite, MSW, Vitest/RTL and coverage configured; Gemini integration remains gated by C2. |
| G-02 | No real backend; MSW or a tiny in-memory mock acts as server. Browser Gemini calls are allowed. | `infrastructure/mock-api` | Architecture review | Partial — browser/Node MSW serves typed menu and stock responses; mutation, persistence, and later feature handlers remain pending. |
| G-03 | AI tools are allowed, but every line must be explainable, debuggable, and changeable live. | Entire codebase | Review/interview readiness | Pending |
| G-04 | All Appendix A groups, options, rules, ingredients, stock, and promotions come from the mock API. The app must continue to work with a different menu fixture without code changes. | Menu API + generic domain functions/UI | Alternate-fixture tests | Partial — the official fixture is exposed through typed menu/stock endpoints; alternate-fixture engine/UI verification remains pending. |
| G-05 | No hardcoded option IDs, names, or limits in components or engine code. | Domain/features | Static review + alternate-fixture tests | Partial — assessment-specific definitions exist only in the official fixture; generic engines/components remain pending. |
| G-06 | Deadline stated in the brief: 27 November 2026 at 12:00 am Bangladesh time; submission form can be submitted only once. | Submission process | Human check; no autonomous submission | Pending |

## Parts A–G matrix

### Part A — Rules engine (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| A-01 | Implement pure, generic `validate(config, groups, rules)`. | `domain/rules` | Unit tests | Pending |
| A-02 | Return all violations, not only the first; each includes group/rule ID and a human-readable message. | `domain/rules` | TC-01–TC-04 + aggregation tests | Pending |
| A-03 | Disable Add to Cart while any violation exists. | Builder feature | RTL interaction test | Pending |
| A-04 | Support group `min`, `max`, `step` (total quantity must be a multiple), `maxDistinct`, and `maxPerOption`. | `domain/rules` | Parameterized unit tests | Pending |
| A-05 | Support `requires`: option X requires at least one of options `[Y, Z]`. | `domain/rules` | TC-03 | Pending |
| A-06 | Support `excludes`: option X cannot coexist with any option in `[Y, Z]`. | `domain/rules` | TC-04 | Pending |
| A-07 | Support `overrideLimit`: selecting option X replaces group G's base maximum; the override wins. | `domain/rules` | TC-02 | Pending |

Reference examples: Scrambled ×1 + Fried ×1 is valid; Scrambled ×3 violates Eggs `step: 2`; Croissant + three Extras violates the overridden Extras maximum of 2.

### Part B — Ingredient-based shared stock (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| B-01 | Options consume configured ingredients; stock is per ingredient and shared across all cart items plus the configuration being built. | `domain/stock` + mock server | TC-08–TC-11 | Pending |
| B-02 | For every option, show the number of additional units currently addable and disable it at zero. | Builder feature | Stock capacity unit tests + RTL | Pending |
| B-03 | Cart item quantity is limited to 1–3 and multiplies ingredient usage. | Cart/domain | Unit + RTL tests | Pending |
| B-04 | Editing uses net difference; the edited item can reuse its existing allocation, with no double-counting or over-release. | `domain/stock` + cart API | TC-09–TC-11 | Pending |
| B-05 | A blocked operation lists every short ingredient and exact missing amount (example: `Short: 2 egg, 2 cheese`). | Stock result/UI | TC-09, TC-11 | Pending |
| B-06 | Resolve D1 before finalizing two-tab save-conflict UX. | `DECISIONS.md` + cart feature | Decision/code consistency test | Blocked by decision D1 |

### Part C — Pricing engine (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| C-01 | Complete checkpoint C1 before writing `priceCart`. | `DECISIONS.md` | Review | Blocked by checkpoint C1 |
| C-02 | Implement pure `priceCart(cart, menu, promos, serverTime)`, shared by mock server and tests. | `domain/pricing` | Unit tests | Blocked by C1 |
| C-03 | All money is integer poisha. | Money helpers/pricing | Type/review + exact tests | Partial — branded integer-poisha type/factory and fixture amounts are complete; pricing calculations remain blocked by C1. |
| C-04 | Apply the six pricing steps in the exact order below. | `domain/pricing` | TC-05–TC-07 + ANSWERS tests | Blocked by C1 |
| C-05 | Each percentage calculation rounds half-up to nearest poisha; only final payable rounds half-up to whole BDT. | Money helpers | Boundary tests + TC-06/07 | Blocked by C1 |
| C-06 | UI shows subtotal, each discount, VAT, and payable. | Pricing summary UI | RTL | Pending |
| C-07 | Configuration price is returned by mock `/price`, debounced 300 ms, with simulated 200–1500 ms latency and 15% random failure. | Price API + builder query | Fake timers/injected RNG | Pending |
| C-08 | Stale price responses never replace a newer configuration price; cancel and/or compare request IDs. | Builder price coordinator | TC-12 | Pending |
| C-09 | On preview failure, retain the configuration and offer Retry. | Builder UI | RTL | Pending |
| C-10 | Resolve D2: lock price at Add to Cart, checkout, or never; implementation must remain consistent with TC-06/TC-07. | `DECISIONS.md` + orders/pricing | Decision/code consistency | Blocked by decision D2 |

Exact pricing order:

1. Unit subtotal = base price + sum(option price × option quantity).
2. P2 Extras deal, per unit: for every three Extra units, the cheapest Extra unit is free (`floor(extraUnits / 3)` cheapest units).
3. P1 Combo, per unit: if Eggs ≥ 4 and Protein ≥ 2, take 10% off the step-2 amount.
4. Line total = unit price × item quantity; cart subtotal = sum of line totals.
5. Exactly one cart discount applies, selecting the larger and selecting C1 on a tie:
   - C1: 100 BDT off when subtotal ≥ 1,200 BDT.
   - C2: coupon `MORNING15`, 15% of subtotal capped at 150 BDT, valid only when server time in `Asia/Dhaka` is strictly before 11:00.
6. VAT = 5% of discounted subtotal. Payable = discounted subtotal + VAT, rounded to whole BDT.

### Part D — Cart and reservations (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| D-01 | Add to Cart includes an idempotency key; double/triple clicks create exactly one cart item. | Cart API/client | TC-13 | Pending |
| D-02 | Mock server reserves all item ingredients atomically; failure leaves no partial/phantom reservation. | Reservation service | TC-14 | Pending |
| D-03 | Each reservation lasts five minutes. | Reservation service | TC-15 | Pending |
| D-04 | Server clock is 90 seconds ahead of browser. Compute offset from `serverTime`; countdown/expiry must not use raw `Date.now()`. | Server-time adapter | Fake clock + TC-15 | Partial — injectable mock-server clock and API `serverTime` metadata are complete; client offset/countdown behavior remains pending. |
| D-05 | On expiry, release stock and make item read-only; it may be removed but not edited. | Reservation/cart service + UI | TC-15 | Pending |
| D-06 | Edit is one server call that atomically swaps old and new allocations using Part B net difference. | Cart API | TC-09–TC-11 | Pending |
| D-07 | Resolve D3 for expiry during an edit, including preservation/discard of unsaved changes and user message. | `DECISIONS.md` + edit UI | Decision/code consistency | Blocked by decision D3 |

### Part E — Checkout and orders as JSON (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| E-01 | Pay atomically converts all active cart items into one order, turns reserved stock into sold stock, and empties the cart. | Checkout/order service | TC-16 | Pending |
| E-02 | Collect no payment data; payment method is only `card`, `bkash`, or `cash`. | Checkout UI/domain | Type + RTL | Pending |
| E-03 | Mock server stores orders as JSON across refreshes, including computed totals. | Order repository | TC-17 | Pending |
| E-04 | On first start only, load `orders.seed.json`; it contains no prices, so price each seed order using its `createdAt`. | Seed loader/pricing | Seed-derived tests | Pending |
| E-05 | Download button exports every seed and new order as one valid `orders.json`. | Order export feature | TC-17 | Pending |
| E-06 | Resolve D4: authority for order ID/timestamp and Pay idempotency. | `DECISIONS.md` + checkout API | TC-16 + review | Blocked by decision D4 |
| E-07 | Resolve D6 and document stored-order JSON fields, money unit, and representation of an entered-but-not-applied coupon. | `DECISIONS.md` + order types | TC-17 + schema tests | Blocked by decision D6 |

### Part F — Sales assistant chatbot (mandatory)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| F-01 | Add staff chat for plain-English sales questions; Bangla is optional. Use Gemini free tier with a Flash model. | Assistant feature/client | Mocked integration + optional manual check | Pending |
| F-02 | At minimum answer: order count, total revenue, best-selling option by units, revenue by payment method, average order value, number of orders that received the coupon, and orders on a given date. | `domain/stats` + tool registry | Stats unit tests + tool routing tests | Pending |
| F-03 | Numerical results come from code only. Gemini function calling selects one pure function over orders JSON and phrases its result; do not ask Gemini to total raw orders. | Stats tools/Gemini orchestration | Contract tests | Pending |
| F-04 | Results reflect a checkout immediately without reload. | Shared order query state | TC-18 | Pending |
| F-05 | If data cannot answer a question, the bot says so and does not guess. | Assistant policy/tool fallback | TC-20 | Pending |
| F-06 | Read `VITE_GEMINI_API_KEY` from `.env.local`; never commit a real key. Commit `.env.example` containing only the variable name. Create a task-only free key and place it in the submission form for reviewer use. | Environment/Gemini client | Secret scan + config test | Pending |
| F-07 | Show distinct clear messages for missing key, invalid key, quota/429, and network errors. | Assistant UI/error mapper | Unit + RTL | Pending |
| F-08 | Unit-test stats on seed data and mock Gemini in all automated tests. | Tests | Test run | Pending |
| F-09 | Complete C2 before Gemini work by mapping each supported question to exact function name, inputs, and output. | `DECISIONS.md` | Review | Blocked by checkpoint C2 |
| F-10 | Resolve D5 for unsupported “best customer” requests and prevent invented names. | `DECISIONS.md` + assistant guardrails | TC-20 | Blocked by decision D5 |

### Part G — Bonus (only after A–F are done)

| ID | Requirement | Planned owner | Verification | Status |
|---|---|---|---|---|
| BG-01 | Refresh retains only reservations that are still valid; server remains source of truth. | Persistent server store | Browser/integration test | Bonus gated |
| BG-02 | Cart changes carry a version across two tabs; a stale tab receives a conflict and reloads, never silently overwrites. | Versioned cart API + cross-tab channel | Two-context browser test | Bonus gated |
| BG-03 | Unfinished configuration survives refresh. | Draft repository | Browser/integration test | Bonus gated |
| BG-04 | Do not start Part G until A–F are correct and tested. | Process | `PROGRESS.md` gate | Bonus gated |

## Appendix A — complete fixture/business rules

Product: **Build Your Breakfast**. Base price: **250 BDT**. All listed prices are BDT; implementation converts fixture values to poisha at its boundary.

| Group | Limits | Options: price; ingredient use |
|---|---|---|
| Bread | min 1, max 1 | Toast: 0; toast 1. Paratha: 20; paratha 1. Croissant: 60; croissant 1. |
| Eggs | min 2, max 6, step 2 | Fried: 30; egg 1. Scrambled: 35; egg 1. Omelette: 70; egg 2. |
| Protein | min 1, max 3 | Chicken Sausage: 60; sausage 1. Beef Bacon: 90; bacon 1. Tofu: 50; tofu 1. |
| Extras | min 0, max 4 | Hash Brown: 40; hashbrown 1. Mushroom: 30; mushroom 1. Baked Beans: 25; beans 1. Cheese: 35; cheese 1. |
| Sauce | min 0, maxDistinct 2, maxPerOption 1 | Ketchup: 0; no stock. Hollandaise: 25; hollandaise 1. Chili: 10; no stock. |

Cross-group rules:

| Rule ID/type | Exact definition |
|---|---|
| R1 `requires` | Hollandaise requires at least one of Scrambled or Omelette. |
| R2 `excludes` | Tofu excludes Chicken Sausage and Beef Bacon. |
| R3 `overrideLimit` | If Croissant is selected, Extras max = 2. |
| R4 `excludes` | Chili excludes Hollandaise. |

Initial ingredient stock: egg 10; sausage 4; bacon 3; tofu 5; croissant 2; paratha 10; toast 20; hash brown 6; mushroom 6; baked beans 8; cheese 4; hollandaise 5. Ketchup and Chili are unlimited.

Seed option IDs are the lowercase names used in `orders.seed.json`; explicit examples in the PDF are `scrambled`, `hashbrown`, and `beans`. The future menu fixture must define all IDs rather than relying on names in generic code.

Promotion rules are in Part C above. The brief's data-driven statement says Appendix A promotions must come from the mock API, although the visual Appendix A contains no separate promotions table; this is tracked as ambiguity AM-01.

## Appendix B — six historical orders

The supplied JSON is a top-level metadata object (`schemaVersion: 1`, `currency: BDT`, note) containing `orders`. Prices are intentionally absent. Each order must be priced at its own `createdAt` in `Asia/Dhaka`; order lines have `qty`, and each option value is its per-unit quantity.

| Order | Created at | Payment | Coupon entered | Lines (line qty × per-unit options) |
|---|---|---|---|---|
| ORD-1001 | 2026-11-20 09:15 +06:00 | card | MORNING15 | 1 × Toast 1, Scrambled 2, Chicken Sausage 1, Ketchup 1 (configuration A) |
| ORD-1002 | 2026-11-20 12:40 +06:00 | bkash | none | 1 × Croissant 1, Omelette 2, Fried 2, Chicken Sausage 1, Beef Bacon 1, Hash Brown 1, Mushroom 1, Hollandaise 1 (configuration B) |
| ORD-1003 | 2026-11-21 10:05 +06:00 | cash | MORNING15 | 2 × Paratha 1, Fried 2, Tofu 1, Cheese 2, Baked Beans 1, Mushroom 1, Chili 1 (C); plus 1 × A |
| ORD-1004 | 2026-11-21 19:30 +06:00 | card | none | 1 × Toast 1, Omelette 2, Beef Bacon 1, Hash Brown 1, Baked Beans 1, Mushroom 1 |
| ORD-1005 | 2026-11-22 08:50 +06:00 | bkash | MORNING15 | 2 × Paratha 1, Scrambled 2, Chicken Sausage 2, Hollandaise 1 |
| ORD-1006 | 2026-11-22 13:10 +06:00 | card | MORNING15 | 1 × B; plus 1 × Croissant 1, Fried 2, Tofu 1, Cheese 2 |

Important interpretation: `couponCode` records entry, not proof that the coupon applied. Pricing time, eligibility, competing C1 discount, and D6's eventual stored-order schema determine the recorded outcome. Historical orders are analytical input and must not be retroactively constrained by today's live stock pool.

## Section 9 — all official acceptance tests

Canonical configurations:

- A = Toast, Scrambled ×2, Chicken Sausage ×1, Ketchup.
- B = Croissant, Omelette ×2, Fried ×2, Chicken Sausage ×1, Beef Bacon ×1, Hash Brown ×1, Mushroom ×1, Hollandaise.
- C = Paratha, Fried ×2, Tofu ×1, Cheese ×2, Baked Beans ×1, Mushroom ×1, Chili.

| ID | Scenario | Exact expected result | Planned coverage |
|---|---|---|---|
| TC-01 | Scrambled ×3 (plus valid bread/protein) | Blocked: eggs total must be 2–6 in steps of 2 | Rules unit |
| TC-02 | Croissant + 3 extras | Blocked: extras max is 2 when Croissant is selected (override wins) | Rules unit |
| TC-03 | Hollandaise with only Fried eggs | Blocked: Hollandaise requires Scrambled or Omelette | Rules unit |
| TC-04 | Tofu + Beef Bacon / Chili + Hollandaise | Blocked (excludes), both violations listed when both exist | Rules unit |
| TC-05 | Unit price of A, B, C | A = 380.00, B = 679.50, C = 490.00 BDT | Pricing unit |
| TC-06 | Cart B ×1 + C ×2, server time 10:59:59 | Subtotal 1,659.50; C2 = 150.00 wins over C1; VAT 75.48; payable **1,585** | Pricing unit |
| TC-07 | Same cart, server time 11:00:00 (coupon entered) | Coupon rejected; C1 = 100.00; VAT 77.98; payable **1,637** | Pricing unit |
| TC-08 | Cart B ×1 + C ×2: remaining stock | egg 0, cheese 0, croissant 1; any new item needing eggs is blocked with reason | Stock integration |
| TC-09 | In that cart, edit B to Omelette ×3 + Fried ×1 | Blocked: `Short: 1 egg` (B's own 6 eggs counted as available) | Atomic edit integration |
| TC-10 | In that cart, edit B to Omelette ×1 + Fried ×3 | Allowed; B becomes 643.50; egg remaining becomes 1 | Atomic edit/pricing integration |
| TC-11 | In that cart, change C quantity 2 → 3 | Blocked: `Short: 2 egg, 2 cheese` (all shortages listed) | Atomic edit integration |
| TC-12 | Pricing responses return out of order | Only the latest configuration's price is ever displayed | Fake-timer RTL/integration |
| TC-13 | Add to Cart clicked 3 times quickly | Exactly one cart item and one reservation | Idempotency integration |
| TC-14 | Reserve call fails mid-way | No stock is held; configuration is kept; Retry works | Transaction integration + RTL |
| TC-15 | Reservation passes 5:00 (server time) | Stock released; item read-only; countdown matched server, not browser | Fake-clock integration/RTL |
| TC-16 | Pay clicked twice quickly | Exactly one order; cart empty; sold stock is not released again | Checkout idempotency integration |
| TC-17 | Refresh after checkout, then Download `orders.json` | Orders are still there; file is valid JSON in the shape documented in D6 | Persistence/export integration |
| TC-18 | Ask bot “How many orders?” after seed load, then after one checkout | The two answers differ by exactly one, with no reload | Stats/Gemini mock integration |
| TC-19 | Ask bot for the best-selling option | Same answer as the stats function; review data will be changed | Stats/tool contract with alternate data |
| TC-20 | Ask bot “Who is our best customer?” | It explains it cannot know from this data; it does not invent a name | Assistant guardrail test |

Official tests are immutable: implementation may add coverage but may not weaken these scenarios or expected values.

## D1–D6 and C1–C2 index

Full unresolved prompts and completion criteria live in `DECISIONS.md`.

| ID | Topic | Feature gate | Status |
|---|---|---|---|
| D1 | Two-tab stock race while editing | Part B save conflict UX | Unresolved |
| D2 | When promotion-sensitive prices lock | Pricing/cart/order semantics | Unresolved |
| D3 | Reservation expiry during edit | Part D edit UX | Unresolved |
| D4 | Order ID/timestamp authority and Pay idempotency | Part E checkout | Unresolved |
| D5 | Unsupported “best customer” query | Part F assistant safety | Unresolved |
| D6 | Stored-order JSON schema and entered-but-not-applied coupon | Part E persistence/export | Unresolved |
| C1 | Float risk and hand rounding of TC-06 VAT 75.48 | `priceCart` | Unresolved |
| C2 | Supported assistant questions mapped to function name/input/output | Gemini integration | Unresolved |

## ANSWERS.md — all eight required questions

Every answer must be produced by running the project's own code and include the command or test that prints it. Q3 and Q8 additionally require step-by-step working.

1. Starting from an empty cart, what is the maximum number of item C you can add? Which ingredient limits it?
2. What is the cheapest valid configuration and its unit price?
3. Cart = A ×3, server time 10:30. Give subtotal, chosen discount, VAT, and payable. Then the same at 11:30.
4. After TC-10, what is the payable at 11:30?
5. What is the payable of each seed order, and the total revenue of all six?
6. What is the best-selling option across seed orders, counted in units (`line quantity × option quantity`)?
7. Which payment method brought in the most revenue in the seed orders?
8. How many seed orders actually received the `MORNING15` discount? Explain every order that has the code but did not get the discount.

## Submission deliverables

| ID | Deliverable | Requirement/status |
|---|---|---|
| S-01 | Git repository link | Meaningful, small commits; reviewers read history. Pending. |
| S-02 | `README.md` | Setup, architecture, structure of rules/stock/pricing engines and assistant tools, trade-offs, unfinished work, and actual hours spent. Pending. |
| S-03 | `DECISIONS.md` | Answers to D1–D6 and C1–C2, in the author's own words; decision answers are 3–6 sentences each. Headings created, answers unresolved. |
| S-04 | Automated tests | Vitest/RTL/MSW harness, one-command scripts, coverage, and one shell smoke test are complete; Section 9 coverage remains pending. |
| S-05 | `ANSWERS.md` | All eight code-produced answers; commands/tests included; step-by-step work for Q3 and Q8. Pending. |
| S-06 | `.env.example` | Complete: contains only `VITE_GEMINI_API_KEY=`. |
| S-07 | Gemini key | A new free task-only key goes in the submission form, never Git. Requires explicit user action/permission. |
| S-08 | Live demo URL | Optional. Do not deploy without user permission. |
| S-09 | Submission form | Submit before stated deadline; only one submission allowed. Never submit without user permission. |

## Ambiguities and missing inputs

| ID | Finding | Working constraint / resolution path |
|---|---|---|
| AM-01 | The brief says Appendix A promotions come from the mock API, but Appendix A has no promotions table; P1/P2/C1/C2 exist only in Part C prose. | Resolved for the fixture: P2/P1/C1/C2 and VAT/rounding metadata are transcribed from Part C into the mock menu response; no additional promotions were invented. |
| AM-02 | Appendix A supplies display names and a few ID examples, not a complete machine-readable menu schema or fixture file. | Resolved for the menu fixture: typed IDs use the lowercase keys demonstrated by `orders.seed.json`; persisted order shape remains gated by D6. |
| AM-03 | The repository initially contained no starter app, package manifest, lockfile, README, tests, or environment example. | Resolved for initialization: React/Vite scaffold, package/lock files, test harness, and `.env.example` now exist. The final assessment README remains a later deliverable. |
| AM-04 | `maxDistinct` and `maxPerOption` are specified for Sauce, but generic violation wording/order is not prescribed beyond exact acceptance expectations. | Define deterministic ordering/messages and preserve exact official messages where specified. |
| AM-05 | Multiple possible `overrideLimit` rules, conflicting overrides, and multiple simultaneous promotions beyond this fixture are not defined. | Design typed generic inputs and deterministic precedence; do not add unrequested fixture behavior without documenting it. |
| AM-06 | “How many more units can be added” can be constrained by stock, group rules, cross-rules, and quantity context; the phrase does not specify whether the number is stock-only. | Prefer the maximum immediately addable under both ingredient stock and current configuration validity, then verify during implementation; document UI semantics. |
| AM-07 | The exact response contracts/status codes for mock endpoints are unspecified. | Partial: discriminated success/error contracts and read-only menu/stock responses are defined. Mutation-specific status mapping remains pending with those endpoints. |
| AM-08 | D1 assumes two tabs share one server, while per-tab MSW in-memory state is not inherently shared. | The store contract explicitly reports single-context, memory-only capabilities and supports expected-version transactions. Cross-tab coordination remains unresolved under D1/Part G. |
| AM-09 | Price-lock semantics are intentionally open and interact with historical pricing and TC-06/07. | Resolve D2 before committing the cart/order model. |
| AM-10 | Seed initialization identity (“first start”) and reset behavior are unspecified. | Use a schema-versioned persistent store and an explicit test reset path; never append duplicate seed orders. |
| AM-11 | Browser-to-Gemini calls expose the runtime key to the browser by design for this assessment. | Treat this as assessment-only, use a task-scoped free key, document the production limitation, and never commit it. |
| AM-12 | PDF spelling is `Assesment.pdf`; changing the filename could break reviewer/user expectations. | Preserve the supplied filename. |

## Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Floating-point and multi-stage rounding drift | Fails exact TC-05–07 and seed analytics | Integer poisha; explicit half-up helpers; golden and boundary tests; C1 first. |
| Async races and injected random failures | Stale price or flaky tests | Request IDs/abort; dependency-injected latency/RNG; fake timers. |
| Partial or duplicate stock mutations | Phantom holds, overselling, incorrect edit releases | Single server-side transaction function over a snapshot; commit once; idempotency map. |
| Browser/server clock skew | Incorrect countdown/expiry and TC-15 failure | Compute/store server offset from response; inject clock in domain/service tests. |
| Cross-tab consistency with browser-only MSW | Lost edits or divergent stock | Shared persistent state plus coordination/versioning; resolve D1; Part G only after A–F. |
| Persisted schema evolution | Duplicate/corrupt seed orders or invalid export | Versioned storage envelope, validation/migration/reset strategy, D6 schema tests. |
| Gemini nondeterminism, quota, and prompt hallucination | Wrong answers or flaky tests | Closed function/tool registry, code-owned numbers, unsupported-query guard, mocked tests, clear errors. |
| Data-driven UI accidentally relies on fixture IDs | Fails alternate-menu review | Render groups/options from response; engines use declarative rule/recipe data; alternate fixture tests. |
| Time-zone boundary at exactly 11:00 | Incorrect coupon application | Parse explicit offset; compare in Asia/Dhaka; test 10:59:59 and 11:00:00. |
| Assessment deadline and one-shot submission | Irrecoverable submission mistake | Keep deployment/submission manual and permission-gated; final checklist before user submits. |

## Proposed maintainable architecture

Use a small layered frontend, not a framework inside the app:

```text
src/
  app/                 # composition root, routes/layout, providers
  domain/
    menu/              # types and configuration normalization
    rules/             # pure validate(config, groups, rules)
    stock/             # pure usage, capacity, shortage, net-diff functions
    pricing/           # integer-poisha money + pure priceCart
    orders/            # order types derived after D6
    stats/             # pure assistant tool functions over orders
  infrastructure/
    mock-api/          # MSW handlers and server-authoritative services/store
    persistence/       # schema-versioned browser JSON repository
    gemini/             # function-calling client and error mapping
    time/              # injected clock and server-offset adapter
  features/
    builder/ cart/ checkout/ orders/ assistant/
  shared/              # generic UI and cross-cutting utilities only
  test/                # factories, alternate fixtures, deterministic controls
```

Data flow is one-way: components call feature hooks; feature hooks call typed HTTP endpoints intercepted by MSW; handlers invoke the same pure domain functions used by tests; handlers atomically update the mock-server repository; responses update UI query/state. Menu configuration enters through `/api/menu`, so rules, recipes, limits, stock, and promotions are data rather than component branches. This provides clear interview seams: pure logic is independently testable, the browser-only server owns mutations and idempotency, and UI modules focus on interaction and accessibility.
