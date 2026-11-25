import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import { serializeOrdersExport } from '../../src/domain/orders/export-orders'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'
import { CartService } from '../../src/mocks/services/cart-service'
import { OrderService } from '../../src/mocks/services/order-service'
import { ServerClock } from '../../src/mocks/services/server-clock'
import { createIndexedDbMockStore } from '../../src/mocks/store/indexed-db-mock-store'
import type { MockStoreState } from '../../src/mocks/store/mock-store'

describe('Part E official checkout and order acceptance tests', () => {
  it('TC-16 turns two rapid Pay requests into one order and protects sold stock', async () => {
    const indexedDb = new IDBFactory()
    const store = createIndexedDbMockStore(buildYourBreakfastFixture, {
      indexedDb,
      databaseName: 'tc-16-pay-idempotency',
      broadcastChannelName: null,
    })
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:00:00.000Z') },
      0,
    )
    const cart = new CartService({ store, clock })
    const orders = new OrderService({
      store,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-TC-16' },
    })

    try {
      await cart.addItem({
        idempotencyKey: 'tc-16-add',
        configuration: configurationA(),
        quantity: 1,
      })
      const request = {
        idempotencyKey: 'tc-16-pay',
        paymentMethod: 'card' as const,
        attemptedCouponCode: null,
      }
      const [first, second] = await Promise.all([
        orders.checkout(request),
        orders.checkout(request),
      ])
      const snapshot = await store.getSnapshot()

      expect(first.result.ok).toBe(true)
      expect(second.result.ok).toBe(true)
      expect(snapshot.orders).toHaveLength(7)
      expect(
        snapshot.orders.filter(({ id }) => id === 'ORD-TC-16'),
      ).toHaveLength(1)
      expect(snapshot.cartItems).toEqual([])
      expect(
        snapshot.reservations.filter(
          (reservation) => reservation.status === 'convertedToSale',
        ),
      ).toHaveLength(1)
      expect(finiteQuantity(snapshot, 'egg')).toBe(8)

      await cart.expireReservations()
      expect(finiteQuantity(await store.getSnapshot(), 'egg')).toBe(8)
    } finally {
      await store.dispose?.()
    }
  })

  it('TC-17 survives refresh and exports every order as documented JSON', async () => {
    const indexedDb = new IDBFactory()
    const databaseName = 'tc-17-persistent-export'
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:59:59+06:00') },
      0,
    )
    const firstStore = createIndexedDbMockStore(buildYourBreakfastFixture, {
      indexedDb,
      databaseName,
      broadcastChannelName: null,
    })
    const cart = new CartService({ store: firstStore, clock })
    const checkout = new OrderService({
      store: firstStore,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-TC-17' },
    })

    await cart.addItem({
      idempotencyKey: 'tc-17-add',
      configuration: configurationA(),
      quantity: 1,
    })
    successful(
      await checkout.checkout({
        idempotencyKey: 'tc-17-pay',
        paymentMethod: 'bkash',
        attemptedCouponCode: 'MORNING15',
      }),
    )
    await firstStore.dispose?.()

    const refreshedStore = createIndexedDbMockStore(buildYourBreakfastFixture, {
      indexedDb,
      databaseName,
      broadcastChannelName: null,
    })
    try {
      const refreshedOrders = new OrderService({
        store: refreshedStore,
        clock,
        seedOrders: buildYourBreakfastFixture.seedOrders,
      })
      const exported = successful(await refreshedOrders.getOrdersExport())
      const downloadedJson = serializeOrdersExport(exported)
      const parsed = JSON.parse(downloadedJson) as typeof exported

      expect(parsed.schemaVersion).toBe(1)
      expect(parsed.currency).toBe('BDT')
      expect(parsed.moneyUnit).toBe('poisha')
      expect(parsed.orders).toHaveLength(7)
      expect(parsed.orders.at(-1)).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          id: 'ORD-TC-17',
          currency: 'BDT',
          moneyUnit: 'poisha',
          paymentMethod: 'bkash',
          coupon: expect.objectContaining({
            attemptedCode: 'MORNING15',
            applied: true,
          }),
          pricing: expect.objectContaining({ payable: 33_900 }),
        }),
      )
    } finally {
      await refreshedStore.dispose?.()
    }
  })
})

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

function finiteQuantity(state: MockStoreState, ingredientId: string): number {
  const availability = state.stock.levels.find(
    (level) => level.ingredientId === ingredientId,
  )?.availability
  if (availability?.type !== 'finite') throw new Error('Expected finite stock')
  return availability.quantity
}
