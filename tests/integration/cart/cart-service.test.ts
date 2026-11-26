import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type {
  AddCartItemRequest,
  EditCartItemRequest,
} from '../../../src/domain/types/cart'
import type { Configuration } from '../../../src/domain/types/menu'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import {
  CartService,
  type CartFailureInjector,
} from '../../../src/mocks/services/cart-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { createIndexedDbMockStore } from '../../../src/mocks/store/indexed-db-mock-store'

describe('authoritative cart service', () => {
  it('enforces duplicate idempotency keys at the server transaction boundary', async () => {
    const harness = createHarness()
    const request = addRequest('same-operation', configurationB(), 1)

    const [first, replay] = await Promise.all([
      harness.service.addItem(request),
      harness.service.addItem(request),
    ])
    const snapshot = await harness.store.getSnapshot()

    expect(first.result.ok).toBe(true)
    expect(replay.result.ok).toBe(true)
    expect(snapshot.cartItems).toHaveLength(1)
    expect(snapshot.reservations).toHaveLength(1)
    expect(snapshot.idempotencyRecords).toHaveLength(1)
    expect(
      [first, replay].map((outcome) =>
        outcome.result.ok ? outcome.result.data.replayed : null,
      ),
    ).toEqual([false, true])
  })

  it('rejects reuse of an idempotency key for a different logical request', async () => {
    const harness = createHarness()
    await harness.service.addItem(addRequest('reused-key', configurationA(), 1))
    const conflict = await harness.service.addItem(
      addRequest('reused-key', configurationB(), 1),
    )

    expect(conflict.result).toEqual({
      ok: false,
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key was already used for another request',
      },
    })
    expect((await harness.store.getSnapshot()).cartItems).toHaveLength(1)
  })

  it('leaves no stock or reservation changes when an injected add failure occurs', async () => {
    const failures = mutableFailures()
    failures.failAdd = true
    const harness = createHarness(failures)
    const request = addRequest('retryable-add', configurationA(), 1)
    const failed = await harness.service.addItem(request)
    const afterFailure = await harness.store.getSnapshot()

    expect(failed.result).toEqual({
      ok: false,
      error: {
        code: 'TRANSIENT_ERROR',
        message: 'Reservation failed before commit',
        retryable: true,
      },
    })
    expect(afterFailure.stock).toEqual(buildYourBreakfastFixture.stock)
    expect(afterFailure.cartItems).toEqual([])
    expect(afterFailure.reservations).toEqual([])
    expect(afterFailure.idempotencyRecords).toEqual([])
    expect(request.configuration).toEqual(configurationA())

    failures.failAdd = false
    const retry = await harness.service.addItem(request)
    expect(retry.result.ok).toBe(true)
    expect((await harness.store.getSnapshot()).cartItems).toHaveLength(1)
  })

  it('preserves the previous item, reservation, and stock when an edit fails', async () => {
    const failures = mutableFailures()
    const harness = createHarness(failures)
    const added = success(
      await harness.service.addItem(
        addRequest('add-before-edit', configurationB(), 1),
      ),
    )
    const before = await harness.store.getSnapshot()
    failures.failEdit = true

    const failed = await harness.service.editItem(added.item.id, {
      configuration: configurationBEditAllowed(),
      quantity: 1,
      cartVersion: 1,
    })
    const after = await harness.store.getSnapshot()

    expect(failed.result.ok).toBe(false)
    expect(after.stock).toEqual(before.stock)
    expect(after.cartItems).toEqual(before.cartItems)
    expect(after.reservations).toEqual(before.reservations)
  })

  it('expires at five minutes, releases once, rejects edits, and remains removable', async () => {
    const harness = createHarness()
    const added = success(
      await harness.service.addItem(
        addRequest('expiring-item', configurationA(), 1),
      ),
    )
    const stockAfterAdd = await harness.service.getInventory()
    expect(finiteQuantity(success(stockAfterAdd), 'egg')).toBe(8)

    harness.advanceBrowserTime(5 * 60 * 1_000)
    const expired = success(await harness.service.expireReservations())
    expect(expired.expiredReservationIds).toEqual([added.reservation.id])
    expect(
      finiteQuantity((await harness.store.getSnapshot()).stock, 'egg'),
    ).toBe(10)

    const repeated = success(await harness.service.expireReservations())
    expect(repeated.expiredReservationIds).toEqual([])
    expect(
      finiteQuantity((await harness.store.getSnapshot()).stock, 'egg'),
    ).toBe(10)

    const edit = await harness.service.editItem(added.item.id, {
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 2,
    })
    expect(edit.result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'RESERVATION_EXPIRED' }),
    })

    const removed = success(
      await harness.service.removeItem(added.item.id, { cartVersion: 2 }),
    )
    expect(removed.removedCartItemId).toBe(added.item.id)
    expect(removed.cart.items).toEqual([])
    expect(
      finiteQuantity((await harness.store.getSnapshot()).stock, 'egg'),
    ).toBe(10)
  })

  it('returns server time from the clock running 90 seconds ahead', async () => {
    const harness = createHarness()
    const response = await harness.service.getCart()

    expect(Date.parse(response.serverTime) - harness.browserTime()).toBe(90_000)
  })
})

describe('cross-tab IndexedDB transactions', () => {
  it('serializes concurrent cart mutations and rejects the stale tab', async () => {
    const context = createSharedContexts('concurrent-stock')

    try {
      const [left, right] = await Promise.all([
        context.serviceA.addItem(addRequest('tab-a', configurationB(), 1)),
        context.serviceB.addItem(addRequest('tab-b', configurationB(), 1)),
      ])
      const outcomes = [left.result, right.result]
      const snapshot = await context.storeA.getSnapshot()

      expect(outcomes.filter((result) => result.ok)).toHaveLength(1)
      expect(
        outcomes.filter(
          (result) => !result.ok && result.error.code === 'CONFLICT',
        ),
      ).toHaveLength(1)
      expect(snapshot.cartItems).toHaveLength(1)
      expect(finiteQuantity(snapshot.stock, 'egg')).toBe(4)
    } finally {
      await context.dispose()
    }
  })

  it('deduplicates the same logical add across independent tab contexts', async () => {
    const context = createSharedContexts('concurrent-idempotency')
    const request = addRequest('shared-key', configurationA(), 1)

    try {
      const [left, right] = await Promise.all([
        context.serviceA.addItem(request),
        context.serviceB.addItem(request),
      ])
      const snapshot = await context.storeB.getSnapshot()

      expect(left.result.ok).toBe(true)
      expect(right.result.ok).toBe(true)
      expect(snapshot.cartItems).toHaveLength(1)
      expect(snapshot.reservations).toHaveLength(1)
      expect(snapshot.idempotencyRecords).toHaveLength(1)
    } finally {
      await context.dispose()
    }
  })

  it('preserves Tab A edit draft and reservation when Tab B consumes its needed stock', async () => {
    const context = createSharedContexts('concurrent-edit')

    try {
      const tabAItem = success(
        await context.serviceA.addItem(
          addRequest('tab-a-original', configurationA(), 1),
        ),
      )
      await context.serviceB.addItem(
        addRequest('tab-b-consumer', configurationB(), 1, 1),
      )
      const draft: EditCartItemRequest = {
        configuration: {
          ...configurationA(),
          selections: {
            ...configurationA().selections,
            scrambled: 6,
          },
        },
        quantity: 1,
        cartVersion: 1,
      }
      const staleEdit = await context.serviceA.editItem(tabAItem.item.id, draft)
      expect(staleEdit.result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'CONFLICT', currentVersion: 2 }),
      })

      const before = await context.storeA.getSnapshot()
      const edit = await context.serviceA.editItem(tabAItem.item.id, {
        ...draft,
        cartVersion: 2,
      })
      const after = await context.storeB.getSnapshot()

      expect(edit.result).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'INSUFFICIENT_STOCK',
          shortages: [{ ingredientId: 'egg', missingQuantity: 2 }],
        }),
      })
      expect(draft.configuration.selections.scrambled).toBe(6)
      expect(after.cartItems).toEqual(before.cartItems)
      expect(after.reservations).toEqual(before.reservations)
    } finally {
      await context.dispose()
    }
  })
})

interface MutableFailures extends CartFailureInjector {
  failAdd: boolean
  failEdit: boolean
}

function mutableFailures(): MutableFailures {
  return {
    failAdd: false,
    failEdit: false,
    shouldFail(operation) {
      return operation === 'add' ? this.failAdd : this.failEdit
    },
  }
}

function createHarness(failures: CartFailureInjector = mutableFailures()) {
  let browserTime = Date.parse('2026-11-25T10:00:00.000Z')
  let id = 0
  const store = createInMemoryMockStore(buildYourBreakfastFixture)
  const service = new CartService({
    store,
    clock: new ServerClock({ now: () => browserTime }),
    failures,
    ids: {
      cartItemId: () => `cart-${++id}`,
      reservationId: () => `reservation-${++id}`,
    },
  })

  return {
    store,
    service,
    browserTime: () => browserTime,
    advanceBrowserTime: (milliseconds: number) => {
      browserTime += milliseconds
    },
  }
}

function createSharedContexts(databaseName: string) {
  const indexedDb = new IDBFactory()
  const storeA = createIndexedDbMockStore(buildYourBreakfastFixture, {
    indexedDb,
    databaseName,
    broadcastChannelName: null,
  })
  const storeB = createIndexedDbMockStore(buildYourBreakfastFixture, {
    indexedDb,
    databaseName,
    broadcastChannelName: null,
  })
  let id = 0
  const clock = new ServerClock({
    now: () => Date.parse('2026-11-25T10:00:00.000Z'),
  })
  const ids = {
    cartItemId: () => `cart-${++id}`,
    reservationId: () => `reservation-${++id}`,
  }

  return {
    storeA,
    storeB,
    serviceA: new CartService({ store: storeA, clock, ids }),
    serviceB: new CartService({ store: storeB, clock, ids }),
    async dispose() {
      await storeA.dispose?.()
      await storeB.dispose?.()
    },
  }
}

function addRequest(
  idempotencyKey: string,
  configuration: Configuration,
  quantity: number,
  cartVersion = 0,
): AddCartItemRequest {
  return { idempotencyKey, configuration, quantity, cartVersion }
}

function success<T>(outcome: {
  readonly result:
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: unknown }
}): T {
  if (!outcome.result.ok) throw new Error('Expected successful operation')
  return outcome.result.data
}

function finiteQuantity(
  stock: typeof buildYourBreakfastFixture.stock,
  ingredientId: string,
): number {
  const availability = stock.levels.find(
    (level) => level.ingredientId === ingredientId,
  )?.availability
  if (availability?.type !== 'finite') throw new Error('Expected finite stock')
  return availability.quantity
}

function configurationA(): Configuration {
  return {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
}

function configurationB(): Configuration {
  return {
    selections: {
      croissant: 1,
      omelette: 2,
      fried: 2,
      sausage: 1,
      bacon: 1,
      hashbrown: 1,
      mushroom: 1,
      hollandaise: 1,
    },
  }
}

function configurationBEditAllowed(): Configuration {
  return {
    selections: {
      ...configurationB().selections,
      omelette: 1,
      fried: 3,
    },
  }
}
