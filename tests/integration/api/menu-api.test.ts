import { describe, expect, it } from 'vitest'

import { ApiClient } from '../../../src/services/api/api-client'

const apiClient = new ApiClient({ baseUrl: 'http://localhost' })

describe('menu and stock API', () => {
  it('returns the typed menu with server metadata', async () => {
    const browserBefore = Date.now()
    const response = await apiClient.getMenu()
    const browserAfter = Date.now()

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }

    expect(response.data.product.name).toBe('Build Your Breakfast')
    expect(response.data.product.basePrice).toBe(25_000)
    expect(response.data.groups).toHaveLength(5)
    expect(response.meta.stateVersion).toBe(0)

    const serverTime = Date.parse(response.meta.serverTime)
    expect(serverTime).toBeGreaterThanOrEqual(browserBefore + 90_000)
    expect(serverTime).toBeLessThanOrEqual(browserAfter + 90_000)
  })

  it('returns finite and explicit unlimited stock', async () => {
    const response = await apiClient.getStock()

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }

    expect(response.data.levels).toContainEqual({
      ingredientId: 'egg',
      availability: { type: 'finite', quantity: 10 },
    })
    expect(response.data.levels).toContainEqual({
      ingredientId: 'ketchup',
      availability: { type: 'unlimited' },
    })
    expect(response.data.levels).toContainEqual({
      ingredientId: 'chili',
      availability: { type: 'unlimited' },
    })
  })
})
