import { describe, expect, it } from 'vitest'

import { poisha } from '../../../src/domain/types/money'

describe('poisha', () => {
  it('keeps monetary values as safe integers', () => {
    expect(poisha(67_950)).toBe(67_950)
    expect(Number.isInteger(poisha(67_950))).toBe(true)
  })

  it.each([679.5, -1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid monetary value %s',
    (value) => {
      expect(() => poisha(value)).toThrow(RangeError)
    },
  )
})
