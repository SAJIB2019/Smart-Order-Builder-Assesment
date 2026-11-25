export interface ServerTimeSync {
  readonly offsetMs: number
  readonly synchronizedAtBrowserTimeMs: number
}

export function synchronizeServerTime(
  serverTime: string,
  browserTimeMs: number,
): ServerTimeSync {
  const serverTimeMs = Date.parse(serverTime)
  if (Number.isNaN(serverTimeMs) || !Number.isFinite(browserTimeMs)) {
    throw new RangeError('Server and browser times must be valid')
  }

  return {
    offsetMs: serverTimeMs - browserTimeMs,
    synchronizedAtBrowserTimeMs: browserTimeMs,
  }
}

export function calculateReservationRemainingMs(
  expiresAt: string,
  sync: ServerTimeSync,
  browserTimeMs: number,
): number {
  const expiresAtMs = Date.parse(expiresAt)
  if (Number.isNaN(expiresAtMs) || !Number.isFinite(browserTimeMs)) {
    throw new RangeError('Expiry and browser times must be valid')
  }

  return Math.max(0, expiresAtMs - (browserTimeMs + sync.offsetMs))
}
