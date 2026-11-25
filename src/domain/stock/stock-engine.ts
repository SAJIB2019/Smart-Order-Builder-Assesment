import type { CartItemQuantity } from '../types/cart'
import type { Configuration, Option, OptionGroup } from '../types/menu'
import type {
  AdditionalUnitCapacity,
  AvailabilityResult,
  IngredientShortage,
  NetAllocationDifference,
  StockAllocation,
  StockDataIssue,
  StockLevel,
  StockMutationResult,
  StockSnapshot,
} from '../types/stock'

const MIN_CART_ITEM_QUANTITY = 1
const MAX_CART_ITEM_QUANTITY = 3

/** Aggregates every selected option recipe by ingredient. */
export function calculateConfigurationRequirements(
  configuration: Configuration,
  groups: readonly OptionGroup[],
): readonly StockAllocation[] {
  const optionIndex = new Map<string, Option>()

  for (const group of groups) {
    for (const option of group.options) {
      optionIndex.set(option.id, option)
    }
  }

  const requirements = new Map<string, number>()

  for (const [optionId, optionQuantity] of Object.entries(
    configuration.selections,
  )) {
    const option = optionIndex.get(optionId)

    if (!option) {
      throw new RangeError(`Unknown option: ${optionId}`)
    }

    assertNonNegativeInteger(optionQuantity, `${option.name} quantity`)

    for (const consumption of option.ingredientConsumption) {
      assertPositiveInteger(
        consumption.quantity,
        `${consumption.ingredientId} recipe quantity`,
      )
      addQuantity(
        requirements,
        consumption.ingredientId,
        consumption.quantity * optionQuantity,
      )
    }
  }

  return mapToAllocation(requirements)
}

/** Multiplies a per-item allocation by a runtime-checked cart quantity of 1–3. */
export function multiplyIngredientRequirements(
  requirements: readonly StockAllocation[],
  itemQuantity: number,
): readonly StockAllocation[] {
  assertCartItemQuantity(itemQuantity)
  const normalized = normalizeAllocationOrThrow(requirements)

  return normalized.map(({ ingredientId, quantity }) => {
    const multipliedQuantity = quantity * itemQuantity
    assertNonNegativeSafeInteger(
      multipliedQuantity,
      `${ingredientId} multiplied quantity`,
    )

    return { ingredientId, quantity: multipliedQuantity }
  })
}

/**
 * Computes stock after an allocation without mutating the supplied snapshot.
 * Failure returns the original snapshot and every shortage.
 */
export function calculateRemainingStock(
  stock: StockSnapshot,
  allocation: readonly StockAllocation[],
): StockMutationResult {
  return applyStockAllocation(stock, allocation)
}

/**
 * Returns how many additional units of one option fit in currently remaining
 * stock. The cart-item quantity scales the recipe for each added option unit.
 */
export function calculateMaximumAdditionalOptionUnits(
  option: Option,
  itemQuantity: number,
  stock: StockSnapshot,
): AdditionalUnitCapacity {
  assertCartItemQuantity(itemQuantity)
  const perAddedUnit = new Map<string, number>()

  for (const consumption of option.ingredientConsumption) {
    assertPositiveInteger(
      consumption.quantity,
      `${consumption.ingredientId} recipe quantity`,
    )
    addQuantity(
      perAddedUnit,
      consumption.ingredientId,
      consumption.quantity * itemQuantity,
    )
  }

  if (perAddedUnit.size === 0) {
    return { type: 'unlimited' }
  }

  const stockIndex = indexStockOrThrow(stock)
  let capacity = Number.POSITIVE_INFINITY

  for (const [ingredientId, requiredPerUnit] of perAddedUnit) {
    const level = stockIndex.get(ingredientId)

    if (!level) {
      return { type: 'finite', quantity: 0 }
    }

    if (level.availability.type === 'finite') {
      capacity = Math.min(
        capacity,
        Math.floor(level.availability.quantity / requiredPerUnit),
      )
    }
  }

  return capacity === Number.POSITIVE_INFINITY
    ? { type: 'unlimited' }
    : { type: 'finite', quantity: capacity }
}

/** Checks all required ingredients and never stops at the first shortage. */
export function checkIngredientAvailability(
  stock: StockSnapshot,
  allocation: readonly StockAllocation[],
): AvailabilityResult {
  const allocationResult = normalizeAllocation(allocation)
  const stockIssues = validateStock(stock)
  const issues = [...stockIssues, ...allocationResult.issues]

  if (issues.length > 0) {
    return { status: 'invalidAllocation', shortages: [], issues }
  }

  const stockIndex = new Map(
    stock.levels.map((level) => [level.ingredientId, level]),
  )
  const shortages: IngredientShortage[] = []

  for (const requirement of allocationResult.allocation) {
    const level = stockIndex.get(requirement.ingredientId)

    if (level?.availability.type === 'unlimited') {
      continue
    }

    const available = level?.availability.quantity ?? 0

    if (requirement.quantity > available) {
      shortages.push({
        ingredientId: requirement.ingredientId,
        required: requirement.quantity,
        available,
        missing: requirement.quantity - available,
      })
    }
  }

  return shortages.length === 0
    ? { status: 'available', shortages: [] }
    : { status: 'insufficientStock', shortages }
}

/**
 * Compares an item's proposed allocation with only its own current hold.
 * Unchanged quantities disappear, increases become reserves, and decreases
 * become releases, so the current allocation is never counted twice.
 */
export function calculateNetAllocationDifference(
  currentAllocation: readonly StockAllocation[],
  proposedAllocation: readonly StockAllocation[],
): NetAllocationDifference {
  const current = allocationToMap(normalizeAllocationOrThrow(currentAllocation))
  const proposed = allocationToMap(
    normalizeAllocationOrThrow(proposedAllocation),
  )
  const ingredientIds = new Set([...current.keys(), ...proposed.keys()])
  const reserve: StockAllocation[] = []
  const release: StockAllocation[] = []

  for (const ingredientId of ingredientIds) {
    const difference =
      (proposed.get(ingredientId) ?? 0) - (current.get(ingredientId) ?? 0)

    if (difference > 0) {
      reserve.push({ ingredientId, quantity: difference })
    } else if (difference < 0) {
      release.push({ ingredientId, quantity: -difference })
    }
  }

  return { reserve, release }
}

/** Atomically applies a valid allocation or returns the original snapshot. */
export function applyStockAllocation(
  stock: StockSnapshot,
  allocation: readonly StockAllocation[],
): StockMutationResult {
  const availability = checkIngredientAvailability(stock, allocation)

  if (availability.status === 'invalidAllocation') {
    return {
      status: 'invalidAllocation',
      stock,
      issues: availability.issues,
    }
  }

  if (availability.status === 'insufficientStock') {
    return {
      status: 'insufficientStock',
      stock,
      shortages: availability.shortages,
    }
  }

  const normalized = normalizeAllocationOrThrow(allocation)
  return {
    status: 'applied',
    stock: adjustFiniteStock(stock, normalized, 'subtract'),
  }
}

/**
 * Releases only quantities proven to be held by this item. A request larger
 * than the hold is rejected atomically and leaves stock unchanged.
 */
export function releaseStockAllocation(
  stock: StockSnapshot,
  heldAllocation: readonly StockAllocation[],
  requestedRelease: readonly StockAllocation[] = heldAllocation,
): StockMutationResult {
  const heldResult = normalizeAllocation(heldAllocation)
  const releaseResult = normalizeAllocation(requestedRelease)
  const issues = [
    ...validateStock(stock),
    ...heldResult.issues,
    ...releaseResult.issues,
  ]

  if (issues.length === 0) {
    const held = allocationToMap(heldResult.allocation)

    for (const release of releaseResult.allocation) {
      const heldQuantity = held.get(release.ingredientId) ?? 0

      if (release.quantity > heldQuantity) {
        issues.push({
          code: 'releaseExceedsHeld',
          ingredientId: release.ingredientId,
          message: `Cannot release ${release.quantity} ${release.ingredientId}; item holds ${heldQuantity}`,
        })
      }
    }
  }

  if (issues.length > 0) {
    return { status: 'invalidAllocation', stock, issues }
  }

  return {
    status: 'applied',
    stock: adjustFiniteStock(stock, releaseResult.allocation, 'add'),
  }
}

/**
 * Atomically swaps one item's allocation using only the net difference.
 * The input stock is the remaining stock while the current hold is active.
 */
export function applyStockAllocationChange(
  stock: StockSnapshot,
  currentAllocation: readonly StockAllocation[],
  proposedAllocation: readonly StockAllocation[],
): StockMutationResult {
  const currentResult = normalizeAllocation(currentAllocation)
  const proposedResult = normalizeAllocation(proposedAllocation)
  const issues = [
    ...validateStock(stock),
    ...currentResult.issues,
    ...proposedResult.issues,
  ]

  if (issues.length > 0) {
    return { status: 'invalidAllocation', stock, issues }
  }

  const difference = calculateNetAllocationDifference(
    currentResult.allocation,
    proposedResult.allocation,
  )
  const availability = checkIngredientAvailability(stock, difference.reserve)

  if (availability.status === 'invalidAllocation') {
    return {
      status: 'invalidAllocation',
      stock,
      issues: availability.issues,
    }
  }

  if (availability.status === 'insufficientStock') {
    return {
      status: 'insufficientStock',
      stock,
      shortages: availability.shortages,
    }
  }

  const afterReserve = adjustFiniteStock(stock, difference.reserve, 'subtract')

  return {
    status: 'applied',
    stock: adjustFiniteStock(afterReserve, difference.release, 'add'),
  }
}

export function formatIngredientShortages(
  shortages: readonly IngredientShortage[],
): string {
  return `Short: ${shortages
    .map(({ ingredientId, missing }) => `${missing} ${ingredientId}`)
    .join(', ')}`
}

export function assertCartItemQuantity(
  quantity: number,
): asserts quantity is CartItemQuantity {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < MIN_CART_ITEM_QUANTITY ||
    quantity > MAX_CART_ITEM_QUANTITY
  ) {
    throw new RangeError('Cart item quantity must be an integer from 1 to 3')
  }
}

function adjustFiniteStock(
  stock: StockSnapshot,
  allocation: readonly StockAllocation[],
  operation: 'add' | 'subtract',
): StockSnapshot {
  const allocationIndex = allocationToMap(allocation)

  return {
    levels: stock.levels.map((level) => {
      if (level.availability.type === 'unlimited') {
        return level
      }

      const adjustment = allocationIndex.get(level.ingredientId) ?? 0
      const quantity =
        operation === 'subtract'
          ? level.availability.quantity - adjustment
          : level.availability.quantity + adjustment

      return {
        ...level,
        availability: { type: 'finite', quantity },
      }
    }),
  }
}

function indexStockOrThrow(
  stock: StockSnapshot,
): ReadonlyMap<string, StockLevel> {
  const issues = validateStock(stock)

  if (issues.length > 0) {
    throw new RangeError(issues.map(({ message }) => message).join('; '))
  }

  return new Map(stock.levels.map((level) => [level.ingredientId, level]))
}

function validateStock(stock: StockSnapshot): StockDataIssue[] {
  const issues: StockDataIssue[] = []

  for (const level of stock.levels) {
    if (
      level.availability.type === 'finite' &&
      (!Number.isSafeInteger(level.availability.quantity) ||
        level.availability.quantity < 0)
    ) {
      issues.push({
        code: 'invalidStockQuantity',
        ingredientId: level.ingredientId,
        message: `${level.ingredientId} stock must be a non-negative integer`,
      })
    }
  }

  return issues
}

function normalizeAllocation(allocation: readonly StockAllocation[]): {
  readonly allocation: readonly StockAllocation[]
  readonly issues: StockDataIssue[]
} {
  const normalized = new Map<string, number>()
  const issues: StockDataIssue[] = []

  for (const entry of allocation) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 0) {
      issues.push({
        code: 'invalidAllocationQuantity',
        ingredientId: entry.ingredientId,
        message: `${entry.ingredientId} allocation must be a non-negative integer`,
      })
      continue
    }

    addQuantity(normalized, entry.ingredientId, entry.quantity)
  }

  return { allocation: mapToAllocation(normalized), issues }
}

function normalizeAllocationOrThrow(
  allocation: readonly StockAllocation[],
): readonly StockAllocation[] {
  const result = normalizeAllocation(allocation)

  if (result.issues.length > 0) {
    throw new RangeError(result.issues.map(({ message }) => message).join('; '))
  }

  return result.allocation
}

function allocationToMap(
  allocation: readonly StockAllocation[],
): ReadonlyMap<string, number> {
  return new Map(
    allocation.map(({ ingredientId, quantity }) => [ingredientId, quantity]),
  )
}

function mapToAllocation(
  quantities: ReadonlyMap<string, number>,
): readonly StockAllocation[] {
  return [...quantities]
    .filter(([, quantity]) => quantity > 0)
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
}

function addQuantity(
  quantities: Map<string, number>,
  ingredientId: string,
  quantity: number,
): void {
  const total = (quantities.get(ingredientId) ?? 0) + quantity
  assertNonNegativeSafeInteger(total, `${ingredientId} total quantity`)
  quantities.set(ingredientId, total)
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`)
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}
