import type { Poisha } from './money'

export interface AppliedDiscount {
  readonly promotionId: string
  readonly name: string
  readonly amount: Poisha
}

export interface LinePricingBreakdown {
  readonly cartItemId: string
  readonly unitSubtotal: Poisha
  readonly unitDiscounts: readonly AppliedDiscount[]
  readonly unitPrice: Poisha
  readonly quantity: number
  readonly lineTotal: Poisha
}

export interface PricingBreakdown {
  readonly lines: readonly LinePricingBreakdown[]
  readonly subtotal: Poisha
  readonly cartDiscount: AppliedDiscount | null
  readonly discountedSubtotal: Poisha
  readonly vat: Poisha
  readonly payableBeforeWholeBdtRounding: Poisha
  readonly payable: Poisha
}
