import { http, HttpResponse, type RequestHandler } from 'msw'

import type { ApiResponse } from '../../domain/types/api'
import type { Menu } from '../../domain/types/menu'
import type { StockSnapshot } from '../../domain/types/stock'
import type { ServerClock } from '../services/server-clock'
import type { MockStore } from '../store/mock-store'

interface MockApiDependencies {
  readonly store: MockStore
  readonly clock: ServerClock
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
  ]
}
