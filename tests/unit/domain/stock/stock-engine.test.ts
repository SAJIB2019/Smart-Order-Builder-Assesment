import { describe, expect, it } from 'vitest'

import {
  applyStockAllocation,
  applyStockAllocationChange,
  calculateConfigurationRequirements,
  calculateMaximumAdditionalOptionUnits,
  calculateNetAllocationDifference,
  calculateRemainingStock,
  checkIngredientAvailability,
  formatIngredientShortages,
  multiplyIngredientRequirements,
  releaseStockAllocation,
} from '../../../../src/domain/stock/stock-engine'
import type { Option, OptionGroup } from '../../../../src/domain/types/menu'
import { poisha } from '../../../../src/domain/types/money'
import type {
  StockAllocation,
  StockSnapshot,
} from '../../../../src/domain/types/stock'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

const { groups } = buildYourBreakfastFixture.menu
const initialStock = buildYourBreakfastFixture.stock

describe('stock engine', () => {
  it('aggregates shared ingredient consumption across different options', () => {
    const requirements = calculateConfigurationRequirements(
      {
        selections: {
          toast: 1,
          omelette: 2,
          fried: 2,
          sausage: 1,
        },
      },
      groups,
    )

    expect(requirements).toEqual([
      { ingredientId: 'toast', quantity: 1 },
      { ingredientId: 'egg', quantity: 6 },
      { ingredientId: 'sausage', quantity: 1 },
    ])
  })

  it('multiplies requirements for cart quantities 1 through 3', () => {
    const requirements: readonly StockAllocation[] = [
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'cheese', quantity: 1 },
    ]

    expect(multiplyIngredientRequirements(requirements, 1)).toEqual(
      requirements,
    )
    expect(multiplyIngredientRequirements(requirements, 2)).toEqual([
      { ingredientId: 'egg', quantity: 4 },
      { ingredientId: 'cheese', quantity: 2 },
    ])
    expect(multiplyIngredientRequirements(requirements, 3)).toEqual([
      { ingredientId: 'egg', quantity: 6 },
      { ingredientId: 'cheese', quantity: 3 },
    ])
  })

  it.each([0, 1.5, 4])('rejects invalid cart item quantity %s', (quantity) => {
    expect(() => multiplyIngredientRequirements([], quantity)).toThrow(
      'Cart item quantity must be an integer from 1 to 3',
    )
  })

  it('calculates remaining finite stock without changing unlimited stock', () => {
    const result = calculateRemainingStock(initialStock, [
      { ingredientId: 'egg', quantity: 3 },
      { ingredientId: 'ketchup', quantity: 500 },
    ])

    expect(result.status).toBe('applied')
    expect(levelQuantity(stockFromApplied(result), 'egg')).toBe(7)
    expect(
      stockLevel(stockFromApplied(result), 'ketchup').availability,
    ).toEqual({
      type: 'unlimited',
    })
    expect(levelQuantity(initialStock, 'egg')).toBe(10)
  })

  it('returns every shortage and the exact missing quantities', () => {
    const availability = checkIngredientAvailability(initialStock, [
      { ingredientId: 'egg', quantity: 12 },
      { ingredientId: 'cheese', quantity: 6 },
      { ingredientId: 'ketchup', quantity: 999 },
    ])

    expect(availability).toEqual({
      status: 'insufficientStock',
      shortages: [
        { ingredientId: 'egg', required: 12, available: 10, missing: 2 },
        { ingredientId: 'cheese', required: 6, available: 4, missing: 2 },
      ],
    })
    expect(
      availability.status === 'insufficientStock'
        ? formatIngredientShortages(availability.shortages)
        : '',
    ).toBe('Short: 2 egg, 2 cheese')
  })

  it('calculates finite and unlimited additional option capacity', () => {
    expect(
      calculateMaximumAdditionalOptionUnits(
        findOption('omelette'),
        1,
        initialStock,
      ),
    ).toEqual({ type: 'finite', quantity: 5 })
    expect(
      calculateMaximumAdditionalOptionUnits(
        findOption('omelette'),
        2,
        initialStock,
      ),
    ).toEqual({ type: 'finite', quantity: 2 })
    expect(
      calculateMaximumAdditionalOptionUnits(
        findOption('ketchup'),
        3,
        initialStock,
      ),
    ).toEqual({ type: 'unlimited' })
  })

  it('treats an explicitly unlimited consumed ingredient as unlimited capacity', () => {
    const option: Option = {
      id: 'seasoning-v2',
      name: 'Seasoning',
      price: poisha(0),
      ingredientConsumption: [{ ingredientId: 'ketchup', quantity: 2 }],
    }

    expect(
      calculateMaximumAdditionalOptionUnits(option, 3, initialStock),
    ).toEqual({ type: 'unlimited' })
  })

  it('calculates reserve and release portions of an edit', () => {
    expect(
      calculateNetAllocationDifference(
        [
          { ingredientId: 'egg', quantity: 6 },
          { ingredientId: 'cheese', quantity: 2 },
          { ingredientId: 'toast', quantity: 1 },
        ],
        [
          { ingredientId: 'egg', quantity: 7 },
          { ingredientId: 'cheese', quantity: 1 },
          { ingredientId: 'toast', quantity: 1 },
        ],
      ),
    ).toEqual({
      reserve: [{ ingredientId: 'egg', quantity: 1 }],
      release: [{ ingredientId: 'cheese', quantity: 1 }],
    })
  })

  it('increases and decreases allocations using only their net changes', () => {
    const stockWithSixEggsHeld = stockFromApplied(
      applyStockAllocation(initialStock, [
        { ingredientId: 'egg', quantity: 6 },
      ]),
    )
    const increased = applyStockAllocationChange(
      stockWithSixEggsHeld,
      [{ ingredientId: 'egg', quantity: 6 }],
      [{ ingredientId: 'egg', quantity: 7 }],
    )
    const decreased = applyStockAllocationChange(
      stockWithSixEggsHeld,
      [{ ingredientId: 'egg', quantity: 6 }],
      [{ ingredientId: 'egg', quantity: 5 }],
    )

    expect(levelQuantity(stockFromApplied(increased), 'egg')).toBe(3)
    expect(levelQuantity(stockFromApplied(decreased), 'egg')).toBe(5)
  })

  it('does not double-count an unchanged edit allocation', () => {
    const allocation = [{ ingredientId: 'egg', quantity: 6 }] as const
    const remaining = stockFromApplied(
      applyStockAllocation(initialStock, allocation),
    )
    const edit = applyStockAllocationChange(remaining, allocation, allocation)

    expect(edit.status).toBe('applied')
    expect(levelQuantity(stockFromApplied(edit), 'egg')).toBe(4)
  })

  it('leaves inventory untouched when an edit cannot reserve its increase', () => {
    const allocation = [{ ingredientId: 'egg', quantity: 10 }] as const
    const remaining = stockFromApplied(
      applyStockAllocation(initialStock, allocation),
    )
    const edit = applyStockAllocationChange(remaining, allocation, [
      { ingredientId: 'egg', quantity: 11 },
    ])

    expect(edit).toEqual({
      status: 'insufficientStock',
      stock: remaining,
      shortages: [
        { ingredientId: 'egg', required: 1, available: 0, missing: 1 },
      ],
    })
    expect(edit.stock).toBe(remaining)
  })

  it('rejects releasing more than the item holds and changes nothing', () => {
    const result = releaseStockAllocation(
      initialStock,
      [{ ingredientId: 'egg', quantity: 2 }],
      [{ ingredientId: 'egg', quantity: 3 }],
    )

    expect(result.status).toBe('invalidAllocation')
    expect(result.stock).toBe(initialStock)
    expect(
      result.status === 'invalidAllocation' ? result.issues : [],
    ).toContainEqual(
      expect.objectContaining({
        code: 'releaseExceedsHeld',
        ingredientId: 'egg',
      }),
    )
  })

  it('releases a valid held allocation without changing unlimited stock', () => {
    const held = [
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'ketchup', quantity: 3 },
    ] as const
    const remaining = stockFromApplied(applyStockAllocation(initialStock, held))
    const released = releaseStockAllocation(remaining, held)

    expect(released.status).toBe('applied')
    expect(levelQuantity(stockFromApplied(released), 'egg')).toBe(10)
    expect(
      stockLevel(stockFromApplied(released), 'ketchup').availability,
    ).toEqual({ type: 'unlimited' })
  })

  it('normalizes duplicate ingredient entries before applying stock', () => {
    const result = applyStockAllocation(initialStock, [
      { ingredientId: 'egg', quantity: 4 },
      { ingredientId: 'egg', quantity: 6 },
    ])

    expect(result.status).toBe('applied')
    expect(levelQuantity(stockFromApplied(result), 'egg')).toBe(0)
  })

  it('rejects an invalid allocation atomically without changing other ingredients', () => {
    const result = applyStockAllocation(initialStock, [
      { ingredientId: 'egg', quantity: 2 },
      { ingredientId: 'cheese', quantity: -1 },
    ])

    expect(result.status).toBe('invalidAllocation')
    expect(result.stock).toBe(initialStock)
    expect(levelQuantity(result.stock, 'egg')).toBe(10)
  })

  it('works with a modified fixture and ingredient IDs', () => {
    const alternateGroups: readonly OptionGroup[] = [
      {
        id: 'custom-group',
        name: 'Custom',
        constraints: { min: 0 },
        options: [
          option('option-alpha', 'Alpha', 'shared-resource', 2),
          option('option-beta', 'Beta', 'shared-resource', 3),
        ],
      },
    ]
    const alternateStock: StockSnapshot = {
      levels: [
        {
          ingredientId: 'shared-resource',
          availability: { type: 'finite', quantity: 11 },
        },
      ],
    }
    const requirements = calculateConfigurationRequirements(
      { selections: { 'option-alpha': 1, 'option-beta': 2 } },
      alternateGroups,
    )
    const result = applyStockAllocation(alternateStock, requirements)

    expect(requirements).toEqual([
      { ingredientId: 'shared-resource', quantity: 8 },
    ])
    expect(levelQuantity(stockFromApplied(result), 'shared-resource')).toBe(3)
  })

  it('rejects malformed configuration quantities before calculating stock', () => {
    expect(() =>
      calculateConfigurationRequirements({ selections: { fried: -1 } }, groups),
    ).toThrow('Fried quantity must be a non-negative integer')
    expect(() =>
      calculateConfigurationRequirements(
        { selections: { notInMenu: 1 } },
        groups,
      ),
    ).toThrow('Unknown option: notInMenu')
  })
})

function findOption(optionId: string): Option {
  const found = groups
    .flatMap(({ options }) => options)
    .find(({ id }) => id === optionId)

  if (!found) {
    throw new Error(`Test option not found: ${optionId}`)
  }

  return found
}

function stockFromApplied(
  result: ReturnType<typeof applyStockAllocation>,
): StockSnapshot
function stockFromApplied(
  result: ReturnType<typeof applyStockAllocationChange>,
): StockSnapshot
function stockFromApplied(
  result: ReturnType<typeof releaseStockAllocation>,
): StockSnapshot
function stockFromApplied(
  result:
    | ReturnType<typeof applyStockAllocation>
    | ReturnType<typeof applyStockAllocationChange>
    | ReturnType<typeof releaseStockAllocation>,
): StockSnapshot {
  if (result.status !== 'applied') {
    throw new Error(`Expected applied stock result, received ${result.status}`)
  }

  return result.stock
}

function stockLevel(stock: StockSnapshot, ingredientId: string) {
  const level = stock.levels.find(
    (candidate) => candidate.ingredientId === ingredientId,
  )

  if (!level) {
    throw new Error(`Test stock level not found: ${ingredientId}`)
  }

  return level
}

function levelQuantity(stock: StockSnapshot, ingredientId: string): number {
  const availability = stockLevel(stock, ingredientId).availability

  if (availability.type !== 'finite') {
    throw new Error(`Expected finite stock for ${ingredientId}`)
  }

  return availability.quantity
}

function option(
  id: string,
  name: string,
  ingredientId: string,
  quantity: number,
): Option {
  return {
    id,
    name,
    price: poisha(0),
    ingredientConsumption: [{ ingredientId, quantity }],
  }
}
