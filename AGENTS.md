# Smart Order Builder — Persistent Project Instructions

## Authority and scope

- `Assesment.pdf` is the ultimate source of truth. Read the relevant PDF section before changing behavior. If another document or implementation conflicts with it, stop and reconcile the conflict in `DECISIONS.md` before proceeding.
- Work only in this repository unless the user explicitly expands the scope.
- Keep the solution explainable in a live interview: prefer small modules, explicit data flow, and ordinary TypeScript over clever abstractions.
- Do not push, deploy, submit the assessment, or enter secrets into any external form without the user's explicit permission.

## Required stack and boundaries

- Use React 18 or newer, strict TypeScript, Vite, MSW, Vitest, React Testing Library, and the Gemini API free tier with a Flash model.
- There is no real backend. MSW (or a tiny in-browser mock) is the server. Do not build a Node, Django, or other backend API.
- All business rules, menu data, ingredients, stock, and promotion definitions originate from the mock API. Components and generic engines consume data; they do not own the fixture.
- Never hardcode option-specific IDs, names, limits, recipes, cross-option cases, promotion thresholds, or other fixture-specific branches inside generic engines or components.
- Keep domain behavior in pure functions wherever possible. Pass configuration, time, and current state explicitly.
- Represent and calculate all money as integer poisha (`1 BDT = 100 poisha`). Apply the PDF's exact ordering and half-up rounding rules.

## Correctness and state

- Treat stock mutations as server-authoritative atomic operations: reserve, edit/swap, expire/release, and pay/convert-to-sold must either complete fully or leave state unchanged.
- Respect item edit net-difference semantics. An item may reuse its own current allocation, must never double-count it, and must never release more stock than it holds.
- Use idempotency keys for Add to Cart and Pay exactly as required.
- Base reservation countdown and expiry on the mock server's `serverTime` offset, never directly on browser `Date.now()`.
- Prevent stale async pricing responses from replacing newer results.
- Persist orders as JSON across refreshes and load `orders.seed.json` only on first initialization. Never alter, replace, or fabricate seed orders.
- Never commit a real Gemini key. Read `VITE_GEMINI_API_KEY` from `.env.local`; commit only `.env.example` with the variable name.

## Decisions and sequencing gates

- Record every D1–D6 answer in `DECISIONS.md` in the author's own words (3–6 sentences each), then keep code consistent with it.
- Complete checkpoint C1 in `DECISIONS.md` before implementing `priceCart`.
- Complete checkpoint C2 in `DECISIONS.md` before implementing Gemini integration.
- Complete and verify Parts A–F before starting optional Part G.
- If a decision remains unresolved, do not implement the behavior that depends on it.

## Testing and verification

- Make automated tests deterministic: inject clocks, randomness, latency, failures, IDs, and external clients. Use fake timers where appropriate.
- Cover all 20 official acceptance tests with Vitest/React Testing Library at the correct unit, integration, or UI level.
- Never delete, skip, loosen, rewrite, or weaken an official acceptance test to make implementation pass. Add narrower tests for edge cases instead.
- Unit-test pure rules, stock, pricing, order, and statistics functions. Mock the Gemini call in tests; numerical answers must come from code, never the model.
- Distinguish static/test verification from behavior not yet checked in a real browser or against Gemini.

## Working discipline

- Update `PROGRESS.md` after every implementation step, including checks run, results, unresolved issues, and the next step.
- Make a meaningful, focused Git commit after each verified implementation step. Do not commit failing or unverified work as complete.
- Preserve unrelated user changes and inspect `git status` before editing and committing.
- Keep `REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`, `DECISIONS.md`, and the final `README.md` aligned with the implementation.

## Mandatory Git workflow for all remaining implementation phases

The assessment evaluators will review the Git history, so every commit must represent genuine development progress.

1. Before starting a phase, inspect Git status and the existing commit history.
2. Preserve all previous commits.
3. Implement changes in small, logical units.
4. Review the Git diff before staging changes.
5. Run relevant tests after each logical implementation.
6. Before completing a phase, run type checking, linting, the full test suite, and the production build.
7. Stage only relevant files for each commit.
8. Use meaningful Conventional Commit messages.
9. Separate unrelated features, fixes, tests, and documentation when appropriate.
10. Update `PROGRESS.md` and `REQUIREMENTS.md` during every implementation phase.
11. Never commit API keys, `.env.local`, `node_modules`, coverage output, or build artifacts.
12. Never create fake, backdated, or empty commits.
13. Never amend or rewrite published commit history without explicit permission.
14. Never force push.
15. Never push automatically. Wait for the user's explicit permission.
16. At the end of every phase, report the commit hashes, commit messages, test results, and the exact command the user should use to push.
