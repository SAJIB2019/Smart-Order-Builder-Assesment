import type { CartSnapshot } from './cart'
import type { Poisha } from './money'
import type {
  CouponPricingStatus,
  LinePricingBreakdown,
  PricingBreakdown,
} from './pricing'

export const ORDER_SCHEMA_VERSION = 1 as const
export const ORDERS_EXPORT_SCHEMA_VERSION = 1 as const
export const ORDER_CURRENCY = 'BDT' as const
export const ORDER_MONEY_UNIT = 'poisha' as const

export type PaymentMethod = 'card' | 'bkash' | 'cash'

export interface SeedOrderLine {
  readonly qty: number
  readonly options: Readonly<Record<string, number>>
}

export interface SeedOrder {
  readonly id: string
  readonly createdAt: string
  readonly paymentMethod: PaymentMethod
  readonly couponCode: string | null
  readonly lines: readonly SeedOrderLine[]
}

export interface SeedOrdersFile {
  readonly schemaVersion: 1
  readonly currency: 'BDT'
  readonly note: string
  readonly orders: readonly SeedOrder[]
}

export interface StoredOrderSelection {
  readonly groupId: string
  readonly groupName: string
  readonly optionId: string
  readonly optionName: string
  readonly quantity: number
  readonly unitPricePoisha: Poisha
}

export interface StoredOrderLine {
  readonly id: string
  readonly quantity: number
  readonly product: {
    readonly id: string
    readonly name: string
    readonly basePricePoisha: Poisha
  }
  readonly selections: readonly StoredOrderSelection[]
  readonly pricing: LinePricingBreakdown
}

export interface StoredOrderCoupon {
  readonly attemptedCode: string | null
  readonly status: CouponPricingStatus
  readonly matchedPromotionId: string | null
  readonly applied: boolean
  readonly appliedDiscountPoisha: Poisha
}

export interface StoredOrder {
  readonly schemaVersion: typeof ORDER_SCHEMA_VERSION
  readonly id: string
  readonly createdAt: string
  readonly currency: typeof ORDER_CURRENCY
  readonly moneyUnit: typeof ORDER_MONEY_UNIT
  readonly paymentMethod: PaymentMethod
  readonly coupon: StoredOrderCoupon
  readonly lines: readonly StoredOrderLine[]
  readonly pricing: PricingBreakdown
}

export interface OrdersExport {
  readonly schemaVersion: typeof ORDERS_EXPORT_SCHEMA_VERSION
  readonly currency: typeof ORDER_CURRENCY
  readonly moneyUnit: typeof ORDER_MONEY_UNIT
  readonly orders: readonly StoredOrder[]
}

export interface CheckoutRequest {
  readonly cartVersion: number
  readonly idempotencyKey: string
  readonly paymentMethod: PaymentMethod
  readonly attemptedCouponCode: string | null
}

export interface CheckoutResponse {
  readonly order: StoredOrder
  readonly cart: CartSnapshot
  readonly replayed: boolean
}

export interface OrdersSnapshot {
  readonly orders: readonly StoredOrder[]
}
