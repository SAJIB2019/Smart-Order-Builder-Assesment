import { describe, expect, it } from 'vitest'

import type { Configuration } from '../../../src/domain/types/menu'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { createApiHandlers } from '../../../src/mocks/handlers/create-api-handlers'
import { CartService } from '../../../src/mocks/services/cart-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { server } from '../../../src/mocks/server'
import { ApiClient } from '../../../src/services/api/api-client'

const apiClient = new ApiClient({ baseUrl: 'http://localhost' })

describe('cart and reservation mock API', () => {
  it('supports get, add, edit, inventory, remove, and expiry endpoints', async () => {
    let browserTime = Date.parse('2026-11-25T10:00:00.000Z')
    let id = 0
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock({ now: () => browserTime })
    const cartService = new CartService({
      store,
      clock,
      ids: {
        cartItemId: () => `item-${++id}`,
        reservationId: () => `reservation-${++id}`,
      },
    })
    server.use(
      ...createApiHandlers({
        store,
        clock,
        cartService,
        seedOrders: buildYourBreakfastFixture.seedOrders,
      }),
    )

    expect(success(await apiClient.getCart()).items).toEqual([])
    const addedResponse = await apiClient.addCartItem({
      idempotencyKey: 'api-add',
      configuration: configurationA(),
      quantity: 1,
    })
    const added = success(addedResponse)
    expect(addedResponse.meta.serverTime).toBe('2026-11-25T10:01:30.000Z')
    expect(added.replayed).toBe(false)
    expect(finiteQuantity(success(await apiClient.getInventory()), 'egg')).toBe(
      8,
    )

    const replay = success(
      await apiClient.addCartItem({
        idempotencyKey: 'api-add',
        configuration: configurationA(),
        quantity: 1,
      }),
    )
    expect(replay.replayed).toBe(true)

    const edited = success(
      await apiClient.editCartItem(added.item.id, {
        configuration: configurationAEdited(),
        quantity: 1,
      }),
    )
    expect(edited.item.configuration).toEqual(configurationAEdited())
    expect(finiteQuantity(success(await apiClient.getInventory()), 'egg')).toBe(
      6,
    )

    browserTime += 300_000
    const expiration = success(await apiClient.expireReservations())
    expect(expiration.expiredReservationIds).toEqual([added.reservation.id])
    expect(
      expiration.cart.reservations.find(
        (reservation) => reservation.id === added.reservation.id,
      )?.status,
    ).toBe('expired')

    const removed = success(await apiClient.removeCartItem(added.item.id))
    expect(removed.cart.items).toEqual([])
    expect(finiteQuantity(success(await apiClient.getInventory()), 'egg')).toBe(
      10,
    )
  })
})

function success<T>(response: {
  readonly ok: boolean
  readonly data?: T
  readonly error?: { readonly message: string }
}): T {
  if (!response.ok || response.data === undefined) {
    throw new Error(response.error?.message ?? 'Expected API success')
  }
  return response.data
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

function configurationAEdited(): Configuration {
  return {
    selections: { toast: 1, scrambled: 4, sausage: 1, ketchup: 1 },
  }
}
