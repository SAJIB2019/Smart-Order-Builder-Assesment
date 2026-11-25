import type { MockApiFixture } from '../fixtures/mock-api-fixture'
import type {
  MockStore,
  MockStoreState,
  StoreTransactionResult,
} from './mock-store'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createInMemoryMockStore(fixture: MockApiFixture): MockStore {
  let state: MockStoreState = {
    version: 0,
    menu: clone(fixture.menu),
    stock: clone(fixture.stock),
    cartItems: [],
    reservations: [],
    orders: [],
  }
  const listeners = new Set<(snapshot: MockStoreState) => void>()

  return {
    capabilities: {
      transactionScope: 'singleContext',
      crossTabCoordination: false,
      persistence: 'memory',
    },
    async getSnapshot() {
      return clone(state)
    },
    async transact<T>(
      operation: (draft: MockStoreState) => T,
      options?: { readonly expectedVersion?: number },
    ): Promise<StoreTransactionResult<T>> {
      if (
        options?.expectedVersion !== undefined &&
        options.expectedVersion !== state.version
      ) {
        return {
          status: 'versionConflict',
          currentVersion: state.version,
        }
      }

      const draft = clone(state)
      const value = operation(draft)
      draft.version = state.version + 1
      state = draft

      const snapshot = clone(state)
      listeners.forEach((listener) => listener(snapshot))

      return { status: 'committed', value, version: state.version }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
