import { describe, expect, it, vi } from 'vitest'

import { startBrowserMockServer } from '../../../src/mocks/start-browser-mock-server'

describe('browser mock-server startup', () => {
  it('starts the browser API with a base-aware service-worker URL', async () => {
    const start = vi.fn().mockResolvedValue(undefined)
    const loadWorker = vi.fn().mockResolvedValue({ worker: { start } })

    await startBrowserMockServer(loadWorker, '/smart-order-builder/')

    expect(loadWorker).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledWith({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/smart-order-builder/mockServiceWorker.js',
      },
    })
  })
})
