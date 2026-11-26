import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type { CheckoutRequest } from '../../../src/domain/types/order'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { CartService } from '../../../src/mocks/services/cart-service'
import {
  OrderService,
  type CheckoutFailureInjector,
} from '../../../src/mocks/services/order-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { createIndexedDbMockStore } from '../../../src/mocks/store/indexed-db-mock-store'

describe('atomic checkout and persistent orders', () => {
  it('converts active reservations to one order and keeps sold stock consumed', async () => {
    const harness = createHarness()
    const added = successful(
      await harness.cart.addItem({
        idempotencyKey: 'add-a',
        configuration: configurationA(),
        quantity: 1,
        cartVersion: 0,
      }),
    )

    const checkedOut = successful(
      await harness.orders.checkout(checkoutRequest('pay-a')),
    )
    const snapshot = await harness.store.getSnapshot()

    expect(checkedOut.order.id).toBe('ORD-NEW-1')
    expect(checkedOut.order.createdAt).toBe('2026-11-25T10:01:30.000Z')
    expect(checkedOut.order.paymentMethod).toBe('card')
    expect(checkedOut.cart.items).toEqual([])
    expect(snapshot.orders).toHaveLength(7)
    expect(snapshot.cartItems).toEqual([])
    expect(
      snapshot.reservations.find(
        (reservation) => reservation.id === added.reservation.id,
      )?.status,
    ).toBe('convertedToSale')
    expect(finiteQuantity(snapshot, 'egg')).toBe(8)

    harness.advance(600_000)
    await harness.cart.expireReservations()
    expect(finiteQuantity(await harness.store.getSnapshot(), 'egg')).toBe(8)
  })

  it('rejects an empty or fully expired cart without creating an order', async () => {
    const emptyHarness = createHarness()
    const empty = await emptyHarness.orders.checkout(
      checkoutRequest('empty', 0),
    )
    expect(empty.result).toEqual({
      ok: false,
      error: { code: 'EMPTY_CART', message: 'Cart has no active items' },
    })
    expect((await emptyHarness.store.getSnapshot()).orders).toHaveLength(6)

    const expiredHarness = createHarness()
    await expiredHarness.cart.addItem({
      idempotencyKey: 'expiring-add',
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 0,
    })
    expiredHarness.advance(300_000)
    const expiredCart = successful(await expiredHarness.cart.getCart())
    const expired = await expiredHarness.orders.checkout(
      checkoutRequest('expired-pay', expiredCart.version),
    )
    const snapshot = await expiredHarness.store.getSnapshot()

    expect(expired.result).toEqual({
      ok: false,
      error: { code: 'EMPTY_CART', message: 'Cart has no active items' },
    })
    expect(snapshot.orders).toHaveLength(6)
    expect(snapshot.reservations[0]?.status).toBe('expired')
    expect(finiteQuantity(snapshot, 'egg')).toBe(10)
  })

  it('deduplicates concurrent Pay requests and rejects changed key reuse', async () => {
    const harness = createHarness()
    await harness.cart.addItem({
      idempotencyKey: 'add-once',
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 0,
    })
    const request = checkoutRequest('one-logical-pay')
    const [first, replay] = await Promise.all([
      harness.orders.checkout(request),
      harness.orders.checkout(request),
    ])

    expect(first.result.ok).toBe(true)
    expect(replay.result.ok).toBe(true)
    expect(
      [first, replay].map((outcome) =>
        outcome.result.ok ? outcome.result.data.replayed : null,
      ),
    ).toEqual([false, true])
    expect((await harness.store.getSnapshot()).orders).toHaveLength(7)

    const conflict = await harness.orders.checkout({
      ...request,
      paymentMethod: 'cash',
    })
    expect(conflict.result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
    })
  })

  it('leaves the cart, hold, stock, and idempotency state intact on failure', async () => {
    const failures = mutableFailure()
    const harness = createHarness(failures)
    await harness.orders.getOrders()
    await harness.cart.addItem({
      idempotencyKey: 'failure-add',
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 0,
    })
    const before = await harness.store.getSnapshot()
    failures.fail = true

    const failed = await harness.orders.checkout(
      checkoutRequest('retryable-pay'),
    )
    const after = await harness.store.getSnapshot()

    expect(failed.result).toEqual({
      ok: false,
      error: {
        code: 'TRANSIENT_ERROR',
        message: 'Payment failed before commit',
        retryable: true,
      },
    })
    expect(after.orders).toEqual(before.orders)
    expect(after.cartItems).toEqual(before.cartItems)
    expect(after.reservations).toEqual(before.reservations)
    expect(after.stock).toEqual(before.stock)
    expect(
      after.idempotencyRecords.filter(
        ({ operation }) => operation === 'checkout',
      ),
    ).toEqual([])

    failures.fail = false
    expect(
      (await harness.orders.checkout(checkoutRequest('retryable-pay'))).result
        .ok,
    ).toBe(true)
  })

  it('initializes seeds once and exports valid versioned JSON', async () => {
    const harness = createHarness()
    const first = successful(await harness.orders.getOrders())
    const second = successful(await harness.orders.getOrders())
    const exported = successful(await harness.orders.getOrdersExport())
    const parsed = JSON.parse(JSON.stringify(exported)) as typeof exported

    expect(first.orders).toHaveLength(6)
    expect(second.orders).toHaveLength(6)
    expect(new Set(second.orders.map(({ id }) => id)).size).toBe(6)
    expect((await harness.store.getSnapshot()).stock).toEqual(
      buildYourBreakfastFixture.stock,
    )
    expect(parsed).toEqual(exported)
    expect(parsed).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        currency: 'BDT',
        moneyUnit: 'poisha',
        orders: expect.any(Array),
      }),
    )
  })

  it('persists seed and newly checked-out orders across IndexedDB contexts', async () => {
    const indexedDb = new IDBFactory()
    const databaseName = 'orders-persistence-test'
    const firstStore = createIndexedDbMockStore(buildYourBreakfastFixture, {
      indexedDb,
      databaseName,
      broadcastChannelName: null,
    })
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:00:00.000Z') },
      0,
    )
    const cart = new CartService({ store: firstStore, clock })
    const firstService = new OrderService({
      store: firstStore,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-PERSISTED' },
    })

    await cart.addItem({
      idempotencyKey: 'persist-add',
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 0,
    })
    successful(await firstService.checkout(checkoutRequest('persist-pay')))
    await firstStore.dispose?.()

    const refreshedStore = createIndexedDbMockStore(buildYourBreakfastFixture, {
      indexedDb,
      databaseName,
      broadcastChannelName: null,
    })
    try {
      const refreshed = new OrderService({
        store: refreshedStore,
        clock,
        seedOrders: buildYourBreakfastFixture.seedOrders,
      })
      const orders = successful(await refreshed.getOrders()).orders
      expect(orders).toHaveLength(7)
      expect(orders.at(-1)?.id).toBe('ORD-PERSISTED')
    } finally {
      await refreshedStore.dispose?.()
    }
  })
})

interface MutableFailure extends CheckoutFailureInjector {
  fail: boolean
}

function mutableFailure(): MutableFailure {
  return {
    fail: false,
    shouldFailCheckout() {
      return this.fail
    },
  }
}

function createHarness(failures?: CheckoutFailureInjector) {
  let browserTime = Date.parse('2026-11-25T10:00:00.000Z')
  let itemId = 0
  let orderId = 0
  const store = createInMemoryMockStore(buildYourBreakfastFixture)
  const clock = new ServerClock({ now: () => browserTime })
  const cart = new CartService({
    store,
    clock,
    ids: {
      cartItemId: () => `cart-${++itemId}`,
      reservationId: () => `reservation-${itemId}`,
    },
  })
  const orders = new OrderService({
    store,
    clock,
    seedOrders: buildYourBreakfastFixture.seedOrders,
    ids: { orderId: () => `ORD-NEW-${++orderId}` },
    ...(failures ? { failures } : {}),
  })

  return {
    store,
    cart,
    orders,
    advance(milliseconds: number) {
      browserTime += milliseconds
    },
  }
}

function checkoutRequest(
  idempotencyKey: string,
  cartVersion = 1,
): CheckoutRequest {
  return {
    idempotencyKey,
    paymentMethod: 'card',
    attemptedCouponCode: null,
    cartVersion,
  }
}

function configurationA() {
  return {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
}

function successful<T>(outcome: {
  readonly result:
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: unknown }
}): T {
  if (!outcome.result.ok) throw new Error('Expected successful operation')
  return outcome.result.data
}

function finiteQuantity(
  state: Awaited<
    ReturnType<ReturnType<typeof createHarness>['store']['getSnapshot']>
  >,
  ingredientId: string,
): number {
  const availability = state.stock.levels.find(
    (level) => level.ingredientId === ingredientId,
  )?.availability
  if (availability?.type !== 'finite') throw new Error('Expected finite stock')
  return availability.quantity
}
