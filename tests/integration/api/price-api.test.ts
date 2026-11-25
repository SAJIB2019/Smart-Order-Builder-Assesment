import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import type { ApiResponse } from '../../../src/domain/types/api'
import type { PricePreviewResponse } from '../../../src/domain/types/pricing'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { createApiHandlers } from '../../../src/mocks/handlers/create-api-handlers'
import { ServerClock } from '../../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'
import { server } from '../../../src/mocks/server'
import { ApiClient } from '../../../src/services/api/api-client'

const apiClient = new ApiClient({ baseUrl: 'http://localhost' })

describe('POST /price', () => {
  it('uses the shared pure pricing engine and echoes the request identity', async () => {
    server.use(
      ...createApiHandlers({
        store: createInMemoryMockStore(buildYourBreakfastFixture),
        clock: new ServerClock(
          { now: () => Date.parse('2026-11-25T04:59:59.000Z') },
          0,
        ),
        priceSimulation: {
          latencyMs: () => 0,
          shouldFail: () => false,
        },
      }),
    )

    const response = await apiClient.previewPrice({
      requestId: 'request-B',
      cart: {
        items: [
          {
            id: 'B',
            quantity: 1,
            configuration: {
              selections: {
                croissant: 1,
                omelette: 2,
                fried: 2,
                sausage: 1,
                bacon: 1,
                hashbrown: 1,
                mushroom: 1,
                hollandaise: 1,
              },
            },
          },
        ],
        attemptedCouponCode: null,
      },
    })

    expect(response.ok).toBe(true)
    if (!response.ok) throw new Error(response.error.message)
    expect(response.data.requestId).toBe('request-B')
    expect(response.data.pricing.lines[0]?.unitPrice).toBe(67_950)
    expect(response.data.pricing.serverTime).toBe('2026-11-25T04:59:59.000Z')
  })

  it('returns an injectable retryable transient failure', async () => {
    server.use(
      ...createApiHandlers({
        store: createInMemoryMockStore(buildYourBreakfastFixture),
        clock: new ServerClock({ now: () => 0 }, 0),
        priceSimulation: {
          latencyMs: () => 0,
          shouldFail: () => true,
        },
      }),
    )

    const response = await apiClient.previewPrice({
      requestId: 'failure',
      cart: { items: [], attemptedCouponCode: null },
    })

    expect(response).toEqual(
      expect.objectContaining({
        ok: false,
        error: {
          code: 'TRANSIENT_ERROR',
          message: 'Price preview is temporarily unavailable',
          retryable: true,
        },
      }),
    )
  })

  it('keeps the API client signal connected to fetch cancellation', async () => {
    server.use(
      http.post('*/price', async () => {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 100))
        return HttpResponse.json<ApiResponse<PricePreviewResponse>>({
          ok: false,
          error: {
            code: 'TRANSIENT_ERROR',
            message: 'Too late',
            retryable: true,
          },
          meta: { serverTime: new Date(0).toISOString(), stateVersion: 0 },
        })
      }),
    )
    const controller = new AbortController()
    const request = apiClient.previewPrice(
      {
        requestId: 'abort-me',
        cart: { items: [], attemptedCouponCode: null },
      },
      controller.signal,
    )

    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
