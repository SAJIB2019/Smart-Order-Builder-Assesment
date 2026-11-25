import { describe, expect, it } from 'vitest'

import { expireDueReservations } from '../../../../src/domain/cart/reservations'
import type { ActiveReservation } from '../../../../src/domain/types/cart'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

describe('expireDueReservations', () => {
  it('expires at the exact server timestamp and releases stock once', () => {
    const stock = reserveEggs(2)
    const reservation = activeReservation()
    const first = expireDueReservations(
      stock,
      [reservation],
      reservation.expiresAt,
    )
    const second = expireDueReservations(
      first.stock,
      first.reservations,
      '2026-11-25T10:06:00.000Z',
    )

    expect(finiteQuantity(first.stock, 'egg')).toBe(10)
    expect(first.expiredReservationIds).toEqual(['reservation-1'])
    expect(first.reservations[0]).toEqual(
      expect.objectContaining({
        status: 'expired',
        endedAt: reservation.expiresAt,
      }),
    )
    expect(finiteQuantity(second.stock, 'egg')).toBe(10)
    expect(second.expiredReservationIds).toEqual([])
  })

  it('does not expire one millisecond early', () => {
    const result = expireDueReservations(
      reserveEggs(2),
      [activeReservation()],
      '2026-11-25T10:04:59.999Z',
    )

    expect(result.reservations[0]?.status).toBe('active')
    expect(finiteQuantity(result.stock, 'egg')).toBe(8)
  })
})

function activeReservation(): ActiveReservation {
  return {
    id: 'reservation-1',
    cartItemId: 'cart-1',
    allocation: [{ ingredientId: 'egg', quantity: 2 }],
    reservedAt: '2026-11-25T10:00:00.000Z',
    status: 'active',
    expiresAt: '2026-11-25T10:05:00.000Z',
  }
}

function reserveEggs(quantity: number) {
  return {
    levels: buildYourBreakfastFixture.stock.levels.map((level) =>
      level.ingredientId === 'egg'
        ? {
            ...level,
            availability: {
              type: 'finite' as const,
              quantity: 10 - quantity,
            },
          }
        : level,
    ),
  }
}

function finiteQuantity(
  stock: typeof buildYourBreakfastFixture.stock,
  ingredientId: string,
): number {
  const availability = stock.levels.find(
    (level) => level.ingredientId === ingredientId,
  )?.availability
  if (availability?.type !== 'finite') throw new Error('Expected finite stock')
  return availability.quantity
}
