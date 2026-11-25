import { buildYourBreakfastFixture } from '../fixtures/build-your-breakfast'
import { ServerClock } from '../services/server-clock'
import { createInMemoryMockStore } from '../store/in-memory-mock-store'
import { createIndexedDbMockStore } from '../store/indexed-db-mock-store'
import { createApiHandlers } from './create-api-handlers'

export const mockStore =
  typeof globalThis.indexedDB === 'undefined'
    ? createInMemoryMockStore(buildYourBreakfastFixture)
    : createIndexedDbMockStore(buildYourBreakfastFixture)
export const serverClock = new ServerClock()

export const handlers = createApiHandlers({
  store: mockStore,
  clock: serverClock,
})
