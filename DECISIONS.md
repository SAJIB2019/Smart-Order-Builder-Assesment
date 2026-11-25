# Smart Order Builder — Decisions and Checkpoints

The PDF requires D1–D6 to be answered in the author's own words (3–6 sentences each), implemented consistently, and explainable live. Checkpoints must be completed before their gated features. This planning pass records the exact prompts but intentionally does not choose product behavior on the user's behalf.

## D1 — Concurrent stock loss during edit

**Status: UNRESOLVED — blocks the conflicting-save UX in Part B.**

Two browser tabs share one server. Tab A is editing an item when tab B takes the last eggs. What does tab A see when it saves, and does the user lose anything they typed?

Resolution must specify server response, stock/validation refresh, preservation of the draft, user message, and retry/recovery path.

## D2 — Price lock timing

**Status: UNRESOLVED — blocks final cart/order pricing semantics in Part C.**

Promotions change while an item sits in the cart (the coupon stops at 11:00). Decide when a price is locked: at Add to Cart, at checkout, or never. The choice must remain consistent with TC-06 and TC-07.

Resolution must distinguish preview, cart display, checkout calculation, stored totals, and seed-order repricing at `createdAt`.

## D3 — Reservation expiry during edit

**Status: UNRESOLVED — blocks expiry-during-edit behavior in Part D.**

A reservation expires while the user is in the middle of editing that item. Decide what happens to unsaved changes and what the screen tells the user.

Resolution must respect the rule that an expired item is read-only and removable but not editable, and must define whether/how the draft can be reused as a new configuration.

## D4 — Order authority and Pay idempotency

**Status: UNRESOLVED — blocks checkout implementation in Part E.**

Who creates the order ID and timestamp, the browser or the server, and how do you stop a double-click on Pay from creating two orders?

Resolution must identify the authoritative clock/ID generator, idempotency-key lifecycle, replay response, atomic transaction boundary, and safe retry behavior.

## D5 — Unsupported “best customer” query

**Status: UNRESOLVED — blocks final assistant guardrails in Part F.**

Someone asks “Who is our best customer?” but orders store no customer. Decide what the bot replies and how you stop it from inventing a name.

Resolution must cover tool availability/schema checks, a deterministic unsupported-data result, model instructions, and a test matching TC-20.

## D6 — Stored order JSON shape

**Status: UNRESOLVED — blocks order types, persistence, and export in Part E.**

Design the JSON shape of a stored order. Which fields, which money unit, and how do you record a coupon that was entered but not applied? Document the shape here.

Resolution must include schema version, IDs/timestamps, line/configuration snapshot, quantities, payment label, coupon attempt and applied discount, full computed totals/breakdown, money unit, and enough immutable data for analytics/export without depending on future menu changes.

## C1 — Money representation and TC-06 VAT rounding

**Status: UNRESOLVED — hard gate: complete before writing `priceCart`.**

Explain why storing 679.50 as a JavaScript float is risky for TC-06, and show by hand how the VAT of 75.48 in TC-06 is rounded.

Completion requires an integer-poisha explanation and the exact half-up intermediate calculation from discounted subtotal through VAT; code must then use the same rule.

## C2 — Assistant question-to-function contract

**Status: UNRESOLVED — hard gate: complete before writing Gemini integration.**

List every question the bot supports and the exact function (name, inputs, output) that answers it.

At minimum the mapping must cover order count, total revenue, best-selling option by units, revenue by payment method, average order value, number of orders that actually received the coupon, and orders on a given date. It must also define an unsupported-data function/result for questions such as “Who is our best customer?”
