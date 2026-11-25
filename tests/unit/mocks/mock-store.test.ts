import { describe, expect, it } from 'vitest'

import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import { createInMemoryMockStore } from '../../../src/mocks/store/in-memory-mock-store'

describe('in-memory mock store', () => {
  it('makes its single-context limitations explicit', () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)

    expect(store.capabilities).toEqual({
      transactionScope: 'singleContext',
      crossTabCoordination: false,
      persistence: 'memory',
    })
  })

  it('commits against an expected version and rejects a stale version', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)

    const committed = await store.transact(
      (draft) => {
        draft.cartItems = []
        return 'updated'
      },
      { expectedVersion: 0 },
    )
    const conflict = await store.transact(() => 'stale', {
      expectedVersion: 0,
    })

    expect(committed).toEqual({
      status: 'committed',
      value: 'updated',
      version: 1,
    })
    expect(conflict).toEqual({
      status: 'versionConflict',
      currentVersion: 1,
    })
  })

  it('leaves state unchanged when a transaction throws', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)

    await expect(
      store.transact((draft) => {
        draft.stock = { levels: [] }
        throw new Error('abort')
      }),
    ).rejects.toThrow('abort')

    const snapshot = await store.getSnapshot()
    expect(snapshot.version).toBe(0)
    expect(snapshot.stock).toEqual(buildYourBreakfastFixture.stock)
  })

  it('does not imply that separate contexts share in-memory state', async () => {
    const firstContext = createInMemoryMockStore(buildYourBreakfastFixture)
    const secondContext = createInMemoryMockStore(buildYourBreakfastFixture)

    await firstContext.transact(() => 'first-context-only')

    expect((await firstContext.getSnapshot()).version).toBe(1)
    expect((await secondContext.getSnapshot()).version).toBe(0)
  })
})
