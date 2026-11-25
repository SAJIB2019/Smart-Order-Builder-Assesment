import { describe, expect, it } from 'vitest'

import { priceSeedOrders } from '../../../../src/domain/orders/seed-orders'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'
import {
  officialSeedOrders,
  parseSeedOrdersFile,
} from '../../../../src/mocks/fixtures/orders-seed'

describe('official historical orders', () => {
  it('loads the six supplied seed orders without changing their source fields', () => {
    expect(officialSeedOrders.orders).toHaveLength(6)
    expect(officialSeedOrders.orders.map(({ id }) => id)).toEqual([
      'ORD-1001',
      'ORD-1002',
      'ORD-1003',
      'ORD-1004',
      'ORD-1005',
      'ORD-1006',
    ])
    expect(officialSeedOrders.orders[0]).toEqual({
      id: 'ORD-1001',
      createdAt: '2026-11-20T09:15:00+06:00',
      paymentMethod: 'card',
      couponCode: 'MORNING15',
      lines: [
        {
          qty: 1,
          options: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
        },
      ],
    })
  })

  it('prices each seed at createdAt with exact historical payable amounts', () => {
    const orders = priceSeedOrders(
      officialSeedOrders,
      buildYourBreakfastFixture.menu,
    )

    expect(orders.map(({ pricing }) => pricing.payable)).toEqual([
      33_900, 71_300, 127_100, 57_800, 86_600, 122_800,
    ])
    expect(
      orders.reduce((total, order) => total + order.pricing.payable, 0),
    ).toBe(499_500)
    expect(orders[0]?.coupon).toEqual(
      expect.objectContaining({
        attemptedCode: 'MORNING15',
        status: 'applied',
        applied: true,
        appliedDiscountPoisha: 5_700,
      }),
    )
    expect(orders[5]?.coupon).toEqual(
      expect.objectContaining({
        attemptedCode: 'MORNING15',
        status: 'outsideTimeWindow',
        applied: false,
        appliedDiscountPoisha: 0,
      }),
    )
  })

  it('rejects invalid or duplicate source data rather than fabricating it', () => {
    expect(() => parseSeedOrdersFile({})).toThrow('schemaVersion')
    expect(() =>
      parseSeedOrdersFile({
        ...officialSeedOrders,
        orders: [officialSeedOrders.orders[0], officialSeedOrders.orders[0]],
      }),
    ).toThrow('unique')
  })
})
