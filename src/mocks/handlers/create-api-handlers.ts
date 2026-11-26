import { delay, http, HttpResponse, type RequestHandler } from 'msw'

import type { ApiResponse } from '../../domain/types/api'
import type {
  AddCartItemRequest,
  EditCartItemRequest,
  RemoveCartItemRequest,
} from '../../domain/types/cart'
import type { Menu } from '../../domain/types/menu'
import type { CheckoutRequest, SeedOrdersFile } from '../../domain/types/order'
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
import { CartService, type CartServiceOutcome } from '../services/cart-service'
import { OrderService } from '../services/order-service'
import type { ServerClock } from '../services/server-clock'
import type { MockStore } from '../store/mock-store'

interface MockApiDependencies {
  readonly store: MockStore
  readonly clock: ServerClock
  readonly priceSimulation?: PricePreviewSimulation
  readonly cartService?: CartService
  readonly seedOrders: SeedOrdersFile
  readonly orderService?: OrderService
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
  cartService = new CartService({ store, clock }),
  seedOrders,
  orderService = new OrderService({ store, clock, seedOrders }),
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
    http.get('*/api/cart', async () =>
      cartApiResponse(await cartService.getCart()),
    ),
    http.post('*/api/cart/items', async ({ request }) =>
      cartApiResponse(
        await cartService.addItem((await request.json()) as AddCartItemRequest),
        201,
      ),
    ),
    http.put('*/api/cart/items/:cartItemId', async ({ params, request }) =>
      cartApiResponse(
        await cartService.editItem(
          String(params.cartItemId),
          (await request.json()) as EditCartItemRequest,
        ),
      ),
    ),
    http.delete('*/api/cart/items/:cartItemId', async ({ params, request }) =>
      cartApiResponse(
        await cartService.removeItem(
          String(params.cartItemId),
          (await request.json()) as RemoveCartItemRequest,
        ),
      ),
    ),
    http.get('*/api/inventory', async () =>
      cartApiResponse(await cartService.getInventory()),
    ),
    http.post('*/api/reservations/expire', async () =>
      cartApiResponse(await cartService.expireReservations()),
    ),
    http.get('*/api/orders', async () =>
      cartApiResponse(await orderService.getOrders()),
    ),
    http.get('*/api/orders/export', async () =>
      cartApiResponse(await orderService.getOrdersExport()),
    ),
    http.post('*/api/checkout', async ({ request }) =>
      cartApiResponse(
        await orderService.checkout((await request.json()) as CheckoutRequest),
        201,
      ),
    ),
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

function cartApiResponse<T>(
  outcome: CartServiceOutcome<T>,
  successStatus = 200,
) {
  if (outcome.result.ok) {
    return HttpResponse.json<ApiResponse<T>>(
      success(outcome.result.data, outcome.serverTime, outcome.stateVersion),
      { status: successStatus },
    )
  }

  return HttpResponse.json<ApiResponse<never>>(
    {
      ok: false,
      error: outcome.result.error,
      meta: {
        serverTime: outcome.serverTime,
        stateVersion: outcome.stateVersion,
      },
    },
    { status: errorStatus(outcome.result.error.code) },
  )
}

function errorStatus(code: string): number {
  if (code === 'VALIDATION_ERROR') return 400
  if (code === 'NOT_FOUND') return 404
  if (code === 'INSUFFICIENT_STOCK') return 409
  if (code === 'EMPTY_CART') return 409
  if (
    code === 'CONFLICT' ||
    code === 'IDEMPOTENCY_CONFLICT' ||
    code === 'RESERVATION_EXPIRED'
  ) {
    return 409
  }
  if (code === 'TRANSIENT_ERROR') return 503
  return 500
}
