# Smart Order Builder — Decisions and Checkpoints

The PDF requires D1–D6 to be answered in the author's own words (3–6 sentences each), implemented consistently, and explainable live. Checkpoints must be completed before their gated features. This planning pass records the exact prompts but intentionally does not choose product behavior on the user's behalf.

## D1 — Concurrent stock loss during edit

**Status: RESOLVED — shared IndexedDB transaction with preserved client draft.**

Two browser tabs share one server. Tab A is editing an item when tab B takes the last eggs. What does tab A see when it saves, and does the user lose anything they typed?

I will keep the authoritative mock-server state in one same-origin IndexedDB record and execute each reserve, edit, remove, or expiry cleanup as one `readwrite` transaction; IndexedDB serializes overlapping writers across tabs, so every operation validates against the latest committed stock. If Tab B takes the last eggs before Tab A saves, Tab A's atomic edit returns every current shortage, while the existing item/reservation stays unchanged and the edit request remains available as the client's unsaved draft. Tab A sees “Stock changed while you were editing. Your changes were not saved. Short: 1 egg,” and can adjust or retry without an automatic overwrite. BroadcastChannel is used only to prompt other tabs to refresh after commits, not as the lock, and this guarantee is limited to tabs in the same browser profile/origin; environments without IndexedDB fall back to explicitly single-context memory rather than pretending to be shared.

## D2 — Price lock timing

**Status: RESOLVED — price locks at successful checkout.**

Promotions change while an item sits in the cart (the coupon stops at 11:00). Decide when a price is locked: at Add to Cart, at checkout, or never. The choice must remain consistent with TC-06 and TC-07.

I will lock the price when checkout succeeds, not when an item is added to the cart. Builder previews and cart totals are estimates recomputed from the current API menu/promotions and authoritative server time, so the same cart receives C2 at 10:59:59 in TC-06 but C1 at exactly 11:00:00 in TC-07. The Pay transaction will call the same pure pricing engine once with its server timestamp and persist that complete breakdown as the order's immutable totals. Later promotion or menu changes will not reprice a stored order, while seed orders will be priced once using each order's historical `createdAt` as required.

## D3 — Reservation expiry during edit

**Status: RESOLVED — expire the reservation, preserve the detached draft.**

A reservation expires while the user is in the middle of editing that item. Decide what happens to unsaved changes and what the screen tells the user.

At the exact server-time expiry, the server releases the reservation once and the original cart item becomes read-only but remains removable. If an edit is open or its save reaches the server after expiry, the edit is rejected without changing the expired item, while the client keeps the unsaved configuration as a detached draft. The screen tells the user “This reservation expired. Your changes were not saved; the original item is read-only,” and offers to add the preserved draft as a new item with a new idempotency key and a fresh atomic stock check. Reusing the draft never revives or extends the expired reservation.

## D4 — Order authority and Pay idempotency

**Status: RESOLVED — mock server owns identity, time, and atomic Pay replay.**

Who creates the order ID and timestamp, the browser or the server, and how do you stop a double-click on Pay from creating two orders?

The mock server creates both the order ID and `createdAt` using injected generators and its authoritative clock; the browser never supplies either value. The browser creates one Pay idempotency key per logical attempt and reuses it for double-clicks and retries, while the server stores the successful request fingerprint and resulting order ID in the same transaction as the order, sold reservations, and emptied cart. Replaying the same key and request returns the original order with `replayed: true`, while reusing that key for different payment or coupon input returns an idempotency conflict. Validation, expiry cleanup, final pricing, conversion to sold stock, order insertion, cart clearing, and idempotency recording form one atomic store transaction, so a pre-commit failure creates no order and leaves active reservations retryable.

## D5 — Unsupported “best customer” query

**Status: UNRESOLVED — blocks final assistant guardrails in Part F.**

Someone asks “Who is our best customer?” but orders store no customer. Decide what the bot replies and how you stop it from inventing a name.

Resolution must cover tool availability/schema checks, a deterministic unsupported-data result, model instructions, and a test matching TC-20.

## D6 — Stored order JSON shape

**Status: RESOLVED — versioned immutable order snapshot in integer poisha.**

Design the JSON shape of a stored order. Which fields, which money unit, and how do you record a coupon that was entered but not applied? Document the shape here.

Each stored order is a schema-versioned immutable snapshot with server-owned identity/time, `BDT` currency, explicit `poisha` money units, the payment-method label, line quantities/configurations, and product/option names and prices copied from the menu at checkout or seed initialization. `coupon.attemptedCode` records what was entered even when it was invalid or lost to C1, while `coupon.status`, `applied`, `matchedPromotionId`, and `appliedDiscountPoisha` record the actual pricing outcome without inference. The complete pricing breakdown is stored in integer poisha, including line amounts, promotion discounts, cart-discount candidates and winner, VAT, pre-round payable, and final payable, so historical analytics never depend on future menu or promotion changes. `orders.json` exports one envelope containing `schemaVersion`, `currency`, `moneyUnit`, and every seed and new stored order in this same shape.

```ts
interface StoredOrder {
  schemaVersion: 1
  id: string
  createdAt: string
  currency: 'BDT'
  moneyUnit: 'poisha'
  paymentMethod: 'card' | 'bkash' | 'cash'
  coupon: {
    attemptedCode: string | null
    status: CouponPricingStatus
    matchedPromotionId: string | null
    applied: boolean
    appliedDiscountPoisha: number
  }
  lines: Array<{
    id: string
    quantity: number
    product: { id: string; name: string; basePricePoisha: number }
    selections: Array<{
      groupId: string
      groupName: string
      optionId: string
      optionName: string
      quantity: number
      unitPricePoisha: number
    }>
    pricing: LinePricingBreakdown
  }>
  pricing: PricingBreakdown
}

interface OrdersExport {
  schemaVersion: 1
  currency: 'BDT'
  moneyUnit: 'poisha'
  orders: StoredOrder[]
}
```

## C1 — Money representation and TC-06 VAT rounding

**Status: COMPLETE — integer-poisha calculation defined before `priceCart`.**

Explain why storing 679.50 as a JavaScript float is risky for TC-06, and show by hand how the VAT of 75.48 in TC-06 is rounded.

JavaScript numbers use binary floating point, so many decimal currency fractions cannot be represented exactly; repeated percentage operations can produce values just below or above a half-poisha boundary and make an ordinary `Math.round` produce the wrong assessment result. I will therefore store 679.50 BDT as the exact integer `67,950` poisha and perform each percentage as integer numerator/denominator arithmetic with explicit half-up rounding.

For TC-06, the cart subtotal is 1,659.50 BDT = `165,950` poisha and C2 removes 150.00 BDT = `15,000` poisha, leaving `150,950` poisha. VAT before rounding is `150,950 × 500 / 10,000 = 7,547.5` poisha, so half-up rounding takes the `.5` upward to `7,548` poisha = **75.48 BDT**. The pre-final-round payable is `150,950 + 7,548 = 158,498` poisha = 1,584.98 BDT; final half-up rounding to whole BDT produces `158,500` poisha = **1,585 BDT**.

## C2 — Assistant question-to-function contract

**Status: UNRESOLVED — hard gate: complete before writing Gemini integration.**

List every question the bot supports and the exact function (name, inputs, output) that answers it.

At minimum the mapping must cover order count, total revenue, best-selling option by units, revenue by payment method, average order value, number of orders that actually received the coupon, and orders on a given date. It must also define an unsupported-data function/result for questions such as “Who is our best customer?”
