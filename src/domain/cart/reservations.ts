import type { Reservation } from '../types/cart'
import type { StockSnapshot } from '../types/stock'
import { releaseStockAllocation } from '../stock/stock-engine'

export interface ExpirationResult {
  readonly stock: StockSnapshot
  readonly reservations: readonly Reservation[]
  readonly expiredReservationIds: readonly string[]
}

/** Releases every due active reservation once, at its exact server expiry. */
export function expireDueReservations(
  stock: StockSnapshot,
  reservations: readonly Reservation[],
  serverTime: string,
): ExpirationResult {
  const now = Date.parse(serverTime)
  if (Number.isNaN(now)) throw new RangeError('Invalid server time')

  let nextStock = stock
  const expiredReservationIds: string[] = []
  const nextReservations = reservations.map((reservation): Reservation => {
    if (
      reservation.status !== 'active' ||
      Date.parse(reservation.expiresAt) > now
    ) {
      return reservation
    }

    const release = releaseStockAllocation(nextStock, reservation.allocation)
    if (release.status !== 'applied') {
      throw new Error(`Could not release expired reservation ${reservation.id}`)
    }

    nextStock = release.stock
    expiredReservationIds.push(reservation.id)
    return {
      id: reservation.id,
      cartItemId: reservation.cartItemId,
      allocation: reservation.allocation,
      reservedAt: reservation.reservedAt,
      status: 'expired',
      endedAt: reservation.expiresAt,
    }
  })

  return {
    stock: nextStock,
    reservations: nextReservations,
    expiredReservationIds,
  }
}
