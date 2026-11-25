import { describe, expect, it } from 'vitest'

import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'

describe('Build Your Breakfast fixture', () => {
  const { menu, stock } = buildYourBreakfastFixture

  it('contains the exact product and five Appendix A groups', () => {
    expect(menu.product).toEqual({
      id: 'build-your-breakfast',
      name: 'Build Your Breakfast',
      basePrice: 25_000,
    })
    expect(
      menu.groups.map(({ id, name, constraints }) => ({
        id,
        name,
        constraints,
      })),
    ).toEqual([
      { id: 'bread', name: 'Bread', constraints: { min: 1, max: 1 } },
      {
        id: 'eggs',
        name: 'Eggs',
        constraints: { min: 2, max: 6, step: 2 },
      },
      { id: 'protein', name: 'Protein', constraints: { min: 1, max: 3 } },
      { id: 'extras', name: 'Extras', constraints: { min: 0, max: 4 } },
      {
        id: 'sauce',
        name: 'Sauce',
        constraints: { min: 0, maxDistinct: 2, maxPerOption: 1 },
      },
    ])
  })

  it('contains exact option IDs, prices, and ingredient consumption', () => {
    expect(
      menu.groups.flatMap((group) =>
        group.options.map((option) => [
          option.id,
          option.price,
          option.ingredientConsumption,
        ]),
      ),
    ).toEqual([
      ['toast', 0, [{ ingredientId: 'toast', quantity: 1 }]],
      ['paratha', 2_000, [{ ingredientId: 'paratha', quantity: 1 }]],
      ['croissant', 6_000, [{ ingredientId: 'croissant', quantity: 1 }]],
      ['fried', 3_000, [{ ingredientId: 'egg', quantity: 1 }]],
      ['scrambled', 3_500, [{ ingredientId: 'egg', quantity: 1 }]],
      ['omelette', 7_000, [{ ingredientId: 'egg', quantity: 2 }]],
      ['sausage', 6_000, [{ ingredientId: 'sausage', quantity: 1 }]],
      ['bacon', 9_000, [{ ingredientId: 'bacon', quantity: 1 }]],
      ['tofu', 5_000, [{ ingredientId: 'tofu', quantity: 1 }]],
      ['hashbrown', 4_000, [{ ingredientId: 'hashbrown', quantity: 1 }]],
      ['mushroom', 3_000, [{ ingredientId: 'mushroom', quantity: 1 }]],
      ['beans', 2_500, [{ ingredientId: 'beans', quantity: 1 }]],
      ['cheese', 3_500, [{ ingredientId: 'cheese', quantity: 1 }]],
      ['ketchup', 0, []],
      ['hollandaise', 2_500, [{ ingredientId: 'hollandaise', quantity: 1 }]],
      ['chili', 1_000, []],
    ])
  })

  it('contains exact stock with explicit unlimited Ketchup and Chili', () => {
    expect(stock.levels).toEqual([
      { ingredientId: 'egg', availability: { type: 'finite', quantity: 10 } },
      {
        ingredientId: 'sausage',
        availability: { type: 'finite', quantity: 4 },
      },
      { ingredientId: 'bacon', availability: { type: 'finite', quantity: 3 } },
      { ingredientId: 'tofu', availability: { type: 'finite', quantity: 5 } },
      {
        ingredientId: 'croissant',
        availability: { type: 'finite', quantity: 2 },
      },
      {
        ingredientId: 'paratha',
        availability: { type: 'finite', quantity: 10 },
      },
      { ingredientId: 'toast', availability: { type: 'finite', quantity: 20 } },
      {
        ingredientId: 'hashbrown',
        availability: { type: 'finite', quantity: 6 },
      },
      {
        ingredientId: 'mushroom',
        availability: { type: 'finite', quantity: 6 },
      },
      { ingredientId: 'beans', availability: { type: 'finite', quantity: 8 } },
      { ingredientId: 'cheese', availability: { type: 'finite', quantity: 4 } },
      {
        ingredientId: 'hollandaise',
        availability: { type: 'finite', quantity: 5 },
      },
      { ingredientId: 'ketchup', availability: { type: 'unlimited' } },
      { ingredientId: 'chili', availability: { type: 'unlimited' } },
    ])
  })

  it('contains all cross-group rules', () => {
    expect(menu.rules).toEqual([
      {
        id: 'R1',
        type: 'requires',
        sourceOptionId: 'hollandaise',
        anyOfOptionIds: ['scrambled', 'omelette'],
      },
      {
        id: 'R2',
        type: 'excludes',
        sourceOptionId: 'tofu',
        excludedOptionIds: ['sausage', 'bacon'],
      },
      {
        id: 'R3',
        type: 'overrideLimit',
        triggerOptionId: 'croissant',
        targetGroupId: 'extras',
        override: { max: 2 },
      },
      {
        id: 'R4',
        type: 'excludes',
        sourceOptionId: 'chili',
        excludedOptionIds: ['hollandaise'],
      },
    ])
  })

  it('contains exact P2, P1, C1, C2, VAT, and rounding definitions', () => {
    expect(menu.promotions).toEqual([
      {
        id: 'P2',
        name: 'Extras deal',
        enabled: true,
        type: 'quantityCheapestFree',
        scope: 'unit',
        eligibleGroupId: 'extras',
        qualifyingQuantity: 3,
        freeQuantity: 1,
      },
      {
        id: 'P1',
        name: 'Combo',
        enabled: true,
        type: 'groupThresholdPercentage',
        scope: 'unit',
        conditions: [
          { groupId: 'eggs', minimumQuantity: 4 },
          { groupId: 'protein', minimumQuantity: 2 },
        ],
        percentageBasisPoints: 1_000,
      },
      {
        id: 'C1',
        name: 'Cart threshold discount',
        enabled: true,
        type: 'thresholdFixedDiscount',
        scope: 'cart',
        minimumSubtotal: 120_000,
        discountAmount: 10_000,
        tieBreakPriority: 1,
      },
      {
        id: 'C2',
        name: 'Morning coupon',
        enabled: true,
        type: 'timedPercentageCoupon',
        scope: 'cart',
        couponCode: 'MORNING15',
        percentageBasisPoints: 1_500,
        maximumDiscount: 15_000,
        validBefore: {
          localTime: '11:00:00',
          timeZone: 'Asia/Dhaka',
          exclusive: true,
        },
        tieBreakPriority: 0,
      },
    ])
    expect(menu.pricingPolicy).toEqual({
      tax: { id: 'vat', name: 'VAT', percentageBasisPoints: 500 },
      percentageRounding: 'halfUpNearestPoisha',
      finalPayableRounding: 'halfUpWholeBdt',
    })
  })
})
