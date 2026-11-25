import { describe, expect, it } from 'vitest'

import type { PricePreviewRequest } from '../../../src/domain/types/pricing'
import { createPricePreviewSimulation } from '../../../src/mocks/services/price-preview-simulation'

const request: PricePreviewRequest = {
  requestId: 'request',
  cart: { items: [], attemptedCouponCode: null },
}

describe('price preview simulation', () => {
  it('maps injected random values to the inclusive 200–1500 ms range', () => {
    expect(createPricePreviewSimulation(() => 0).latencyMs(request)).toBe(200)
    expect(
      createPricePreviewSimulation(() => 0.999_999).latencyMs(request),
    ).toBe(1_500)
  })

  it('fails below the 15% boundary and succeeds at the boundary', () => {
    expect(
      createPricePreviewSimulation(() => 0.149_999).shouldFail(request),
    ).toBe(true)
    expect(createPricePreviewSimulation(() => 0.15).shouldFail(request)).toBe(
      false,
    )
  })
})
