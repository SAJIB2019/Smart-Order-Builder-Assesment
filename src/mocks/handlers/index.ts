import { buildYourBreakfastFixture } from '../fixtures/build-your-breakfast'
import { ServerClock } from '../services/server-clock'
import { createInMemoryMockStore } from '../store/in-memory-mock-store'
import { createApiHandlers } from './create-api-handlers'

export const mockStore = createInMemoryMockStore(buildYourBreakfastFixture)
export const serverClock = new ServerClock()

export const handlers = createApiHandlers({
  store: mockStore,
  clock: serverClock,
})
