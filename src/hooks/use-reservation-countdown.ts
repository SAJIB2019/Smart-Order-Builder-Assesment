import { useEffect, useMemo, useReducer } from 'react'

import {
  calculateReservationRemainingMs,
  synchronizeServerTime,
} from '../domain/cart/server-time'

interface UseReservationCountdownOptions {
  readonly expiresAt: string
  readonly serverTime: string
  readonly tickMs?: number
  readonly now?: () => number
}

const systemNow = () => Date.now()

export function useReservationCountdown({
  expiresAt,
  serverTime,
  tickMs = 1_000,
  now = systemNow,
}: UseReservationCountdownOptions): number {
  const sync = useMemo(
    () => synchronizeServerTime(serverTime, now()),
    [now, serverTime],
  )
  const [, forceTick] = useReducer((tick: number) => tick + 1, 0)

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      forceTick()
    }, tickMs)

    return () => globalThis.clearInterval(timer)
  }, [tickMs])

  return calculateReservationRemainingMs(expiresAt, sync, now())
}
