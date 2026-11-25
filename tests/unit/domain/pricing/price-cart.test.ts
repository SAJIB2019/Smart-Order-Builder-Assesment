import { describe, expect, it } from 'vitest'

import {
  percentageOfPoisha,
  roundPoishaToWholeBdt,
} from '../../../../src/domain/pricing/money'
import { priceCart } from '../../../../src/domain/pricing/price-cart'
import type { Configuration, Menu } from '../../../../src/domain/types/menu'
import { poisha } from '../../../../src/domain/types/money'
import type { PriceableCart } from '../../../../src/domain/types/pricing'
import type { Promotion } from '../../../../src/domain/types/promotions'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

const menu = buildYourBreakfastFixture.menu
const promotions = menu.promotions

describe('priceCart', () => {
  it('calculates the unit subtotal from base and selected option prices', () => {
    const result = price(configurationA())

    expect(firstLine(result).unitSubtotal).toBe(38_000)
    expect(firstLine(result).unitDiscounts).toEqual([])
    expect(firstLine(result).unitPrice).toBe(38_000)
  })

  it('applies the cheapest eligible extra unit for every qualifying set', () => {
    const result = price(configurationC())

    expect(firstLine(result).unitSubtotal).toBe(51_500)
    expect(firstLine(result).unitDiscounts).toEqual([
      { promotionId: 'P2', name: 'Extras deal', amount: 2_500 },
    ])
    expect(firstLine(result).unitPrice).toBe(49_000)
  })

  it('supports multiple free extras and picks the cheapest individual units', () => {
    const result = price({
      selections: {
        toast: 1,
        fried: 2,
        sausage: 1,
        beans: 3,
        hashbrown: 3,
      },
    })

    expect(firstLine(result).unitDiscounts).toEqual([
      { promotionId: 'P2', name: 'Extras deal', amount: 5_000 },
    ])
  })

  it('applies the combo percentage when all configured group thresholds pass', () => {
    const result = price(configurationB())

    expect(firstLine(result).unitSubtotal).toBe(75_500)
    expect(firstLine(result).unitDiscounts).toEqual([
      { promotionId: 'P1', name: 'Combo', amount: 7_550 },
    ])
    expect(firstLine(result).unitPrice).toBe(67_950)
  })

  it('applies cheapest-free before calculating the combo percentage', () => {
    const result = price({
      selections: {
        toast: 1,
        omelette: 2,
        fried: 2,
        sausage: 1,
        bacon: 1,
        hashbrown: 1,
        mushroom: 1,
        beans: 1,
      },
    })

    expect(firstLine(result).unitSubtotal).toBe(69_500)
    expect(firstLine(result).unitDiscounts).toEqual([
      { promotionId: 'P2', name: 'Extras deal', amount: 2_500 },
      { promotionId: 'P1', name: 'Combo', amount: 6_700 },
    ])
    expect(firstLine(result).unitPrice).toBe(60_300)
  })

  it('multiplies the final unit price by cart-item quantity', () => {
    const result = price(configurationC(), { quantity: 3 })

    expect(firstLine(result).unitPrice).toBe(49_000)
    expect(firstLine(result).quantity).toBe(3)
    expect(firstLine(result).lineTotal).toBe(147_000)
    expect(result.subtotal).toBe(147_000)
  })

  it('applies a threshold discount only when its configured threshold is met', () => {
    const below = price(configurationA(), { quantity: 3 })
    const eligible = price(configurationC(), { quantity: 3 })

    expect(below.subtotal).toBe(114_000)
    expect(below.cartDiscount).toBeNull()
    expect(eligible.subtotal).toBe(147_000)
    expect(eligible.cartDiscount).toEqual({
      promotionId: 'C1',
      name: 'Cart threshold discount',
      amount: 10_000,
    })
  })

  it('caps the percentage coupon at its configured maximum', () => {
    const result = price(configurationC(), {
      quantity: 3,
      attemptedCouponCode: 'MORNING15',
      serverTime: '2026-11-25T10:30:00+06:00',
    })

    expect(result.coupon.candidateDiscount).toBe(15_000)
    expect(result.cartDiscount).toEqual({
      promotionId: 'C2',
      name: 'Morning coupon',
      amount: 15_000,
    })
  })

  it('uses promotion priority to resolve equal cart discounts', () => {
    const tiePromotions: readonly Promotion[] = [
      {
        id: 'fixed-wins',
        name: 'Fixed wins tie',
        enabled: true,
        type: 'thresholdFixedDiscount',
        scope: 'cart',
        minimumSubtotal: poisha(0),
        discountAmount: poisha(3_800),
        tieBreakPriority: 1,
      },
      {
        id: 'coupon-loses',
        name: 'Coupon loses tie',
        enabled: true,
        type: 'timedPercentageCoupon',
        scope: 'cart',
        couponCode: 'TIE10',
        percentageBasisPoints: 1_000,
        maximumDiscount: poisha(10_000),
        validBefore: {
          localTime: '11:00:00',
          timeZone: 'Asia/Dhaka',
          exclusive: true,
        },
        tieBreakPriority: 0,
      },
    ]
    const result = price(configurationA(), {
      attemptedCouponCode: 'TIE10',
      promotions: tiePromotions,
      serverTime: '2026-11-25T10:00:00+06:00',
    })

    expect(result.cartDiscountCandidates.map(({ amount }) => amount)).toEqual([
      3_800, 3_800,
    ])
    expect(result.cartDiscount?.promotionId).toBe('fixed-wins')
    expect(result.coupon).toEqual(
      expect.objectContaining({
        eligible: true,
        applied: false,
        status: 'eligibleNotApplied',
      }),
    )
  })

  it('accepts the coupon before the cutoff and rejects it at the exact cutoff', () => {
    const before = price(configurationA(), {
      attemptedCouponCode: 'MORNING15',
      serverTime: '2026-11-25T10:59:59+06:00',
    })
    const exact = price(configurationA(), {
      attemptedCouponCode: 'MORNING15',
      serverTime: '2026-11-25T11:00:00+06:00',
    })

    expect(before.coupon.status).toBe('applied')
    expect(exact.coupon.status).toBe('outsideTimeWindow')
    expect(exact.cartDiscount).toBeNull()
  })

  it('rounds percentage calculations half-up to the nearest poisha', () => {
    expect(percentageOfPoisha(poisha(150_950), 500)).toBe(7_548)
    expect(percentageOfPoisha(poisha(155_950), 500)).toBe(7_798)
  })

  it('rounds only the final payable half-up to whole BDT', () => {
    expect(roundPoishaToWholeBdt(poisha(158_498))).toBe(158_500)
    expect(roundPoishaToWholeBdt(poisha(163_748))).toBe(163_700)
    expect(roundPoishaToWholeBdt(poisha(10_550))).toBe(10_600)
  })

  it('uses historical timestamps and converts them in Asia/Dhaka', () => {
    const morning = price(configurationA(), {
      attemptedCouponCode: 'MORNING15',
      serverTime: '2026-11-20T03:15:00.000Z',
    })
    const afternoon = price(configurationA(), {
      attemptedCouponCode: 'MORNING15',
      serverTime: '2026-11-20T06:40:00.000Z',
    })

    expect(morning.coupon.status).toBe('applied')
    expect(afternoon.coupon.status).toBe('outsideTimeWindow')
  })

  it('records an unknown attempted coupon without applying a discount', () => {
    const result = price(configurationA(), {
      attemptedCouponCode: 'NOT-A-COUPON',
    })

    expect(result.coupon).toEqual({
      attemptedCode: 'NOT-A-COUPON',
      matchedPromotionId: null,
      eligible: false,
      applied: false,
      candidateDiscount: null,
      status: 'unknownCode',
    })
  })

  it('interprets group-based promotions with unrelated fixture IDs', () => {
    const alternateMenu: Menu = {
      product: {
        id: 'product-v2',
        name: 'Product V2',
        basePrice: poisha(10_000),
      },
      ingredients: [],
      groups: [
        {
          id: 'group-orbit',
          name: 'Orbit',
          constraints: { min: 0 },
          options: [
            {
              id: 'option-nova',
              name: 'Nova',
              price: poisha(2_000),
              ingredientConsumption: [],
            },
          ],
        },
      ],
      rules: [],
      promotions: [],
      pricingPolicy: {
        tax: {
          id: 'tax-v2',
          name: 'Tax V2',
          percentageBasisPoints: 0,
        },
        percentageRounding: 'halfUpNearestPoisha',
        finalPayableRounding: 'halfUpWholeBdt',
      },
    }
    const alternatePromotions: readonly Promotion[] = [
      {
        id: 'threshold-v2',
        name: 'Threshold V2',
        enabled: true,
        type: 'groupThresholdPercentage',
        scope: 'unit',
        conditions: [{ groupId: 'group-orbit', minimumQuantity: 1 }],
        percentageBasisPoints: 1_000,
      },
    ]
    const result = priceCart(
      cart({ selections: { 'option-nova': 1 } }),
      alternateMenu,
      alternatePromotions,
      '2026-11-25T12:00:00+06:00',
    )

    expect(firstLine(result).unitDiscounts).toEqual([
      { promotionId: 'threshold-v2', name: 'Threshold V2', amount: 1_200 },
    ])
    expect(firstLine(result).unitPrice).toBe(10_800)
  })
})

interface PriceOptions {
  readonly quantity?: number
  readonly attemptedCouponCode?: string | null
  readonly serverTime?: string
  readonly promotions?: readonly Promotion[]
}

function price(configuration: Configuration, options: PriceOptions = {}) {
  return priceCart(
    cart(
      configuration,
      options.quantity ?? 1,
      options.attemptedCouponCode ?? null,
    ),
    menu,
    options.promotions ?? promotions,
    options.serverTime ?? '2026-11-25T12:00:00+06:00',
  )
}

function cart(
  configuration: Configuration,
  quantity = 1,
  attemptedCouponCode: string | null = null,
): PriceableCart {
  return {
    items: [{ id: 'item', configuration, quantity }],
    attemptedCouponCode,
  }
}

function firstLine(result: ReturnType<typeof priceCart>) {
  const line = result.lines[0]

  if (!line) {
    throw new Error('Expected one pricing line')
  }

  return line
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
