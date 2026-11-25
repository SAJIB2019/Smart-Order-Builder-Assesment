export interface ApiMeta {
  readonly serverTime: string
  readonly stateVersion: number
}

interface BaseApiError {
  readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}

export interface ValidationApiError extends BaseApiError {
  readonly code: 'VALIDATION_ERROR'
}

export interface NotFoundApiError extends BaseApiError {
  readonly code: 'NOT_FOUND'
}

export interface ConflictApiError extends BaseApiError {
  readonly code: 'CONFLICT'
  readonly currentVersion: number
}

export interface IdempotencyConflictApiError extends BaseApiError {
  readonly code: 'IDEMPOTENCY_CONFLICT'
}

export interface ReservationExpiredApiError extends BaseApiError {
  readonly code: 'RESERVATION_EXPIRED'
  readonly cartItemId: string
}

export interface EmptyCartApiError extends BaseApiError {
  readonly code: 'EMPTY_CART'
}

export interface InsufficientStockApiError extends BaseApiError {
  readonly code: 'INSUFFICIENT_STOCK'
  readonly shortages: readonly {
    readonly ingredientId: string
    readonly missingQuantity: number
  }[]
}

export interface TransientApiError extends BaseApiError {
  readonly code: 'TRANSIENT_ERROR'
  readonly retryable: true
}

export interface InternalApiError extends BaseApiError {
  readonly code: 'INTERNAL_ERROR'
}

export type ApiError =
  | ValidationApiError
  | NotFoundApiError
  | ConflictApiError
  | IdempotencyConflictApiError
  | ReservationExpiredApiError
  | EmptyCartApiError
  | InsufficientStockApiError
  | TransientApiError
  | InternalApiError

export interface ApiSuccess<T> {
  readonly ok: true
  readonly data: T
  readonly meta: ApiMeta
}

export interface ApiFailure {
  readonly ok: false
  readonly error: ApiError
  readonly meta: ApiMeta
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
