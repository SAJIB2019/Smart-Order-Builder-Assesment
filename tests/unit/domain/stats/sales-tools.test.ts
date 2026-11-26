import { describe, expect, it } from 'vitest'

import { priceSeedOrders } from '../../../../src/domain/orders/seed-orders'
import {
  executeSalesTool,
  SALES_TOOL_DEFINITIONS,
  SalesToolValidationError,
} from '../../../../src/domain/stats/sales-tools'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

const orders = priceSeedOrders(
  buildYourBreakfastFixture.seedOrders,
  buildYourBreakfastFixture.menu,
)

describe('closed sales tool registry', () => {
  it('declares every C2 tool exactly once', () => {
    expect(SALES_TOOL_DEFINITIONS.map(({ name }) => name)).toEqual([
      'getOrderCount',
      'getTotalRevenue',
      'getBestSellingOption',
      'getRevenueByPaymentMethod',
      'getAverageOrderValue',
      'getCouponUsageCount',
      'getOrdersByDate',
      'explainDataLimitation',
    ])
  })

  it('executes validated statistics calls', () => {
    expect(
      executeSalesTool({ name: 'getOrderCount', args: {} }, orders).result,
    ).toEqual({ orderCount: 6 })
    expect(
      executeSalesTool(
        { name: 'getOrdersByDate', args: { date: '2026-11-21' } },
        orders,
      ).result,
    ).toEqual({
      date: '2026-11-21',
      timeZone: 'Asia/Dhaka',
      orderCount: 2,
      orderIds: ['ORD-1003', 'ORD-1004'],
    })
  })

  it('returns the fixed customer limitation without model phrasing', () => {
    expect(
      executeSalesTool(
        {
          name: 'explainDataLimitation',
          args: { subject: 'customer' },
        },
        orders,
      ),
    ).toEqual({
      name: 'explainDataLimitation',
      result: {
        supported: false,
        subject: 'customer',
        message:
          'I cannot determine the best customer because orders do not store customer information.',
      },
      directMessage:
        'I cannot determine the best customer because orders do not store customer information.',
    })
  })

  it('rejects unknown tools, extra arguments, invalid dates, and subjects', () => {
    expectValidationError({ name: 'deleteOrders', args: {} }, 'unsupportedTool')
    expectValidationError(
      { name: 'getOrderCount', args: { injected: true } },
      'invalidArguments',
    )
    expectValidationError(
      { name: 'getOrdersByDate', args: { date: 'tomorrow' } },
      'invalidArguments',
    )
    expectValidationError(
      { name: 'explainDataLimitation', args: { subject: 'revenue' } },
      'invalidArguments',
    )
  })
})

function expectValidationError(
  call: { readonly name: string; readonly args: unknown },
  reason: SalesToolValidationError['reason'],
) {
  try {
    executeSalesTool(call, orders)
    throw new Error('Expected tool validation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(SalesToolValidationError)
    expect((error as SalesToolValidationError).reason).toBe(reason)
  }
}
