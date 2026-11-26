import { expireDueReservations } from '../../domain/cart/reservations'
import { createOrdersExport } from '../../domain/orders/export-orders'
import { priceSeedOrders } from '../../domain/orders/seed-orders'
import { createStoredOrder } from '../../domain/orders/stored-order'
import type { ApiError } from '../../domain/types/api'
import type {
  CheckoutRequest,
  CheckoutResponse,
  OrdersExport,
  OrdersSnapshot,
  PaymentMethod,
  SeedOrdersFile,
} from '../../domain/types/order'
import type { ServerClock } from './server-clock'
import type {
  CheckoutIdempotencyRecord,
  MockStoreState,
} from '../store/mock-store'
import type { MockStore } from '../store/mock-store'
import { createCartSnapshot } from './cart-service'

export interface CheckoutFailureInjector {
  shouldFailCheckout(): boolean
}

export interface OrderIdGenerator {
  orderId(): string
}

export type OrderServiceResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError }

export interface OrderServiceOutcome<T> {
  readonly serverTime: string
  readonly stateVersion: number
  readonly result: OrderServiceResult<T>
}

interface OrderServiceDependencies {
  readonly store: MockStore
  readonly clock: ServerClock
  readonly seedOrders: SeedOrdersFile
  readonly ids?: OrderIdGenerator
  readonly failures?: CheckoutFailureInjector
}

const noFailures: CheckoutFailureInjector = { shouldFailCheckout: () => false }
const randomIds: OrderIdGenerator = {
  orderId: () => `ORD-${createUuid()}`,
}

export class OrderService {
  private readonly store: MockStore
  private readonly clock: ServerClock
  private readonly seedOrders: SeedOrdersFile
  private readonly ids: OrderIdGenerator
  private readonly failures: CheckoutFailureInjector

  constructor({
    store,
    clock,
    seedOrders,
    ids = randomIds,
    failures = noFailures,
  }: OrderServiceDependencies) {
    this.store = store
    this.clock = clock
    this.seedOrders = seedOrders
    this.ids = ids
    this.failures = failures
  }

  getOrders(): Promise<OrderServiceOutcome<OrdersSnapshot>> {
    return this.inTransaction((draft) => ({
      ok: true,
      data: { orders: draft.orders },
    }))
  }

  getOrdersExport(): Promise<OrderServiceOutcome<OrdersExport>> {
    return this.inTransaction((draft) => ({
      ok: true,
      data: createOrdersExport(draft.orders),
    }))
  }

  checkout(
    request: CheckoutRequest,
  ): Promise<OrderServiceOutcome<CheckoutResponse>> {
    return this.inTransaction((draft, serverTime) => {
      const requestError = validateCheckoutRequest(request)
      if (requestError) return requestError

      const fingerprint = createCheckoutFingerprint(request)
      const existingRecord = draft.idempotencyRecords.find(
        (record): record is CheckoutIdempotencyRecord =>
          record.key === request.idempotencyKey &&
          record.operation === 'checkout',
      )
      if (existingRecord) {
        if (existingRecord.requestFingerprint !== fingerprint) {
          return idempotencyConflict()
        }
        return replayCheckout(draft, existingRecord, serverTime)
      }

      const versionConflict = cartVersionConflict(request.cartVersion, draft)
      if (versionConflict) return versionConflict

      const activeReservationIds = new Set(
        draft.reservations
          .filter((reservation) => reservation.status === 'active')
          .map(({ id }) => id),
      )
      const activeItems = draft.cartItems.filter((item) =>
        activeReservationIds.has(item.reservationId),
      )
      if (activeItems.length === 0) {
        return {
          ok: false,
          error: { code: 'EMPTY_CART', message: 'Cart has no active items' },
        }
      }

      const orderId = this.ids.orderId()
      if (draft.orders.some(({ id }) => id === orderId)) {
        return internalError('Generated order ID already exists')
      }
      const order = createStoredOrder({
        id: orderId,
        createdAt: serverTime,
        paymentMethod: request.paymentMethod,
        attemptedCouponCode: request.attemptedCouponCode,
        menu: draft.menu,
        lines: activeItems.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          configuration: item.configuration,
        })),
      })
      if (this.failures.shouldFailCheckout()) {
        return transientError('Payment failed before commit')
      }

      const soldReservationIds = new Set(
        activeItems.map(({ reservationId }) => reservationId),
      )
      draft.reservations = draft.reservations.map((reservation) =>
        soldReservationIds.has(reservation.id) &&
        reservation.status === 'active'
          ? {
              id: reservation.id,
              cartItemId: reservation.cartItemId,
              allocation: reservation.allocation,
              reservedAt: reservation.reservedAt,
              status: 'convertedToSale' as const,
              endedAt: serverTime,
            }
          : reservation,
      )
      draft.cartItems = []
      draft.orders = [...draft.orders, order]
      draft.idempotencyRecords = [
        ...draft.idempotencyRecords,
        {
          key: request.idempotencyKey,
          operation: 'checkout',
          requestFingerprint: fingerprint,
          orderId: order.id,
        },
      ]
      draft.cartVersion += 1

      return {
        ok: true,
        data: {
          order,
          cart: createCartSnapshot(draft, serverTime),
          replayed: false,
        },
      }
    })
  }

  private async inTransaction<T>(
    operation: (
      draft: MockStoreState,
      serverTime: string,
    ) => OrderServiceResult<T>,
  ): Promise<OrderServiceOutcome<T>> {
    let transactionServerTime: string | undefined
    const transaction = await this.store.transact((draft) => {
      const serverTime = this.clock.nowIso()
      transactionServerTime = serverTime
      const expiration = expireDueReservations(
        draft.stock,
        draft.reservations,
        serverTime,
      )
      draft.stock = expiration.stock
      draft.reservations = expiration.reservations
      if (expiration.expiredReservationIds.length > 0) draft.cartVersion += 1
      initializeSeedOrders(draft, this.seedOrders)
      return operation(draft, serverTime)
    })
    const serverTime = transactionServerTime ?? this.clock.nowIso()

    if (transaction.status === 'versionConflict') {
      return {
        serverTime,
        stateVersion: transaction.currentVersion,
        result: {
          ok: false,
          error: {
            code: 'CONFLICT',
            currentVersion: transaction.currentVersion,
            message: 'Orders changed concurrently',
          },
        },
      }
    }

    return {
      serverTime,
      stateVersion: transaction.version,
      result: transaction.value,
    }
  }
}

function initializeSeedOrders(
  draft: MockStoreState,
  seedFile: SeedOrdersFile,
): void {
  if (draft.seedOrdersSchemaVersion === seedFile.schemaVersion) return

  const pricedSeeds = priceSeedOrders(seedFile, draft.menu)
  const existingIds = new Set(draft.orders.map(({ id }) => id))
  const missingSeeds = pricedSeeds.filter(({ id }) => !existingIds.has(id))
  draft.orders = [...missingSeeds, ...draft.orders]
  draft.seedOrdersSchemaVersion = seedFile.schemaVersion
}

function replayCheckout(
  draft: MockStoreState,
  record: CheckoutIdempotencyRecord,
  serverTime: string,
): OrderServiceResult<CheckoutResponse> {
  const order = draft.orders.find(({ id }) => id === record.orderId)
  if (!order) return internalError('Checkout idempotency target was not found')

  return {
    ok: true,
    data: {
      order,
      cart: createCartSnapshot(draft, serverTime),
      replayed: true,
    },
  }
}

function validateCheckoutRequest(
  request: CheckoutRequest,
): OrderServiceResult<never> | null {
  if (request.idempotencyKey.trim().length === 0) {
    return validationError('An idempotency key is required')
  }
  if (!Number.isSafeInteger(request.cartVersion) || request.cartVersion < 0) {
    return validationError('Cart version must be a non-negative integer')
  }
  if (!isPaymentMethod(request.paymentMethod)) {
    return validationError('Payment method must be card, bkash, or cash')
  }
  if (
    request.attemptedCouponCode !== null &&
    typeof request.attemptedCouponCode !== 'string'
  ) {
    return validationError('Coupon code must be a string or null')
  }
  return null
}

function cartVersionConflict(
  expectedVersion: number,
  draft: MockStoreState,
): OrderServiceResult<never> | null {
  if (expectedVersion === draft.cartVersion) return null
  return {
    ok: false,
    error: {
      code: 'CONFLICT',
      currentVersion: draft.cartVersion,
      message: 'Cart changed concurrently; reload the authoritative cart',
    },
  }
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'card' || value === 'bkash' || value === 'cash'
}

function createCheckoutFingerprint(request: CheckoutRequest): string {
  return JSON.stringify({
    paymentMethod: request.paymentMethod,
    attemptedCouponCode: request.attemptedCouponCode,
  })
}

function validationError(message: string): OrderServiceResult<never> {
  return { ok: false, error: { code: 'VALIDATION_ERROR', message } }
}

function idempotencyConflict(): OrderServiceResult<never> {
  return {
    ok: false,
    error: {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Idempotency key was already used for another request',
    },
  }
}

function transientError(message: string): OrderServiceResult<never> {
  return {
    ok: false,
    error: { code: 'TRANSIENT_ERROR', message, retryable: true },
  }
}

function internalError(message: string): OrderServiceResult<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message } }
}

function createUuid(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
