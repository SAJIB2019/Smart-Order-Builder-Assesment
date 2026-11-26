import { describe, expect, it } from 'vitest'

import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponUsageCount,
  getOrderCount,
  getOrdersByDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from '../../../../src/domain/stats/sales-stats'
import { createStoredOrder } from '../../../../src/domain/orders/stored-order'
import { priceSeedOrders } from '../../../../src/domain/orders/seed-orders'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

const orders = priceSeedOrders(
  buildYourBreakfastFixture.seedOrders,
  buildYourBreakfastFixture.menu,
)

describe('pure sales statistics', () => {
  it('calculates exact official seed counts, revenue, and average in poisha', () => {
    expect(getOrderCount(orders)).toEqual({ orderCount: 6 })
    expect(getTotalRevenue(orders)).toEqual({
      totalRevenuePoisha: 499_500,
      currency: 'BDT',
      moneyUnit: 'poisha',
    })
    expect(getAverageOrderValue(orders)).toEqual({
      averageOrderValuePoisha: 83_250,
      orderCount: 6,
      totalRevenuePoisha: 499_500,
      currency: 'BDT',
      moneyUnit: 'poisha',
    })
  })

  it('counts option units as line quantity multiplied by option quantity', () => {
    expect(getBestSellingOption(orders)).toEqual({
      optionId: 'fried',
      optionName: 'Fried',
      units: 10,
    })
  })

  it('calculates exact seed revenue by payment label', () => {
    expect(getRevenueByPaymentMethod(orders)).toEqual({
      cardPoisha: 214_500,
      bkashPoisha: 157_900,
      cashPoisha: 127_100,
      currency: 'BDT',
      moneyUnit: 'poisha',
    })
  })

  it('counts only coupons that actually applied', () => {
    expect(
      orders.filter(({ coupon }) => coupon.attemptedCode !== null),
    ).toHaveLength(4)
    expect(getCouponUsageCount(orders)).toEqual({ couponUsageCount: 3 })
  })

  it('matches business dates in Asia/Dhaka, including UTC date boundaries', () => {
    expect(getOrdersByDate(orders, '2026-11-20')).toEqual({
      date: '2026-11-20',
      timeZone: 'Asia/Dhaka',
      orderCount: 2,
      orderIds: ['ORD-1001', 'ORD-1002'],
    })

    const nearMidnight = {
      ...orders[0]!,
      id: 'UTC-BOUNDARY',
      createdAt: '2026-11-19T18:30:00.000Z',
    }
    expect(getOrdersByDate([nearMidnight], '2026-11-20').orderCount).toBe(1)
  })

  it('returns safe empty results and rejects invalid dates', () => {
    expect(getBestSellingOption([])).toBeNull()
    expect(getAverageOrderValue([]).averageOrderValuePoisha).toBe(0)
    expect(() => getOrdersByDate(orders, '2026-02-30')).toThrow(
      'real calendar date',
    )
    expect(() => getOrdersByDate(orders, '20-11-2026')).toThrow('YYYY-MM-DD')
  })

  it('changes immediately when modified order data is supplied', () => {
    const newOrder = createStoredOrder({
      id: 'ORD-MODIFIED',
      createdAt: '2026-11-23T09:00:00+06:00',
      paymentMethod: 'cash',
      attemptedCouponCode: null,
      menu: buildYourBreakfastFixture.menu,
      lines: [
        {
          id: 'modified-line',
          quantity: 3,
          configuration: {
            selections: { toast: 1, scrambled: 2, sausage: 1 },
          },
        },
      ],
    })
    const modified = [...orders, newOrder]

    expect(getOrderCount(modified).orderCount).toBe(7)
    expect(getTotalRevenue(modified).totalRevenuePoisha).toBe(619_200)
    expect(getBestSellingOption(modified)).toEqual({
      optionId: 'scrambled',
      optionName: 'Scrambled',
      units: 14,
    })
    expect(getOrdersByDate(modified, '2026-11-23').orderIds).toEqual([
      'ORD-MODIFIED',
    ])
  })
})
