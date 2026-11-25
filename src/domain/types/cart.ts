import type { Configuration } from './menu'
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
