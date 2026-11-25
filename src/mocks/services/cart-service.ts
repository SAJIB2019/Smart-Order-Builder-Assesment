import { expireDueReservations } from '../../domain/cart/reservations'
import { priceCart } from '../../domain/pricing/price-cart'
import { validate } from '../../domain/rules/validate'
import {
  applyStockAllocation,
  applyStockAllocationChange,
  assertCartItemQuantity,
  calculateConfigurationRequirements,
  multiplyIngredientRequirements,
  releaseStockAllocation,
} from '../../domain/stock/stock-engine'
import type { ApiError } from '../../domain/types/api'
import type {
  ActiveReservation,
  AddCartItemRequest,
  CartItem,
  CartItemMutationResponse,
  CartSnapshot,
  EditCartItemRequest,
  ExpireReservationsResponse,
  RemoveCartItemResponse,
} from '../../domain/types/cart'
import type { StockSnapshot } from '../../domain/types/stock'
import type { ServerClock } from './server-clock'
import type { IdempotencyRecord, MockStoreState } from '../store/mock-store'
import type { MockStore } from '../store/mock-store'

const RESERVATION_LIFETIME_MS = 5 * 60 * 1_000

type CartOperation = 'add' | 'edit'

export interface CartFailureInjector {
  shouldFail(operation: CartOperation): boolean
}

export interface CartIdGenerator {
  cartItemId(): string
  reservationId(): string
}

export type CartServiceResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError }

export interface CartServiceOutcome<T> extends CartServiceResultMetadata {
  readonly result: CartServiceResult<T>
}

interface CartServiceResultMetadata {
  readonly serverTime: string
  readonly stateVersion: number
}

interface CartServiceDependencies {
  readonly store: MockStore
  readonly clock: ServerClock
  readonly ids?: CartIdGenerator
  readonly failures?: CartFailureInjector
}

const noFailures: CartFailureInjector = { shouldFail: () => false }

const randomIds: CartIdGenerator = {
  cartItemId: () => `cart-${createUuid()}`,
  reservationId: () => `reservation-${createUuid()}`,
}

export class CartService {
  private readonly store: MockStore
  private readonly clock: ServerClock
  private readonly ids: CartIdGenerator
  private readonly failures: CartFailureInjector

  constructor({
    store,
    clock,
    ids = randomIds,
    failures = noFailures,
  }: CartServiceDependencies) {
    this.store = store
    this.clock = clock
    this.ids = ids
    this.failures = failures
  }

  getCart(): Promise<CartServiceOutcome<CartSnapshot>> {
    return this.inTransaction((draft, serverTime) => ({
      ok: true,
      data: toCartSnapshot(draft, serverTime),
    }))
  }

  getInventory(): Promise<CartServiceOutcome<StockSnapshot>> {
    return this.inTransaction((draft) => ({ ok: true, data: draft.stock }))
  }

  addItem(
    request: AddCartItemRequest,
  ): Promise<CartServiceOutcome<CartItemMutationResponse>> {
    return this.inTransaction<CartItemMutationResponse>((draft, serverTime) => {
      if (request.idempotencyKey.trim().length === 0) {
        return validationError('An idempotency key is required')
      }

      const fingerprint = createAddFingerprint(request)
      const existingRecord = draft.idempotencyRecords.find(
        (record) => record.key === request.idempotencyKey,
      )

      if (existingRecord) {
        if (existingRecord.requestFingerprint !== fingerprint) {
          return {
            ok: false,
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Idempotency key was already used for another request',
            },
          }
        }

        return replayAdd(draft, existingRecord, serverTime)
      }

      const validation = validate(
        request.configuration,
        draft.menu.groups,
        draft.menu.rules,
      )
      if (!validation.isValid) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Configuration is invalid',
            details: { violations: validation.violations },
          },
        }
      }

      let allocation
      try {
        assertCartItemQuantity(request.quantity)
        allocation = multiplyIngredientRequirements(
          calculateConfigurationRequirements(
            request.configuration,
            draft.menu.groups,
          ),
          request.quantity,
        )
      } catch (error) {
        return validationError(errorMessage(error))
      }

      const stockResult = applyStockAllocation(draft.stock, allocation)
      if (stockResult.status === 'insufficientStock') {
        return shortageError(stockResult.shortages)
      }
      if (stockResult.status === 'invalidAllocation') {
        return internalError('Could not create a valid stock allocation')
      }
      if (this.failures.shouldFail('add')) {
        return transientError('Reservation failed before commit')
      }

      const itemId = this.ids.cartItemId()
      const reservationId = this.ids.reservationId()
      const item: CartItem = {
        id: itemId,
        configuration: request.configuration,
        quantity: request.quantity,
        reservationId,
      }
      const reservation: ActiveReservation = {
        id: reservationId,
        cartItemId: itemId,
        allocation,
        reservedAt: serverTime,
        status: 'active',
        expiresAt: new Date(
          Date.parse(serverTime) + RESERVATION_LIFETIME_MS,
        ).toISOString(),
      }
      const idempotencyRecord: IdempotencyRecord = {
        key: request.idempotencyKey,
        operation: 'addCartItem',
        requestFingerprint: fingerprint,
        cartItemId: item.id,
        reservationId: reservation.id,
      }

      draft.stock = stockResult.stock
      draft.cartItems = [...draft.cartItems, item]
      draft.reservations = [...draft.reservations, reservation]
      draft.idempotencyRecords = [
        ...draft.idempotencyRecords,
        idempotencyRecord,
      ]

      return {
        ok: true,
        data: {
          item,
          reservation,
          cart: toCartSnapshot(draft, serverTime),
          replayed: false,
        },
      }
    })
  }

  editItem(
    cartItemId: string,
    request: EditCartItemRequest,
  ): Promise<CartServiceOutcome<CartItemMutationResponse>> {
    return this.inTransaction<CartItemMutationResponse>((draft, serverTime) => {
      const itemIndex = draft.cartItems.findIndex(
        (item) => item.id === cartItemId,
      )
      const currentItem = draft.cartItems[itemIndex]
      if (!currentItem) return notFoundError('Cart item was not found')

      const reservationIndex = draft.reservations.findIndex(
        (reservation) => reservation.id === currentItem.reservationId,
      )
      const currentReservation = draft.reservations[reservationIndex]
      if (!currentReservation) {
        return internalError('Cart item reservation was not found')
      }
      if (currentReservation.status !== 'active') {
        return {
          ok: false,
          error: {
            code: 'RESERVATION_EXPIRED',
            cartItemId,
            message:
              'This reservation expired. Your changes were not saved; the original item is read-only.',
          },
        }
      }

      const validation = validate(
        request.configuration,
        draft.menu.groups,
        draft.menu.rules,
      )
      if (!validation.isValid) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Configuration is invalid',
            details: { violations: validation.violations },
          },
        }
      }

      let proposedAllocation
      try {
        assertCartItemQuantity(request.quantity)
        proposedAllocation = multiplyIngredientRequirements(
          calculateConfigurationRequirements(
            request.configuration,
            draft.menu.groups,
          ),
          request.quantity,
        )
      } catch (error) {
        return validationError(errorMessage(error))
      }

      const stockResult = applyStockAllocationChange(
        draft.stock,
        currentReservation.allocation,
        proposedAllocation,
      )
      if (stockResult.status === 'insufficientStock') {
        return shortageError(stockResult.shortages)
      }
      if (stockResult.status === 'invalidAllocation') {
        return internalError('Could not replace the stock allocation')
      }
      if (this.failures.shouldFail('edit')) {
        return transientError('Edit failed before commit')
      }

      const item: CartItem = {
        ...currentItem,
        configuration: request.configuration,
        quantity: request.quantity,
      }
      const reservation: ActiveReservation = {
        ...currentReservation,
        allocation: proposedAllocation,
      }
      const cartItems = [...draft.cartItems]
      const reservations = [...draft.reservations]
      cartItems[itemIndex] = item
      reservations[reservationIndex] = reservation
      draft.stock = stockResult.stock
      draft.cartItems = cartItems
      draft.reservations = reservations

      return {
        ok: true,
        data: {
          item,
          reservation,
          cart: toCartSnapshot(draft, serverTime),
          replayed: false,
        },
      }
    })
  }

  removeItem(
    cartItemId: string,
  ): Promise<CartServiceOutcome<RemoveCartItemResponse>> {
    return this.inTransaction<RemoveCartItemResponse>((draft, serverTime) => {
      const item = draft.cartItems.find(
        (candidate) => candidate.id === cartItemId,
      )
      if (!item) return notFoundError('Cart item was not found')

      const reservationIndex = draft.reservations.findIndex(
        (reservation) => reservation.id === item.reservationId,
      )
      const reservation = draft.reservations[reservationIndex]
      if (!reservation)
        return internalError('Cart item reservation was not found')

      if (reservation.status === 'active') {
        const release = releaseStockAllocation(
          draft.stock,
          reservation.allocation,
        )
        if (release.status !== 'applied') {
          return internalError('Could not release the cart item allocation')
        }
        const reservations = [...draft.reservations]
        reservations[reservationIndex] = {
          id: reservation.id,
          cartItemId: reservation.cartItemId,
          allocation: reservation.allocation,
          reservedAt: reservation.reservedAt,
          status: 'released',
          endedAt: serverTime,
        }
        draft.stock = release.stock
        draft.reservations = reservations
      }

      draft.cartItems = draft.cartItems.filter(
        (candidate) => candidate.id !== cartItemId,
      )

      return {
        ok: true,
        data: {
          removedCartItemId: cartItemId,
          cart: toCartSnapshot(draft, serverTime),
        },
      }
    })
  }

  expireReservations(): Promise<
    CartServiceOutcome<ExpireReservationsResponse>
  > {
    return this.inTransaction((draft, serverTime, expiredReservationIds) => ({
      ok: true,
      data: {
        expiredReservationIds,
        cart: toCartSnapshot(draft, serverTime),
      },
    }))
  }

  private async inTransaction<T>(
    operation: (
      draft: MockStoreState,
      serverTime: string,
      expiredReservationIds: readonly string[],
    ) => CartServiceResult<T>,
  ): Promise<CartServiceOutcome<T>> {
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
      return operation(draft, serverTime, expiration.expiredReservationIds)
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
            message: 'Cart changed concurrently',
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

function toCartSnapshot(
  state: MockStoreState,
  serverTime: string,
): CartSnapshot {
  const activeReservationIds = new Set(
    state.reservations
      .filter((reservation) => reservation.status === 'active')
      .map((reservation) => reservation.id),
  )
  const activeItems = state.cartItems.filter((item) =>
    activeReservationIds.has(item.reservationId),
  )

  return {
    items: state.cartItems,
    reservations: state.reservations,
    activePricing: priceCart(
      {
        items: activeItems,
        attemptedCouponCode: null,
      },
      state.menu,
      state.menu.promotions,
      serverTime,
    ),
  }
}

function replayAdd(
  state: MockStoreState,
  record: IdempotencyRecord,
  serverTime: string,
): CartServiceResult<CartItemMutationResponse> {
  const item = state.cartItems.find(
    (candidate) => candidate.id === record.cartItemId,
  )
  const reservation = state.reservations.find(
    (candidate) => candidate.id === record.reservationId,
  )
  if (!item || !reservation) {
    return internalError('Idempotency record target was not found')
  }

  return {
    ok: true,
    data: {
      item,
      reservation,
      cart: toCartSnapshot(state, serverTime),
      replayed: true,
    },
  }
}

function createAddFingerprint(request: AddCartItemRequest): string {
  return JSON.stringify({
    quantity: request.quantity,
    selections: Object.entries(request.configuration.selections).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  })
}

function shortageError(
  shortages: readonly {
    readonly ingredientId: string
    readonly missing: number
  }[],
): CartServiceResult<never> {
  return {
    ok: false,
    error: {
      code: 'INSUFFICIENT_STOCK',
      message: `Short: ${shortages
        .map(({ ingredientId, missing }) => `${missing} ${ingredientId}`)
        .join(', ')}`,
      shortages: shortages.map(({ ingredientId, missing }) => ({
        ingredientId,
        missingQuantity: missing,
      })),
    },
  }
}

function validationError(message: string): CartServiceResult<never> {
  return { ok: false, error: { code: 'VALIDATION_ERROR', message } }
}

function notFoundError(message: string): CartServiceResult<never> {
  return { ok: false, error: { code: 'NOT_FOUND', message } }
}

function transientError(message: string): CartServiceResult<never> {
  return {
    ok: false,
    error: { code: 'TRANSIENT_ERROR', message, retryable: true },
  }
}

function internalError(message: string): CartServiceResult<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message } }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid cart request'
}

function createUuid(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
