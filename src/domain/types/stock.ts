export type StockAvailability =
  | { readonly type: 'finite'; readonly quantity: number }
  | { readonly type: 'unlimited' }

export interface StockLevel {
  readonly ingredientId: string
  readonly availability: StockAvailability
}

export interface StockSnapshot {
  readonly levels: readonly StockLevel[]
}

export interface StockAllocation {
  readonly ingredientId: string
  readonly quantity: number
}

export interface IngredientShortage {
  readonly ingredientId: string
  readonly required: number
  readonly available: number
  readonly missing: number
}

export interface StockDataIssue {
  readonly code:
    'invalidAllocationQuantity' | 'invalidStockQuantity' | 'releaseExceedsHeld'
  readonly ingredientId: string
  readonly message: string
}

export type AvailabilityResult =
  | {
      readonly status: 'available'
      readonly shortages: readonly []
    }
  | {
      readonly status: 'insufficientStock'
      readonly shortages: readonly IngredientShortage[]
    }
  | {
      readonly status: 'invalidAllocation'
      readonly shortages: readonly []
      readonly issues: readonly StockDataIssue[]
    }

export type StockMutationResult =
  | {
      readonly status: 'applied'
      readonly stock: StockSnapshot
    }
  | {
      readonly status: 'insufficientStock'
      /** The original, unmodified stock snapshot. */
      readonly stock: StockSnapshot
      readonly shortages: readonly IngredientShortage[]
    }
  | {
      readonly status: 'invalidAllocation'
      /** The original, unmodified stock snapshot. */
      readonly stock: StockSnapshot
      readonly issues: readonly StockDataIssue[]
    }

export interface NetAllocationDifference {
  /** Additional quantities that must be taken from currently remaining stock. */
  readonly reserve: readonly StockAllocation[]
  /** Quantities from the item's existing hold that may be returned. */
  readonly release: readonly StockAllocation[]
}

export type AdditionalUnitCapacity =
  | { readonly type: 'finite'; readonly quantity: number }
  | { readonly type: 'unlimited' }
