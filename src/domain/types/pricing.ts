import type { Poisha } from './money'
import type { Configuration } from './menu'

export interface PriceableCartItem {
  readonly id: string
  readonly configuration: Configuration
  readonly quantity: number
}

export interface PriceableCart {
  readonly items: readonly PriceableCartItem[]
  readonly attemptedCouponCode: string | null
}

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

export type CouponPricingStatus =
  | 'notAttempted'
  | 'unknownCode'
  | 'unavailable'
  | 'outsideTimeWindow'
  | 'eligibleNotApplied'
  | 'applied'

export interface CouponPricingBreakdown {
  readonly attemptedCode: string | null
  readonly matchedPromotionId: string | null
  readonly eligible: boolean
  readonly applied: boolean
  readonly candidateDiscount: Poisha | null
  readonly status: CouponPricingStatus
}

export interface PricingBreakdown {
  readonly serverTime: string
  readonly lines: readonly LinePricingBreakdown[]
  readonly subtotal: Poisha
  readonly cartDiscountCandidates: readonly AppliedDiscount[]
  readonly cartDiscount: AppliedDiscount | null
  readonly coupon: CouponPricingBreakdown
  readonly discountedSubtotal: Poisha
  readonly vat: Poisha
  readonly payableBeforeWholeBdtRounding: Poisha
  readonly payable: Poisha
}

export interface PricePreviewRequest {
  readonly requestId: string
  readonly cart: PriceableCart
}

export interface PricePreviewResponse {
  readonly requestId: string
  readonly pricing: PricingBreakdown
}
