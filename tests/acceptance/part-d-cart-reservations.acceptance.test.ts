import { describe, expect, it } from 'vitest'

import {
  calculateReservationRemainingMs,
  synchronizeServerTime,
} from '../../src/domain/cart/server-time'
import type { AddCartItemRequest } from '../../src/domain/types/cart'
import type { Configuration } from '../../src/domain/types/menu'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'
import {
  CartService,
  type CartFailureInjector,
} from '../../src/mocks/services/cart-service'
import { ServerClock } from '../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../src/mocks/store/in-memory-mock-store'

describe('Part D official cart and reservation acceptance tests', () => {
  it('TC-08 reserves B x1 plus C x2 and exposes exact remaining stock', async () => {
    const harness = createHarness()
    await addBaselineCart(harness.service)
    const inventory = successful(await harness.service.getInventory())

    expect(finiteQuantity(inventory, 'egg')).toBe(0)
    expect(finiteQuantity(inventory, 'cheese')).toBe(0)
    expect(finiteQuantity(inventory, 'croissant')).toBe(1)

    const blocked = await harness.service.addItem(
      addRequest('needs-eggs', configurationA(), 1, 2),
    )
    expect(blocked.result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'INSUFFICIENT_STOCK',
        shortages: [{ ingredientId: 'egg', missingQuantity: 2 }],
      }),
    })
  })

  it("TC-09 counts B's own allocation and reports Short: 1 egg", async () => {
    const harness = createHarness()
    const { itemB } = await addBaselineCart(harness.service)
    const before = await harness.store.getSnapshot()
    const edit = await harness.service.editItem(itemB.id, {
      configuration: configurationBEditBlocked(),
      quantity: 1,
      cartVersion: 2,
    })
    const after = await harness.store.getSnapshot()

    expect(edit.result).toEqual({
      ok: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Short: 1 egg',
        shortages: [{ ingredientId: 'egg', missingQuantity: 1 }],
      },
    })
    expect(after.stock).toEqual(before.stock)
    expect(after.cartItems).toEqual(before.cartItems)
    expect(after.reservations).toEqual(before.reservations)
  })

  it('TC-10 atomically edits B, prices it at 643.50, and leaves one egg', async () => {
    const harness = createHarness()
    const { itemB } = await addBaselineCart(harness.service)
    const edit = successful(
      await harness.service.editItem(itemB.id, {
        configuration: configurationBEditAllowed(),
        quantity: 1,
        cartVersion: 2,
      }),
    )

    expect(
      edit.cart.activePricing.lines.find((line) => line.cartItemId === itemB.id)
        ?.unitPrice,
    ).toBe(64_350)
    expect(
      finiteQuantity((await harness.store.getSnapshot()).stock, 'egg'),
    ).toBe(1)
  })

  it('TC-11 reports every shortage when C quantity changes from 2 to 3', async () => {
    const harness = createHarness()
    const { itemC } = await addBaselineCart(harness.service)
    const edit = await harness.service.editItem(itemC.id, {
      configuration: configurationC(),
      quantity: 3,
      cartVersion: 2,
    })

    expect(edit.result).toEqual({
      ok: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Short: 2 egg, 2 cheese',
        shortages: [
          { ingredientId: 'egg', missingQuantity: 2 },
          { ingredientId: 'cheese', missingQuantity: 2 },
        ],
      },
    })
  })

  it('TC-13 turns three rapid adds with one idempotency key into one hold', async () => {
    const harness = createHarness()
    const request = addRequest('rapid-click', configurationA(), 1)
    const outcomes = await Promise.all([
      harness.service.addItem(request),
      harness.service.addItem(request),
      harness.service.addItem(request),
    ])
    const snapshot = await harness.store.getSnapshot()

    expect(outcomes.every((outcome) => outcome.result.ok)).toBe(true)
    expect(snapshot.cartItems).toHaveLength(1)
    expect(snapshot.reservations).toHaveLength(1)
    expect(
      snapshot.reservations.filter(
        (reservation) => reservation.status === 'active',
      ),
    ).toHaveLength(1)
  })

  it('TC-14 leaves no hold after failure, keeps the request, and retries', async () => {
    const failures = { fail: true }
    const harness = createHarness({
      shouldFail: (operation) => operation === 'add' && failures.fail,
    })
    const request = addRequest('retry-after-failure', configurationA(), 1)
    const failed = await harness.service.addItem(request)

    expect(failed.result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'TRANSIENT_ERROR' }),
    })
    expect((await harness.store.getSnapshot()).stock).toEqual(
      buildYourBreakfastFixture.stock,
    )
    expect((await harness.store.getSnapshot()).reservations).toEqual([])
    expect(request.configuration).toEqual(configurationA())

    failures.fail = false
    expect((await harness.service.addItem(request)).result.ok).toBe(true)
  })

  it('TC-15 expires at 5:00 server time, releases stock, and marks item read-only', async () => {
    const harness = createHarness()
    const added = successful(
      await harness.service.addItem(
        addRequest('five-minute-hold', configurationA(), 1),
      ),
    )
    const sync = synchronizeServerTime(
      added.reservation.reservedAt,
      harness.browserTime(),
    )

    expect(sync.offsetMs).toBe(90_000)
    if (added.reservation.status !== 'active') {
      throw new Error('Expected active reservation')
    }
    expect(
      calculateReservationRemainingMs(
        added.reservation.expiresAt,
        sync,
        harness.browserTime(),
      ),
    ).toBe(300_000)

    harness.advanceBrowserTime(300_000)
    const cart = successful(await harness.service.getCart())
    expect(
      cart.reservations.find(
        (reservation) => reservation.id === added.reservation.id,
      )?.status,
    ).toBe('expired')
    expect(
      finiteQuantity((await harness.store.getSnapshot()).stock, 'egg'),
    ).toBe(10)

    const rejectedEdit = await harness.service.editItem(added.item.id, {
      configuration: configurationA(),
      quantity: 1,
      cartVersion: 2,
    })
    expect(rejectedEdit.result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'RESERVATION_EXPIRED' }),
    })
    expect(
      successful(
        await harness.service.removeItem(added.item.id, { cartVersion: 2 }),
      ).removedCartItemId,
    ).toBe(added.item.id)
  })
})

async function addBaselineCart(service: CartService) {
  const itemB = successful(
    await service.addItem(addRequest('baseline-B', configurationB(), 1)),
  ).item
  const itemC = successful(
    await service.addItem(addRequest('baseline-C', configurationC(), 2, 1)),
  ).item
  return { itemB, itemC }
}

function createHarness(failures?: CartFailureInjector) {
  let browserTime = Date.parse('2026-11-25T10:00:00.000Z')
  let id = 0
  const store = createInMemoryMockStore(buildYourBreakfastFixture)
  const service = new CartService({
    store,
    clock: new ServerClock({ now: () => browserTime }),
    ids: {
      cartItemId: () => `item-${++id}`,
      reservationId: () => `reservation-${++id}`,
    },
    ...(failures ? { failures } : {}),
  })
  return {
    store,
    service,
    browserTime: () => browserTime,
    advanceBrowserTime(milliseconds: number) {
      browserTime += milliseconds
    },
  }
}

function successful<T>(outcome: {
  result:
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: unknown }
}): T {
  if (!outcome.result.ok) throw new Error('Expected success')
  return outcome.result.data
}

function addRequest(
  idempotencyKey: string,
  configuration: Configuration,
  quantity: number,
  cartVersion = 0,
): AddCartItemRequest {
  return { idempotencyKey, configuration, quantity, cartVersion }
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

function configurationC(): Configuration {
  return {
    selections: {
      paratha: 1,
      fried: 2,
      tofu: 1,
      cheese: 2,
      beans: 1,
      mushroom: 1,
      chili: 1,
    },
  }
}

function configurationBEditBlocked(): Configuration {
  return {
    selections: {
      ...configurationB().selections,
      omelette: 3,
      fried: 1,
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
