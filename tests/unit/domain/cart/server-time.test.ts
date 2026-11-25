import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  calculateReservationRemainingMs,
  synchronizeServerTime,
} from '../../../../src/domain/cart/server-time'
import { useReservationCountdown } from '../../../../src/hooks/use-reservation-countdown'

afterEach(() => vi.useRealTimers())

describe('server-time reservation countdown', () => {
  it('uses the server/browser offset instead of raw browser time', () => {
    const sync = synchronizeServerTime('1970-01-01T00:01:30.000Z', 0)

    expect(sync.offsetMs).toBe(90_000)
    expect(
      calculateReservationRemainingMs('1970-01-01T00:06:30.000Z', sync, 0),
    ).toBe(300_000)
  })

  it('ticks to zero using synchronized server time and cleans up on unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { result, unmount } = renderHook(() =>
      useReservationCountdown({
        serverTime: '1970-01-01T00:01:30.000Z',
        expiresAt: '1970-01-01T00:06:30.000Z',
      }),
    )

    expect(result.current).toBe(300_000)
    act(() => vi.advanceTimersByTime(299_000))
    expect(result.current).toBe(1_000)
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current).toBe(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
