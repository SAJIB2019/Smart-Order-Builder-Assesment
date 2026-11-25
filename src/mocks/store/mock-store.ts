import type { CartItem, Reservation } from '../../domain/types/cart'
import type { Menu } from '../../domain/types/menu'
import type { Order } from '../../domain/types/order'
import type { StockSnapshot } from '../../domain/types/stock'

export interface IdempotencyRecord {
  readonly key: string
  readonly operation: 'addCartItem'
  readonly requestFingerprint: string
  readonly cartItemId: string
  readonly reservationId: string
}

export interface MockStoreState {
  version: number
  menu: Menu
  stock: StockSnapshot
  cartItems: readonly CartItem[]
  reservations: readonly Reservation[]
  orders: readonly Order[]
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
