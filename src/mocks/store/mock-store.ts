import type { CartItem, Reservation } from '../../domain/types/cart'
import type { Menu } from '../../domain/types/menu'
import type { StoredOrder } from '../../domain/types/order'
import type { StockSnapshot } from '../../domain/types/stock'

export interface AddCartItemIdempotencyRecord {
  readonly key: string
  readonly operation: 'addCartItem'
  readonly requestFingerprint: string
  readonly cartItemId: string
  readonly reservationId: string
}

export interface CheckoutIdempotencyRecord {
  readonly key: string
  readonly operation: 'checkout'
  readonly requestFingerprint: string
  readonly orderId: string
}

export type IdempotencyRecord =
  AddCartItemIdempotencyRecord | CheckoutIdempotencyRecord

export interface MockStoreState {
  version: number
  menu: Menu
  stock: StockSnapshot
  cartItems: readonly CartItem[]
  reservations: readonly Reservation[]
  orders: readonly StoredOrder[]
  seedOrdersSchemaVersion: number | null
  idempotencyRecords: readonly IdempotencyRecord[]
}

export interface MockStoreCapabilities {
  readonly transactionScope: 'singleContext' | 'crossContext'
  readonly crossTabCoordination: boolean
  readonly persistence: 'memory' | 'persistent'
}

export type StoreTransactionResult<T> =
  | {
      readonly status: 'committed'
      readonly value: T
      readonly version: number
    }
  | { readonly status: 'versionConflict'; readonly currentVersion: number }

export interface MockStore {
  readonly capabilities: MockStoreCapabilities
  getSnapshot(): Promise<MockStoreState>
  transact<T>(
    operation: (draft: MockStoreState) => T,
    options?: { readonly expectedVersion?: number },
  ): Promise<StoreTransactionResult<T>>
  subscribe(listener: (snapshot: MockStoreState) => void): () => void
  dispose?(): Promise<void>
}
