import type { MockApiFixture } from '../fixtures/mock-api-fixture'
import type { MockStoreState } from './mock-store'

export function cloneStoreValue<T>(value: T): T {
  return structuredClone(value)
}

export function createInitialMockStoreState(
  fixture: MockApiFixture,
): MockStoreState {
  return {
    version: 0,
    cartVersion: 0,
    menu: cloneStoreValue(fixture.menu),
    stock: cloneStoreValue(fixture.stock),
    cartItems: [],
    reservations: [],
    orders: [],
    seedOrdersSchemaVersion: null,
    idempotencyRecords: [],
  }
}
