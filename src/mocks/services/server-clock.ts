export const DEFAULT_SERVER_OFFSET_MS = 90_000

export interface Clock {
  now(): number
}

export const systemClock: Clock = {
  now: () => Date.now(),
}

export class ServerClock {
  constructor(
    private readonly sourceClock: Clock = systemClock,
    private readonly offsetMs: number = DEFAULT_SERVER_OFFSET_MS,
  ) {}

  now(): Date {
    return new Date(this.sourceClock.now() + this.offsetMs)
  }

  nowIso(): string {
    return this.now().toISOString()
  }
}
