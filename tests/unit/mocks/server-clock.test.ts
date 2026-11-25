import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SERVER_OFFSET_MS,
  ServerClock,
} from '../../../src/mocks/services/server-clock'

describe('ServerClock', () => {
  it('runs 90 seconds ahead by default', () => {
    const browserNow = Date.parse('2026-11-25T09:00:00.000Z')
    const clock = new ServerClock({ now: () => browserNow })

    expect(clock.now().getTime() - browserNow).toBe(DEFAULT_SERVER_OFFSET_MS)
    expect(clock.nowIso()).toBe('2026-11-25T09:01:30.000Z')
  })

  it('accepts an injected offset', () => {
    const clock = new ServerClock({ now: () => 1_000 }, 5_000)

    expect(clock.now().getTime()).toBe(6_000)
  })
})
