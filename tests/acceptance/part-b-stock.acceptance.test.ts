import { describe, expect, it } from 'vitest'

import {
  applyStockAllocationChange,
  calculateConfigurationRequirements,
  calculateRemainingStock,
  formatIngredientShortages,
  multiplyIngredientRequirements,
} from '../../src/domain/stock/stock-engine'
import type { Configuration } from '../../src/domain/types/menu'
import type {
  StockAllocation,
  StockMutationResult,
  StockSnapshot,
} from '../../src/domain/types/stock'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'

const { groups } = buildYourBreakfastFixture.menu

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

describe('Part B official stock acceptance tests', () => {
  it('TC-08 calculates remaining stock for B x1 plus C x2', () => {
    const remaining = stockAfterBAndTwoC()

    expect(finiteQuantity(remaining, 'egg')).toBe(0)
    expect(finiteQuantity(remaining, 'cheese')).toBe(0)
    expect(finiteQuantity(remaining, 'croissant')).toBe(1)

    const newEggItem = calculateRemainingStock(remaining, [
      { ingredientId: 'egg', quantity: 1 },
    ])
    expect(newEggItem).toEqual({
      status: 'insufficientStock',
      stock: remaining,
      shortages: [
        { ingredientId: 'egg', required: 1, available: 0, missing: 1 },
      ],
    })
  })

  it('TC-09 blocks editing B to Omelette x3 plus Fried x1 using B own allocation', () => {
    const remaining = stockAfterBAndTwoC()
    const currentB = requirements(configurationB)
    const proposedB = requirements({
      selections: {
        ...configurationB.selections,
        omelette: 3,
        fried: 1,
      },
    })
    const result = applyStockAllocationChange(remaining, currentB, proposedB)

    expect(result).toEqual({
      status: 'insufficientStock',
      stock: remaining,
      shortages: [
        { ingredientId: 'egg', required: 1, available: 0, missing: 1 },
      ],
    })
    expect(shortageMessage(result)).toBe('Short: 1 egg')
  })

  it('TC-10 allows editing B to Omelette x1 plus Fried x3 and leaves one egg', () => {
    const remaining = stockAfterBAndTwoC()
    const currentB = requirements(configurationB)
    const proposedB = requirements({
      selections: {
        ...configurationB.selections,
        omelette: 1,
        fried: 3,
      },
    })
    const result = applyStockAllocationChange(remaining, currentB, proposedB)

    expect(result.status).toBe('applied')
    expect(finiteQuantity(appliedStock(result), 'egg')).toBe(1)
  })

  it('TC-11 blocks increasing C quantity from 2 to 3 and lists both shortages', () => {
    const remaining = stockAfterBAndTwoC()
    const perUnitC = requirements(configurationC)
    const currentC = multiplyIngredientRequirements(perUnitC, 2)
    const proposedC = multiplyIngredientRequirements(perUnitC, 3)
    const result = applyStockAllocationChange(remaining, currentC, proposedC)

    expect(result).toEqual({
      status: 'insufficientStock',
      stock: remaining,
      shortages: [
        { ingredientId: 'egg', required: 2, available: 0, missing: 2 },
        { ingredientId: 'cheese', required: 2, available: 0, missing: 2 },
      ],
    })
    expect(shortageMessage(result)).toBe('Short: 2 egg, 2 cheese')
  })
})

function stockAfterBAndTwoC(): StockSnapshot {
  const combinedAllocation = mergeAllocations([
    ...requirements(configurationB),
    ...multiplyIngredientRequirements(requirements(configurationC), 2),
  ])
  const result = calculateRemainingStock(
    buildYourBreakfastFixture.stock,
    combinedAllocation,
  )

  return appliedStock(result)
}

function requirements(
  configuration: Configuration,
): readonly StockAllocation[] {
  return calculateConfigurationRequirements(configuration, groups)
}

function mergeAllocations(
  allocations: readonly StockAllocation[],
): readonly StockAllocation[] {
  const totals = new Map<string, number>()

  for (const allocation of allocations) {
    totals.set(
      allocation.ingredientId,
      (totals.get(allocation.ingredientId) ?? 0) + allocation.quantity,
    )
  }

  return [...totals].map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }))
}

function appliedStock(result: StockMutationResult): StockSnapshot {
  if (result.status !== 'applied') {
    throw new Error(`Expected applied stock result, received ${result.status}`)
  }

  return result.stock
}

function shortageMessage(result: StockMutationResult): string {
  if (result.status !== 'insufficientStock') {
    throw new Error(`Expected insufficient stock, received ${result.status}`)
  }

  return formatIngredientShortages(result.shortages)
}

function finiteQuantity(stock: StockSnapshot, ingredientId: string): number {
  const level = stock.levels.find(
    (candidate) => candidate.ingredientId === ingredientId,
  )

  if (!level || level.availability.type !== 'finite') {
    throw new Error(`Expected finite stock for ${ingredientId}`)
  }

  return level.availability.quantity
}
