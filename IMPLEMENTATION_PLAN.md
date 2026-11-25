# Smart Order Builder — Sequential Implementation Plan

## Working method

Each numbered step ends with: update `PROGRESS.md`, run the listed checks, inspect `git diff`/`git status`, and create one focused commit only after verification. D1–D6 answers must be written in the author's own words (3–6 sentences each). C1 and C2 are hard gates. Part G is not allowed until Parts A–F are correct and tested.

## Phase 0 — Planning baseline

1. Read all four PDF pages and `orders.seed.json`; establish traceability, risks, architecture, unresolved decisions, and progress tracking.
2. Commit only planning documents and preserve supplied source files unchanged.

Exit check: five requested planning documents exist; all Parts A–G, Appendix A/B, TC-01–20, D1–D6, C1–C2, Q1–Q8, and deliverables are traceable.

## Phase 1 — Foundation and data contract

3. Scaffold React 18+ with Vite and strict TypeScript; add Vitest, React Testing Library, MSW, lint/format scripts, `.gitignore`, and `.env.example`. Keep `Assesment.pdf` and `orders.seed.json` unchanged.
4. Define typed menu/rule/ingredient/stock/promotion contracts and transcribe Appendix A plus Part C promotion data into a mock API fixture. Add runtime validation at the API/persistence boundary if kept small.
5. Build `/api/menu` and server-time response contracts. Add an alternate fixture proving components/engines do not rely on breakfast-specific IDs.

Exit checks: typecheck, build, fixture contract tests, alternate-fixture smoke test. Commit foundation and fixture/API contract separately if both are substantial.

## Phase 2 — Part A: pure rules engine

6. Implement generic deterministic validation for group limits (`min`, `max`, `step`, `maxDistinct`, `maxPerOption`) and declarative `requires`, `excludes`, and `overrideLimit` rules.
7. Return all structured violations and map them to stable human-readable messages. Build data-driven group/option controls and disable Add to Cart while violations exist.
8. Cover TC-01–TC-04 plus multiple-violation ordering and alternate-fixture behavior.

Exit checks: rules unit tests, relevant RTL tests, full typecheck/build. Commit Part A.

## Phase 3 — Part B: shared ingredient stock

9. Resolve and write D1 before implementing the conflicting-save behavior.
10. Implement pure ingredient-usage aggregation, option capacity, remaining stock, shortage reporting, item-quantity multiplication, and edit net-difference functions.
11. Add mock-server stock state and atomic reservation/edit primitives over immutable snapshots. Build option availability and complete shortage UI.
12. Cover TC-08–TC-11 at domain and server integration levels, including exact shortage amounts and reuse of the edited item's allocation.

Exit checks: deterministic stock tests, API integration tests, relevant RTL, typecheck/build. Commit Part B.

## Phase 4 — Part C: exact pricing

13. Complete C1 in `DECISIONS.md`: floating-point risk and hand calculation/rounding of TC-06 VAT 75.48. Do not write `priceCart` before this is reviewed.
14. Resolve D2 and define when price is locked, ensuring TC-06/TC-07 remain coherent.
15. Implement branded/documented integer-poisha helpers and pure `priceCart(cart, menu, promos, serverTime)` in the exact six-step order.
16. Add `/api/price`: 300 ms client debounce, injectable 200–1500 ms latency and 15% failure, stale-response protection, retained configuration, and Retry.
17. Render the full breakdown. Cover TC-05–TC-07 and TC-12, rounding boundaries, promotion tie behavior, and 10:59:59/11:00:00 Asia/Dhaka boundary.

Exit checks: pricing golden tests, fake-timer race tests, RTL, typecheck/build. Commit core pricing and async preview as separately verified units if useful.

## Phase 5 — Part D: cart reservations

18. Resolve D3 before implementing expiry-during-edit UX.
19. Implement Add to Cart idempotency, atomic all-or-nothing reservation, deterministic fault injection, and retry without losing configuration.
20. Implement a server-time offset adapter, five-minute countdown/expiry, stock release, and expired read-only/remove-only items.
21. Implement edit as one atomic allocation swap using Part B's net-difference function.
22. Cover TC-13–TC-15 and re-run TC-08–TC-12 as regression.

Exit checks: fake-clock/idempotency/rollback tests, RTL, typecheck/build. Commit Part D.

## Phase 6 — Part E: checkout, persistence, export

23. Resolve D4 (server/browser authority and Pay idempotency) and D6 (complete stored-order schema, money unit, coupon attempt/application representation).
24. Implement schema-versioned persistent mock-server storage. Seed exactly once from the supplied top-level `orders.seed.json`; calculate historical totals using each order's `createdAt` and never mutate/fabricate the six seed records.
25. Implement atomic idempotent Pay: one order, reserved-to-sold conversion, cart empty, no later release of sold stock.
26. Implement refresh persistence and valid `orders.json` export of seed plus new orders.
27. Cover TC-16–TC-17, duplicate initialization, schema validation, historical time pricing, and export.

Exit checks: clean-store and persisted-store integration tests, typecheck/build. Commit Part E.

## Phase 7 — Part F: statistics and Gemini assistant

28. Implement pure statistics first: order count, revenue, best-selling option by `line qty × option qty`, revenue by payment method, average order value, applied-coupon count, and date-filtered orders. Test them against seed and modified data.
29. Complete C2 by documenting every supported question and exact function name/input/output. Resolve D5 and define the unsupported-data response/anti-hallucination guard.
30. Only after C2, integrate Gemini Flash function calling with the closed tool registry. Send tool metadata/results, not raw orders for arithmetic; numbers remain code-owned.
31. Implement immediate post-checkout freshness and clear missing-key, invalid-key, 429, and network-error states. Mock every Gemini call in automated tests.
32. Cover TC-18–TC-20 plus all minimum question categories and error states.

Exit checks: stats/tool contract tests, mocked Gemini integration/RTL, secret scan, typecheck/build. Commit stats and assistant integration as separately verified steps.

## Phase 8 — Complete mandatory assessment material

33. Run all implementation code to produce Q1–Q8. Create `ANSWERS.md` with the command/test for each answer and step-by-step working for Q3 and Q8.
34. Create `README.md` with setup, architecture, engine/tool structure, trade-offs, unfinished work, and actual hours spent. Confirm `DECISIONS.md` contains finished D1–D6/C1–C2 answers consistent with code.
35. Map every requirement and TC to a passing test, run the one-command suite, typecheck, build, and targeted browser QA. Record what was and was not live-verified.

Exit gate for Part G: Parts A–F pass all 20 acceptance tests; required docs and environment example are complete; no secrets; `PROGRESS.md` says the mandatory gate passed.

## Phase 9 — Part G bonus (only after exit gate)

36. Persist/reconcile only still-valid reservations on refresh with server state authoritative.
37. Add versioned cart writes and cross-tab conflict/reload behavior; never silently overwrite.
38. Persist unfinished configuration across refresh.
39. Add deterministic integration/browser tests and re-run the entire mandatory suite.

Exit checks: Part G tests plus no mandatory regressions. Commit each independently useful bonus.

## Phase 10 — Final user-controlled handoff

40. Prepare a final checklist: clean status, concise history, test/build results, docs, `.env.example`, no key, optional live-demo status, and stated deadline.
41. Stop for user approval. Never push, deploy, paste a key, or submit the one-shot form autonomously.
