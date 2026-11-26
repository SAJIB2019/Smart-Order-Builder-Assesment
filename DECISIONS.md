# Smart Order Builder — Decisions and Checkpoints

The PDF requires D1–D6 to be answered in the author's own words (3–6 sentences each), implemented consistently, and explainable live. Checkpoints were completed before their gated features. The answers below describe the current implementation, but every section remains explicitly marked for the author's personal review and rewriting before submission.

## D1 — Concurrent stock loss during edit

**Status: RESOLVED — shared IndexedDB transaction with preserved client draft.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

Two browser tabs share one server. Tab A is editing an item when tab B takes the last eggs. What does tab A see when it saves, and does the user lose anything they typed?

I keep the authoritative mock-server state in one same-origin IndexedDB record and execute each reserve, edit, remove, or expiry cleanup as one `readwrite` transaction; IndexedDB serializes overlapping writers across tabs, so every operation validates against the latest committed stock. If Tab B takes the last eggs before Tab A saves, Tab A's atomic edit returns every current shortage, while the existing item/reservation stays unchanged and the form retains the unsaved values. Tab A sees the current shortage, such as “Short: 1 egg,” and can adjust or retry without an automatic overwrite. BroadcastChannel is used only to prompt other tabs to refresh after commits, not as the lock, and this guarantee is limited to tabs in the same browser profile/origin; environments without IndexedDB fall back to explicitly single-context memory rather than pretending to be shared.

## D2 — Price lock timing

**Status: RESOLVED — price locks at successful checkout.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

Promotions change while an item sits in the cart (the coupon stops at 11:00). Decide when a price is locked: at Add to Cart, at checkout, or never. The choice must remain consistent with TC-06 and TC-07.

I will lock the price when checkout succeeds, not when an item is added to the cart. Builder previews and cart totals are estimates recomputed from the current API menu/promotions and authoritative server time, so the same cart receives C2 at 10:59:59 in TC-06 but C1 at exactly 11:00:00 in TC-07. The Pay transaction will call the same pure pricing engine once with its server timestamp and persist that complete breakdown as the order's immutable totals. Later promotion or menu changes will not reprice a stored order, while seed orders will be priced once using each order's historical `createdAt` as required.

## D3 — Reservation expiry during edit

**Status: RESOLVED — expire the reservation and keep unsaved form values visible.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

A reservation expires while the user is in the middle of editing that item. Decide what happens to unsaved changes and what the screen tells the user.

At the exact server-time expiry, the server releases the reservation once and the original cart item becomes read-only but remains removable. If an edit is open or its save reaches the server after expiry, the edit is rejected without changing the expired item, while the form keeps the unsaved configuration visible. The screen tells the user “This reservation expired. Your changes were not saved; the original item is read-only”; the user may inspect those values, but must cancel the expired edit and configure a new Add operation to request a fresh hold. Nothing revives or extends the expired reservation, and the new Add receives a new idempotency key and a fresh atomic stock check.

## D4 — Order authority and Pay idempotency

**Status: RESOLVED — mock server owns identity, time, and atomic Pay replay.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

Who creates the order ID and timestamp, the browser or the server, and how do you stop a double-click on Pay from creating two orders?

The mock server creates both the order ID and `createdAt` using injected generators and its authoritative clock; the browser never supplies either value. The browser creates one Pay idempotency key per logical attempt and reuses it for double-clicks and retries, while the server stores the successful request fingerprint and resulting order ID in the same transaction as the order, sold reservations, and emptied cart. Replaying the same key and request returns the original order with `replayed: true`, while reusing that key for different payment or coupon input returns an idempotency conflict. Validation, expiry cleanup, final pricing, conversion to sold stock, order insertion, cart clearing, and idempotency recording form one atomic store transaction, so a pre-commit failure creates no order and leaves active reservations retryable.

## D5 — Unsupported “best customer” query

**Status: RESOLVED — closed tool registry with a deterministic limitation response.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

Someone asks “Who is our best customer?” but orders store no customer. Decide what the bot replies and how you stop it from inventing a name.

The assistant exposes a closed, code-owned tool registry and validates both every model-proposed tool name and its arguments before any function can execute. Because the stored-order schema has no customer identity, “Who is our best customer?” is routed to `explainDataLimitation({ subject: 'customer' })`, which returns a fixed result explaining that customer rankings cannot be computed from this data. The system instruction forbids names or facts outside tool results, and the limitation result is rendered directly by TypeScript rather than sent through another model turn, so Gemini has no opportunity to invent a customer. Unknown tools, malformed arguments, and unsupported subjects are rejected safely and covered by the TC-20 test.

## D6 — Stored order JSON shape

**Status: RESOLVED — versioned immutable order snapshot in integer poisha.**

> **Personal review required:** Approve or rewrite this explanation in your own words before submission.

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

> **Personal review required:** Approve or rewrite this checkpoint answer in your own words before submission.

Explain why storing 679.50 as a JavaScript float is risky for TC-06, and show by hand how the VAT of 75.48 in TC-06 is rounded.

JavaScript numbers use binary floating point, so many decimal currency fractions cannot be represented exactly; repeated percentage operations can produce values just below or above a half-poisha boundary and make an ordinary `Math.round` produce the wrong assessment result. I will therefore store 679.50 BDT as the exact integer `67,950` poisha and perform each percentage as integer numerator/denominator arithmetic with explicit half-up rounding.

For TC-06, the cart subtotal is 1,659.50 BDT = `165,950` poisha and C2 removes 150.00 BDT = `15,000` poisha, leaving `150,950` poisha. VAT before rounding is `150,950 × 500 / 10,000 = 7,547.5` poisha, so half-up rounding takes the `.5` upward to `7,548` poisha = **75.48 BDT**. The pre-final-round payable is `150,950 + 7,548 = 158,498` poisha = 1,584.98 BDT; final half-up rounding to whole BDT produces `158,500` poisha = **1,585 BDT**.

## C2 — Assistant question-to-function contract

**Status: COMPLETE — closed deterministic statistics-tool contract.**

> **Personal review required:** Approve or rewrite this checkpoint answer in your own words before submission.

List every question the bot supports and the exact function (name, inputs, output) that answers it.

Gemini receives only the function declarations below and the staff question; it never receives the orders JSON or calculates a number. After one validated selection, TypeScript loads the latest persisted orders, executes the matching pure function, and returns a compact computed result for Gemini to phrase. Every monetary result is integer poisha, best-selling units are `line quantity × option quantity`, coupon usage requires `coupon.applied === true`, and dates are interpreted in `Asia/Dhaka`.

| Supported question | Pure function and inputs | Tool arguments | Output |
|---|---|---|---|
| “How many orders?” | `getOrderCount(orders)` | `{}` | `{ orderCount: number }` |
| “What is total revenue?” | `getTotalRevenue(orders)` | `{}` | `{ totalRevenuePoisha: Poisha, currency: 'BDT', moneyUnit: 'poisha' }` |
| “What is the best-selling option?” | `getBestSellingOption(orders)` | `{}` | `{ optionId, optionName, units } \| null` |
| “Show revenue by payment method.” | `getRevenueByPaymentMethod(orders)` | `{}` | `{ cardPoisha, bkashPoisha, cashPoisha, currency: 'BDT', moneyUnit: 'poisha' }` |
| “What is average order value?” | `getAverageOrderValue(orders)` | `{}` | `{ averageOrderValuePoisha, orderCount, totalRevenuePoisha, currency: 'BDT', moneyUnit: 'poisha' }` |
| “How many orders actually received the coupon?” | `getCouponUsageCount(orders)` | `{}` | `{ couponUsageCount: number }` |
| “How many orders were placed on YYYY-MM-DD?” | `getOrdersByDate(orders, date, 'Asia/Dhaka')` | `{ date: string }`, strict `YYYY-MM-DD` | `{ date, timeZone: 'Asia/Dhaka', orderCount, orderIds }` |
| Unsupported or customer-dependent question | `explainDataLimitation(subject)` | `{ subject: 'customer' \| 'unsupported' }` | `{ supported: false, subject, message }` |
