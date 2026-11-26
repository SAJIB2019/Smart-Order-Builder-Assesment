import { describe, expect, it } from 'vitest'

import type { ApiResponse } from '../../../src/domain/types/api'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { createApiHandlers } from '../../../src/mocks/handlers/create-api-handlers'
import { OrderService } from '../../../src/mocks/services/order-service'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { server } from '../../../src/mocks/server'
import { ApiClient } from '../../../src/services/api/api-client'

const apiClient = new ApiClient({ baseUrl: 'http://localhost' })

describe('checkout and orders mock API', () => {
  it('serves seeded orders, checkout, and the complete export envelope', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:59:59+06:00') },
      0,
    )
    const orderService = new OrderService({
      store,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-API' },
    })
    server.use(
      ...createApiHandlers({
        store,
        clock,
        seedOrders: buildYourBreakfastFixture.seedOrders,
        orderService,
      }),
    )

    expect(success(await apiClient.getOrders()).orders).toHaveLength(6)
    await apiClient.addCartItem({
      idempotencyKey: 'api-order-add',
      configuration: {
        selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
      },
      quantity: 1,
      cartVersion: 0,
    })
    const checkout = success(
      await apiClient.checkout({
        idempotencyKey: 'api-order-pay',
        paymentMethod: 'cash',
        attemptedCouponCode: 'MORNING15',
        cartVersion: 1,
      }),
    )

    expect(checkout.order).toEqual(
      expect.objectContaining({
        id: 'ORD-API',
        paymentMethod: 'cash',
        coupon: expect.objectContaining({
          attemptedCode: 'MORNING15',
          applied: true,
        }),
      }),
    )
    expect(checkout.cart.items).toEqual([])

    const exported = success(await apiClient.getOrdersExport())
    expect(exported.orders).toHaveLength(7)
    expect(exported.orders.at(-1)?.id).toBe('ORD-API')
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported)
  })

  it('returns a conflict response for checkout with no active items', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock({ now: () => 0 }, 0)
    server.use(
      ...createApiHandlers({
        store,
        clock,
        seedOrders: buildYourBreakfastFixture.seedOrders,
      }),
    )

    const response = await apiClient.checkout({
      idempotencyKey: 'empty-api-pay',
      paymentMethod: 'card',
      attemptedCouponCode: null,
      cartVersion: 0,
    })
    expect(response).toEqual(
      expect.objectContaining({
        ok: false,
        error: { code: 'EMPTY_CART', message: 'Cart has no active items' },
      }),
    )
  })
})

function success<T>(response: ApiResponse<T>): T {
  if (!response.ok) throw new Error(response.error.message)
  return response.data
}
