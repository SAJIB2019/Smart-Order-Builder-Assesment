# Smart Order Builder — Decisions and Checkpoints

The PDF requires D1–D6 to be answered in the author's own words (3–6 sentences each), implemented consistently, and explainable live. Checkpoints must be completed before their gated features. This planning pass records the exact prompts but intentionally does not choose product behavior on the user's behalf.

## D1 — Concurrent stock loss during edit

**Status: DRAFT FOR PERSONAL REVIEW — NOT APPROVED. Part D's conflicting-save UX remains gated.**

Two browser tabs share one server. Tab A is editing an item when tab B takes the last eggs. What does tab A see when it saves, and does the user lose anything they typed?

**Proposed draft:** Each edit request sends the reservation ID and the store version that Tab A last read, and the mock server checks that version plus the net stock change in one atomic operation. If Tab B has already changed stock, Tab A's save changes nothing; the server returns a conflict with the latest version and stock snapshot, and the client revalidates the preserved draft to show the exact shortages. Tab A keeps every unsaved selection, while the existing cart item and reservation remain unchanged, and sees a message such as “Stock changed in another tab. Your changes were not saved. Short: 1 egg.” The user can adjust the preserved draft or retry against the refreshed version; no automatic overwrite or silent draft loss is allowed.

Review note: this is a proposed behavior, not the author's final D1 answer. Cross-tab transport and the save-conflict UI are intentionally not implemented in Part B; approval and the authoritative Part D transaction layer are still required.

## D2 — Price lock timing

**Status: RESOLVED — price locks at successful checkout.**

Promotions change while an item sits in the cart (the coupon stops at 11:00). Decide when a price is locked: at Add to Cart, at checkout, or never. The choice must remain consistent with TC-06 and TC-07.

I will lock the price when checkout succeeds, not when an item is added to the cart. Builder previews and cart totals are estimates recomputed from the current API menu/promotions and authoritative server time, so the same cart receives C2 at 10:59:59 in TC-06 but C1 at exactly 11:00:00 in TC-07. The Pay transaction will call the same pure pricing engine once with its server timestamp and persist that complete breakdown as the order's immutable totals. Later promotion or menu changes will not reprice a stored order, while seed orders will be priced once using each order's historical `createdAt` as required.

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

**Status: COMPLETE — integer-poisha calculation defined before `priceCart`.**

Explain why storing 679.50 as a JavaScript float is risky for TC-06, and show by hand how the VAT of 75.48 in TC-06 is rounded.

JavaScript numbers use binary floating point, so many decimal currency fractions cannot be represented exactly; repeated percentage operations can produce values just below or above a half-poisha boundary and make an ordinary `Math.round` produce the wrong assessment result. I will therefore store 679.50 BDT as the exact integer `67,950` poisha and perform each percentage as integer numerator/denominator arithmetic with explicit half-up rounding.

For TC-06, the cart subtotal is 1,659.50 BDT = `165,950` poisha and C2 removes 150.00 BDT = `15,000` poisha, leaving `150,950` poisha. VAT before rounding is `150,950 × 500 / 10,000 = 7,547.5` poisha, so half-up rounding takes the `.5` upward to `7,548` poisha = **75.48 BDT**. The pre-final-round payable is `150,950 + 7,548 = 158,498` poisha = 1,584.98 BDT; final half-up rounding to whole BDT produces `158,500` poisha = **1,585 BDT**.

## C2 — Assistant question-to-function contract

**Status: UNRESOLVED — hard gate: complete before writing Gemini integration.**

List every question the bot supports and the exact function (name, inputs, output) that answers it.

At minimum the mapping must cover order count, total revenue, best-selling option by units, revenue by payment method, average order value, number of orders that actually received the coupon, and orders on a given date. It must also define an unsupported-data function/result for questions such as “Who is our best customer?”
