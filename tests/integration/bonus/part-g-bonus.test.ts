import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'

import type { Configuration } from '../../../src/domain/types/menu'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { CartService } from '../../../src/mocks/services/cart-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createIndexedDbMockStore } from '../../../src/mocks/store/indexed-db-mock-store'
import type { MockStoreState } from '../../../src/mocks/store/mock-store'
import {
  createConfigurationDraft,
  createLocalStorageDraftRepository,
  revalidateConfigurationDraft,
} from '../../../src/services/drafts/configuration-draft'

describe('Part G bonus behavior', () => {
  it('preserves an active reservation across a browser refresh', async () => {
    const context = createRefreshContext('bonus-active-refresh')
    const firstStore = context.openStore()
    const firstService = context.createService(firstStore)

    const added = success(
      await firstService.addItem({
        idempotencyKey: 'active-before-refresh',
        configuration: configurationA(),
        quantity: 1,
        cartVersion: 0,
      }),
    )
    await firstStore.dispose?.()

    const refreshedStore = context.openStore()
    try {
      const refreshedCart = success(
        await context.createService(refreshedStore).getCart(),
      )

      expect(refreshedCart.version).toBe(1)
      expect(refreshedCart.items).toEqual([added.item])
      expect(refreshedCart.reservations).toEqual([added.reservation])
      expect(finiteStock(await refreshedStore.getSnapshot(), 'egg')).toBe(8)
    } finally {
      await refreshedStore.dispose?.()
    }
  })

  it('expires a stale reservation on refresh and never releases it twice', async () => {
    const context = createRefreshContext('bonus-expired-refresh')
    const firstStore = context.openStore()
    const firstService = context.createService(firstStore)

    await firstService.addItem({
      idempotencyKey: 'expired-before-refresh',
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 0,
    })
    await firstStore.dispose?.()
    context.advance(5 * 60 * 1_000)

    const expiredStore = context.openStore()
    const expiredCart = success(
      await context.createService(expiredStore).getCart(),
    )
    expect(expiredCart.version).toBe(2)
    expect(expiredCart.reservations[0]?.status).toBe('expired')
    expect(finiteStock(await expiredStore.getSnapshot(), 'egg')).toBe(10)
    await expiredStore.dispose?.()

    const secondRefreshStore = context.openStore()
    try {
      const secondRefresh = success(
        await context.createService(secondRefreshStore).getCart(),
      )
      expect(secondRefresh.version).toBe(2)
      expect(secondRefresh.reservations[0]?.status).toBe('expired')
      expect(finiteStock(await secondRefreshStore.getSnapshot(), 'egg')).toBe(
        10,
      )
    } finally {
      await secondRefreshStore.dispose?.()
    }
  })

  it('rejects one of two concurrent tab mutations with a version conflict', async () => {
    const context = createRefreshContext('bonus-concurrent-tabs')
    const storeA = context.openStore()
    const storeB = context.openStore()
    const serviceA = context.createService(storeA)
    const serviceB = context.createService(storeB)

    try {
      const [tabA, tabB] = await Promise.all([
        serviceA.addItem({
          idempotencyKey: 'tab-a-add',
          configuration: configurationA(),
          quantity: 1,
          cartVersion: 0,
        }),
        serviceB.addItem({
          idempotencyKey: 'tab-b-add',
          configuration: configurationA(),
          quantity: 1,
          cartVersion: 0,
        }),
      ])

      const outcomes = [tabA.result, tabB.result]
      expect(outcomes.filter((result) => result.ok)).toHaveLength(1)
      expect(outcomes.filter(isCartConflict)).toEqual([
        expect.objectContaining({
          error: expect.objectContaining({ currentVersion: 1 }),
        }),
      ])
      expect((await storeA.getSnapshot()).cartItems).toHaveLength(1)
    } finally {
      await storeA.dispose?.()
      await storeB.dispose?.()
    }
  })

  it('reloads authoritative cart state after a stale-tab conflict and then retries', async () => {
    const context = createRefreshContext('bonus-authoritative-reload')
    const storeA = context.openStore()
    const storeB = context.openStore()
    const serviceA = context.createService(storeA)
    const serviceB = context.createService(storeB)

    try {
      const tabAInitial = success(await serviceA.getCart())
      const tabBInitial = success(await serviceB.getCart())
      expect(tabAInitial.version).toBe(0)
      expect(tabBInitial.version).toBe(0)

      const tabAAdd = success(
        await serviceA.addItem({
          idempotencyKey: 'authoritative-tab-a',
          configuration: configurationA(),
          quantity: 1,
          cartVersion: tabAInitial.version,
        }),
      )
      const staleMutation = await serviceB.addItem({
        idempotencyKey: 'authoritative-tab-b',
        configuration: configurationA(),
        quantity: 1,
        cartVersion: tabBInitial.version,
      })
      expect(staleMutation.result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'CONFLICT', currentVersion: 1 }),
      })

      const reloaded = success(await serviceB.getCart())
      expect(reloaded.version).toBe(1)
      expect(reloaded.items).toEqual([tabAAdd.item])

      const retry = success(
        await serviceB.addItem({
          idempotencyKey: 'authoritative-tab-b',
          configuration: configurationA(),
          quantity: 1,
          cartVersion: reloaded.version,
        }),
      )
      expect(retry.cart.version).toBe(2)
      expect(retry.cart.items).toHaveLength(2)
    } finally {
      await storeA.dispose?.()
      await storeB.dispose?.()
    }
  })

  it('restores and revalidates an unfinished configuration without reserving stock', () => {
    const storage = memoryStorage()
    const repository = createLocalStorageDraftRepository(storage)
    const unfinished = createConfigurationDraft({ selections: { toast: 1 } }, 2)
    const originalStock = structuredClone(buildYourBreakfastFixture.stock)

    repository.save(unfinished)
    const restored = repository.load()
    expect(restored).toEqual(unfinished)
    if (!restored) throw new Error('Expected saved draft')

    const revalidated = revalidateConfigurationDraft(
      restored,
      buildYourBreakfastFixture.menu,
      buildYourBreakfastFixture.stock,
    )
    expect(revalidated?.validation.isValid).toBe(false)
    expect(revalidated?.validation.violations.length).toBeGreaterThan(0)
    expect(buildYourBreakfastFixture.stock).toEqual(originalStock)
  })

  it('restores an out-of-stock draft for review without creating a reservation', () => {
    const unavailableStock = {
      levels: buildYourBreakfastFixture.stock.levels.map((level) =>
        level.ingredientId === 'egg'
          ? {
              ...level,
              availability: { type: 'finite' as const, quantity: 0 },
            }
          : level,
      ),
    }

    const revalidated = revalidateConfigurationDraft(
      createConfigurationDraft(configurationA(), 1),
      buildYourBreakfastFixture.menu,
      unavailableStock,
    )

    expect(revalidated?.validation.isValid).toBe(true)
    expect(revalidated?.availability).toEqual({
      status: 'insufficientStock',
      shortages: [
        { ingredientId: 'egg', required: 2, available: 0, missing: 2 },
      ],
    })
    expect(unavailableStock.levels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientId: 'egg',
          availability: { type: 'finite', quantity: 0 },
        }),
      ]),
    )
  })
})

function createRefreshContext(databaseName: string) {
  const indexedDb = new IDBFactory()
  let browserTime = Date.parse('2026-11-25T10:00:00.000Z')
  let id = 0
  const clock = new ServerClock({ now: () => browserTime })
  const ids = {
    cartItemId: () => `bonus-item-${++id}`,
    reservationId: () => `bonus-reservation-${id}`,
  }

  return {
    openStore: () =>
      createIndexedDbMockStore(buildYourBreakfastFixture, {
        indexedDb,
        databaseName,
        broadcastChannelName: null,
      }),
    createService: (store: ReturnType<typeof createIndexedDbMockStore>) =>
      new CartService({ store, clock, ids }),
    advance: (milliseconds: number) => {
      browserTime += milliseconds
    },
  }
}

function configurationA(): Configuration {
  return {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
}

function success<T>(outcome: {
  readonly result:
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: unknown }
}): T {
  if (!outcome.result.ok) throw new Error('Expected successful operation')
  return outcome.result.data
}

function isCartConflict(result: {
  readonly ok: boolean
  readonly error?: { readonly code: string }
}): boolean {
  return !result.ok && result.error?.code === 'CONFLICT'
}

function finiteStock(state: MockStoreState, ingredientId: string): number {
  const availability = state.stock.levels.find(
    (level) => level.ingredientId === ingredientId,
  )?.availability
  if (availability?.type !== 'finite') throw new Error('Expected finite stock')
  return availability.quantity
}

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
