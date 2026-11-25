import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import type { ApiResponse } from '../../domain/types/api'
import type { Menu } from '../../domain/types/menu'
import { priceCart } from '../../domain/pricing/price-cart'
import type {
  PricePreviewRequest,
  PricePreviewResponse,
} from '../../domain/types/pricing'
import type { StockSnapshot } from '../../domain/types/stock'
import {
  createPricePreviewSimulation,
  type PricePreviewSimulation,
} from '../services/price-preview-simulation'
import type { ServerClock } from '../services/server-clock'
import type { MockStore } from '../store/mock-store'

interface MockApiDependencies {
  readonly store: MockStore
  readonly clock: ServerClock
  readonly priceSimulation?: PricePreviewSimulation
}

function success<T>(
  data: T,
  serverTime: string,
  stateVersion: number,
): ApiResponse<T> {
  return {
    ok: true,
    data,
    meta: { serverTime, stateVersion },
  }
}

export function createApiHandlers({
  store,
  clock,
  priceSimulation = createPricePreviewSimulation(),
}: MockApiDependencies): RequestHandler[] {
  return [
    http.get('*/api/menu', async () => {
      const snapshot = await store.getSnapshot()

      return HttpResponse.json<ApiResponse<Menu>>(
        success(snapshot.menu, clock.nowIso(), snapshot.version),
      )
    }),
    http.get('*/api/stock', async () => {
      const snapshot = await store.getSnapshot()

      return HttpResponse.json<ApiResponse<StockSnapshot>>(
        success(snapshot.stock, clock.nowIso(), snapshot.version),
      )
    }),
    http.post('*/price', async ({ request }) => {
      const body = (await request.json()) as PricePreviewRequest
      await delay(priceSimulation.latencyMs(body))
      const snapshot = await store.getSnapshot()
      const serverTime = clock.nowIso()

      if (priceSimulation.shouldFail(body)) {
        return HttpResponse.json<ApiResponse<never>>(
          {
            ok: false,
            error: {
              code: 'TRANSIENT_ERROR',
              message: 'Price preview is temporarily unavailable',
              retryable: true,
            },
            meta: { serverTime, stateVersion: snapshot.version },
          },
          { status: 503 },
        )
      }

      try {
        const pricing = priceCart(
          body.cart,
          snapshot.menu,
          snapshot.menu.promotions,
          serverTime,
        )

        return HttpResponse.json<ApiResponse<PricePreviewResponse>>(
          success(
            { requestId: body.requestId, pricing },
            serverTime,
            snapshot.version,
          ),
        )
      } catch (error) {
        return HttpResponse.json<ApiResponse<never>>(
          {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message:
                error instanceof Error
                  ? error.message
                  : 'Invalid price request',
            },
            meta: { serverTime, stateVersion: snapshot.version },
          },
          { status: 400 },
        )
      }
    }),
  ]
}
