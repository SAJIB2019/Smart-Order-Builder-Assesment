import type { Configuration } from './menu'
import type { PricingBreakdown } from './pricing'
import type { StockAllocation } from './stock'

export type CartItemQuantity = 1 | 2 | 3

export interface CartItem {
  readonly id: string
  readonly configuration: Configuration
  readonly quantity: CartItemQuantity
  readonly reservationId: string
}

interface ReservationBase {
  readonly id: string
  readonly cartItemId: string
  readonly allocation: readonly StockAllocation[]
  readonly reservedAt: string
}

export interface ActiveReservation extends ReservationBase {
  readonly status: 'active'
  readonly expiresAt: string
}

export interface EndedReservation extends ReservationBase {
  readonly status: 'expired' | 'released' | 'convertedToSale'
  readonly endedAt: string
}

export type Reservation = ActiveReservation | EndedReservation

export interface CartSnapshot {
  readonly version: number
  readonly items: readonly CartItem[]
  readonly reservations: readonly Reservation[]
  /** Current estimate for active reservations only. */
  readonly activePricing: PricingBreakdown
}

export interface AddCartItemRequest {
  readonly cartVersion: number
  readonly idempotencyKey: string
  readonly configuration: Configuration
  readonly quantity: number
}

export interface EditCartItemRequest {
  readonly cartVersion: number
  readonly configuration: Configuration
  readonly quantity: number
}

export interface RemoveCartItemRequest {
  readonly cartVersion: number
}

export interface CartItemMutationResponse {
  readonly item: CartItem
  readonly reservation: Reservation
  readonly cart: CartSnapshot
  readonly replayed: boolean
}

export interface RemoveCartItemResponse {
  readonly removedCartItemId: string
  readonly cart: CartSnapshot
}

export interface ExpireReservationsResponse {
  readonly expiredReservationIds: readonly string[]
  readonly cart: CartSnapshot
}
