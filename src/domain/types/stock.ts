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
