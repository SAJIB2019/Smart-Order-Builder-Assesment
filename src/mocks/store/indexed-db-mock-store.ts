import type { MockApiFixture } from '../fixtures/mock-api-fixture'
import {
  cloneStoreValue,
  createInitialMockStoreState,
} from './create-initial-state'
import type {
  MockStore,
  MockStoreState,
  StoreTransactionResult,
} from './mock-store'

const DATABASE_VERSION = 1
const STATE_STORE = 'authoritative-state'
const STATE_KEY = 'current'

interface IndexedDbMockStoreOptions {
  readonly indexedDb?: IDBFactory
  readonly databaseName?: string
  readonly broadcastChannelName?: string | null
}

/**
 * Same-origin cross-tab store. A single-record read/write transaction is the
 * lock and commit boundary; BroadcastChannel only announces committed changes.
 */
export function createIndexedDbMockStore(
  fixture: MockApiFixture,
  {
    indexedDb = globalThis.indexedDB,
    databaseName = 'smart-order-builder-mock-server-v1',
    broadcastChannelName = `${databaseName}-changes`,
  }: IndexedDbMockStoreOptions = {},
): MockStore {
  const listeners = new Set<(snapshot: MockStoreState) => void>()
  const databasePromise = openDatabase(indexedDb, databaseName)
  const channel = broadcastChannelName
    ? createChangeChannel(broadcastChannelName)
    : null

  const readSnapshot = async (): Promise<MockStoreState> => {
    const database = await databasePromise
    const existing = await readState(database)

    if (existing) return normalizePersistedState(existing)

    return initializeState(database, fixture)
  }

  channel?.addEventListener('message', () => {
    void readSnapshot().then((snapshot) => {
      listeners.forEach((listener) => listener(snapshot))
    })
  })

  return {
    capabilities: {
      transactionScope: 'crossContext',
      crossTabCoordination: true,
      persistence: 'persistent',
    },
    getSnapshot: readSnapshot,
    async transact<T>(
      operation: (draft: MockStoreState) => T,
      options?: { readonly expectedVersion?: number },
    ): Promise<StoreTransactionResult<T>> {
      const database = await databasePromise
      const result = await transactState(
        database,
        fixture,
        operation,
        options?.expectedVersion,
      )

      if (result.status === 'committed') {
        const snapshot = await readSnapshot()
        listeners.forEach((listener) => listener(snapshot))
        channel?.postMessage({ version: result.version })
      }

      return result
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async dispose() {
      channel?.close()
      const database = await databasePromise
      database.close()
    },
  }
}

function openDatabase(
  indexedDb: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STATE_STORE)) {
        request.result.createObjectStore(STATE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'))
  })
}

function readState(database: IDBDatabase): Promise<MockStoreState | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, 'readonly')
    const request = transaction.objectStore(STATE_STORE).get(STATE_KEY)

    request.onsuccess = () =>
      resolve(request.result as MockStoreState | undefined)
    request.onerror = () =>
      reject(request.error ?? new Error('State read failed'))
  })
}

function initializeState(
  database: IDBDatabase,
  fixture: MockApiFixture,
): Promise<MockStoreState> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, 'readwrite')
    const store = transaction.objectStore(STATE_STORE)
    const request = store.get(STATE_KEY)
    let state: MockStoreState | undefined

    request.onsuccess = () => {
      state =
        (request.result as MockStoreState | undefined) ??
        createInitialMockStoreState(fixture)
      if (request.result === undefined) store.put(state, STATE_KEY)
    }
    transaction.oncomplete = () =>
      resolve(cloneStoreValue(requiredState(state)))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('State initialization failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('State initialization aborted'))
  })
}

function transactState<T>(
  database: IDBDatabase,
  fixture: MockApiFixture,
  operation: (draft: MockStoreState) => T,
  expectedVersion: number | undefined,
): Promise<StoreTransactionResult<T>> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, 'readwrite')
    const store = transaction.objectStore(STATE_STORE)
    const request = store.get(STATE_KEY)
    let outcome: StoreTransactionResult<T> | undefined
    let operationError: unknown

    request.onsuccess = () => {
      const stored = request.result as MockStoreState | undefined
      const current = stored
        ? normalizePersistedState(stored)
        : createInitialMockStoreState(fixture)

      if (
        expectedVersion !== undefined &&
        expectedVersion !== current.version
      ) {
        outcome = {
          status: 'versionConflict',
          currentVersion: current.version,
        }
        return
      }

      const draft = cloneStoreValue(current)

      try {
        const value = operation(draft)
        draft.version = current.version + 1
        outcome = { status: 'committed', value, version: draft.version }
        store.put(draft, STATE_KEY)
      } catch (error) {
        operationError = error
        transaction.abort()
      }
    }
    request.onerror = () => {
      operationError =
        request.error ?? new Error('State transaction read failed')
      transaction.abort()
    }
    transaction.oncomplete = () => resolve(requiredOutcome(outcome))
    transaction.onerror = () => {
      if (operationError) return
      reject(transaction.error ?? new Error('State transaction failed'))
    }
    transaction.onabort = () =>
      reject(
        operationError ??
          transaction.error ??
          new Error('State transaction aborted'),
      )
  })
}

function requiredState(state: MockStoreState | undefined): MockStoreState {
  if (!state) throw new Error('IndexedDB state was not initialized')
  return state
}

function normalizePersistedState(state: MockStoreState): MockStoreState {
  const persisted = state as MockStoreState & { cartVersion?: unknown }
  return {
    ...cloneStoreValue(state),
    cartVersion:
      typeof persisted.cartVersion === 'number' &&
      Number.isSafeInteger(persisted.cartVersion) &&
      persisted.cartVersion >= 0
        ? persisted.cartVersion
        : 0,
  }
}

function requiredOutcome<T>(
  outcome: StoreTransactionResult<T> | undefined,
): StoreTransactionResult<T> {
  if (!outcome) throw new Error('IndexedDB transaction produced no outcome')
  return outcome
}

function createChangeChannel(name: string): BroadcastChannel | null {
  return typeof globalThis.BroadcastChannel === 'function'
    ? new globalThis.BroadcastChannel(name)
    : null
}
