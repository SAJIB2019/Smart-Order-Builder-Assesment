import { describe, expect, it } from 'vitest'

import { priceCart } from '../../src/domain/pricing/price-cart'
import type { Configuration } from '../../src/domain/types/menu'
import type { PriceableCart } from '../../src/domain/types/pricing'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'

const menu = buildYourBreakfastFixture.menu
const promotions = menu.promotions

const configurationA: Configuration = {
  selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
}

const configurationB: Configuration = {
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

const configurationC: Configuration = {
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

describe('Part C official pricing acceptance tests', () => {
  it('TC-05 returns exact unit prices for A, B, and C', () => {
    expect(unitPrice(configurationA)).toBe(38_000)
    expect(unitPrice(configurationB)).toBe(67_950)
    expect(unitPrice(configurationC)).toBe(49_000)
  })

  it('TC-06 prices B x1 plus C x2 at 10:59:59 exactly', () => {
    const result = priceOfficialCart('2026-11-25T10:59:59+06:00')

    expect(
      result.lines.map(({ unitPrice, quantity, lineTotal }) => ({
        unitPrice,
        quantity,
        lineTotal,
      })),
    ).toEqual([
      { unitPrice: 67_950, quantity: 1, lineTotal: 67_950 },
      { unitPrice: 49_000, quantity: 2, lineTotal: 98_000 },
    ])
    expect(result.subtotal).toBe(165_950)
    expect(result.cartDiscountCandidates).toEqual([
      { promotionId: 'C1', name: 'Cart threshold discount', amount: 10_000 },
      { promotionId: 'C2', name: 'Morning coupon', amount: 15_000 },
    ])
    expect(result.cartDiscount).toEqual({
      promotionId: 'C2',
      name: 'Morning coupon',
      amount: 15_000,
    })
    expect(result.coupon).toEqual({
      attemptedCode: 'MORNING15',
      matchedPromotionId: 'C2',
      eligible: true,
      applied: true,
      candidateDiscount: 15_000,
      status: 'applied',
    })
    expect(result.discountedSubtotal).toBe(150_950)
    expect(result.vat).toBe(7_548)
    expect(result.payableBeforeWholeBdtRounding).toBe(158_498)
    expect(result.payable).toBe(158_500)
  })

  it('TC-07 rejects the entered coupon at exactly 11:00:00', () => {
    const result = priceOfficialCart('2026-11-25T11:00:00+06:00')

    expect(result.subtotal).toBe(165_950)
    expect(result.cartDiscountCandidates).toEqual([
      { promotionId: 'C1', name: 'Cart threshold discount', amount: 10_000 },
    ])
    expect(result.cartDiscount).toEqual({
      promotionId: 'C1',
      name: 'Cart threshold discount',
      amount: 10_000,
    })
    expect(result.coupon).toEqual({
      attemptedCode: 'MORNING15',
      matchedPromotionId: 'C2',
      eligible: false,
      applied: false,
      candidateDiscount: null,
      status: 'outsideTimeWindow',
    })
    expect(result.discountedSubtotal).toBe(155_950)
    expect(result.vat).toBe(7_798)
    expect(result.payableBeforeWholeBdtRounding).toBe(163_748)
    expect(result.payable).toBe(163_700)
  })
})

function unitPrice(configuration: Configuration): number {
  const result = priceCart(
    cart([{ id: 'item', configuration, quantity: 1 }]),
    menu,
    promotions,
    '2026-11-25T12:00:00+06:00',
  )

  return requiredLine(result.lines, 0).unitPrice
}

function priceOfficialCart(serverTime: string) {
  return priceCart(
    cart(
      [
        { id: 'B', configuration: configurationB, quantity: 1 },
        { id: 'C', configuration: configurationC, quantity: 2 },
      ],
      'MORNING15',
    ),
    menu,
    promotions,
    serverTime,
  )
}

function cart(
  items: PriceableCart['items'],
  attemptedCouponCode: string | null = null,
): PriceableCart {
  return { items, attemptedCouponCode }
}

function requiredLine(
  lines: ReturnType<typeof priceCart>['lines'],
  index: number,
) {
  const line = lines[index]

  if (!line) {
    throw new Error(`Expected pricing line ${index}`)
  }

  return line
}
