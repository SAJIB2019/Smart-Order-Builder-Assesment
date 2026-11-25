import type { PricingBreakdown } from './pricing'

export type PaymentMethod = 'card' | 'bkash' | 'cash'

/**
 * Runtime aggregate only. The persisted/exported JSON shape remains gated by
 * decision D6 and will be specialized before order storage is implemented.
 */
export interface Order<TLine = unknown> {
  readonly id: string
  readonly createdAt: string
  readonly paymentMethod: PaymentMethod
  readonly lines: readonly TLine[]
  readonly pricing: PricingBreakdown
}
