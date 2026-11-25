import type { Poisha } from './money'

interface BasePromotion {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
}

export interface QuantityCheapestFreePromotion extends BasePromotion {
  readonly type: 'quantityCheapestFree'
  readonly scope: 'unit'
  readonly eligibleGroupId: string
  readonly qualifyingQuantity: number
  readonly freeQuantity: number
}

export interface GroupThresholdPercentagePromotion extends BasePromotion {
  readonly type: 'groupThresholdPercentage'
  readonly scope: 'unit'
  readonly conditions: readonly {
    readonly groupId: string
    readonly minimumQuantity: number
  }[]
  readonly percentageBasisPoints: number
}

export interface ThresholdFixedDiscountPromotion extends BasePromotion {
  readonly type: 'thresholdFixedDiscount'
  readonly scope: 'cart'
  readonly minimumSubtotal: Poisha
  readonly discountAmount: Poisha
  readonly tieBreakPriority: number
}

export interface TimedPercentageCouponPromotion extends BasePromotion {
  readonly type: 'timedPercentageCoupon'
  readonly scope: 'cart'
  readonly couponCode: string
  readonly percentageBasisPoints: number
  readonly maximumDiscount: Poisha
  readonly validBefore: {
    readonly localTime: string
    readonly timeZone: string
    readonly exclusive: true
  }
  readonly tieBreakPriority: number
}

export type Promotion =
  | QuantityCheapestFreePromotion
  | GroupThresholdPercentagePromotion
  | ThresholdFixedDiscountPromotion
  | TimedPercentageCouponPromotion
