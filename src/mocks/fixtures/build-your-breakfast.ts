import { poisha } from '../../domain/types/money'
import type { MockApiFixture } from './mock-api-fixture'
import { officialSeedOrders } from './orders-seed'

/** The sole assessment-specific fixture, transcribed from the PDF. */
export const buildYourBreakfastFixture: MockApiFixture = {
  seedOrders: officialSeedOrders,
  menu: {
    product: {
      id: 'build-your-breakfast',
      name: 'Build Your Breakfast',
      basePrice: poisha(25_000),
    },
    ingredients: [
      { id: 'egg', name: 'Egg' },
      { id: 'sausage', name: 'Chicken Sausage' },
      { id: 'bacon', name: 'Beef Bacon' },
      { id: 'tofu', name: 'Tofu' },
      { id: 'croissant', name: 'Croissant' },
      { id: 'paratha', name: 'Paratha' },
      { id: 'toast', name: 'Toast' },
      { id: 'hashbrown', name: 'Hash Brown' },
      { id: 'mushroom', name: 'Mushroom' },
      { id: 'beans', name: 'Baked Beans' },
      { id: 'cheese', name: 'Cheese' },
      { id: 'hollandaise', name: 'Hollandaise' },
      { id: 'ketchup', name: 'Ketchup' },
      { id: 'chili', name: 'Chili' },
    ],
    groups: [
      {
        id: 'bread',
        name: 'Bread',
        constraints: { min: 1, max: 1 },
        options: [
          {
            id: 'toast',
            name: 'Toast',
            price: poisha(0),
            ingredientConsumption: [{ ingredientId: 'toast', quantity: 1 }],
          },
          {
            id: 'paratha',
            name: 'Paratha',
            price: poisha(2_000),
            ingredientConsumption: [{ ingredientId: 'paratha', quantity: 1 }],
          },
          {
            id: 'croissant',
            name: 'Croissant',
            price: poisha(6_000),
            ingredientConsumption: [{ ingredientId: 'croissant', quantity: 1 }],
          },
        ],
      },
      {
        id: 'eggs',
        name: 'Eggs',
        constraints: { min: 2, max: 6, step: 2 },
        options: [
          {
            id: 'fried',
            name: 'Fried',
            price: poisha(3_000),
            ingredientConsumption: [{ ingredientId: 'egg', quantity: 1 }],
          },
          {
            id: 'scrambled',
            name: 'Scrambled',
            price: poisha(3_500),
            ingredientConsumption: [{ ingredientId: 'egg', quantity: 1 }],
          },
          {
            id: 'omelette',
            name: 'Omelette',
            price: poisha(7_000),
            ingredientConsumption: [{ ingredientId: 'egg', quantity: 2 }],
          },
        ],
      },
      {
        id: 'protein',
        name: 'Protein',
        constraints: { min: 1, max: 3 },
        options: [
          {
            id: 'sausage',
            name: 'Chicken Sausage',
            price: poisha(6_000),
            ingredientConsumption: [{ ingredientId: 'sausage', quantity: 1 }],
          },
          {
            id: 'bacon',
            name: 'Beef Bacon',
            price: poisha(9_000),
            ingredientConsumption: [{ ingredientId: 'bacon', quantity: 1 }],
          },
          {
            id: 'tofu',
            name: 'Tofu',
            price: poisha(5_000),
            ingredientConsumption: [{ ingredientId: 'tofu', quantity: 1 }],
          },
        ],
      },
      {
        id: 'extras',
        name: 'Extras',
        constraints: { min: 0, max: 4 },
        options: [
          {
            id: 'hashbrown',
            name: 'Hash Brown',
            price: poisha(4_000),
            ingredientConsumption: [{ ingredientId: 'hashbrown', quantity: 1 }],
          },
          {
            id: 'mushroom',
            name: 'Mushroom',
            price: poisha(3_000),
            ingredientConsumption: [{ ingredientId: 'mushroom', quantity: 1 }],
          },
          {
            id: 'beans',
            name: 'Baked Beans',
            price: poisha(2_500),
            ingredientConsumption: [{ ingredientId: 'beans', quantity: 1 }],
          },
          {
            id: 'cheese',
            name: 'Cheese',
            price: poisha(3_500),
            ingredientConsumption: [{ ingredientId: 'cheese', quantity: 1 }],
          },
        ],
      },
      {
        id: 'sauce',
        name: 'Sauce',
        constraints: { min: 0, maxDistinct: 2, maxPerOption: 1 },
        options: [
          {
            id: 'ketchup',
            name: 'Ketchup',
            price: poisha(0),
            ingredientConsumption: [],
          },
          {
            id: 'hollandaise',
            name: 'Hollandaise',
            price: poisha(2_500),
            ingredientConsumption: [
              { ingredientId: 'hollandaise', quantity: 1 },
            ],
          },
          {
            id: 'chili',
            name: 'Chili',
            price: poisha(1_000),
            ingredientConsumption: [],
          },
        ],
      },
    ],
    rules: [
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
    ],
    promotions: [
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
        minimumSubtotal: poisha(120_000),
        discountAmount: poisha(10_000),
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
        maximumDiscount: poisha(15_000),
        validBefore: {
          localTime: '11:00:00',
          timeZone: 'Asia/Dhaka',
          exclusive: true,
        },
        tieBreakPriority: 0,
      },
    ],
    pricingPolicy: {
      tax: { id: 'vat', name: 'VAT', percentageBasisPoints: 500 },
      percentageRounding: 'halfUpNearestPoisha',
      finalPayableRounding: 'halfUpWholeBdt',
    },
  },
  stock: {
    levels: [
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
    ],
  },
}
