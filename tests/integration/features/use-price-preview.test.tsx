import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { priceCart } from '../../../src/domain/pricing/price-cart'
import type { ApiError } from '../../../src/domain/types/api'
import type { Configuration } from '../../../src/domain/types/menu'
import type {
  PriceableCart,
  PricePreviewRequest,
  PricePreviewResponse,
} from '../../../src/domain/types/pricing'
import { OrderBuilderPreview } from '../../../src/features/order-builder/OrderBuilderPreview'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../../src/hooks/use-price-preview'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'

const menu = buildYourBreakfastFixture.menu

afterEach(() => {
  vi.useRealTimers()
})

describe('usePricePreview', () => {
  it('debounces configuration changes for exactly 300 ms', async () => {
    vi.useFakeTimers()
    const client = immediateClient()
    const { rerender } = renderHook(
      ({ cart }) => usePricePreview({ cart, client }),
      { initialProps: { cart: cartFor(configurationA()) } },
    )

    await act(async () => vi.advanceTimersByTime(299))
    expect(client.requests).toHaveLength(0)

    rerender({ cart: cartFor(configurationB()) })
    await act(async () => vi.advanceTimersByTime(299))
    expect(client.requests).toHaveLength(0)
    await act(async () => vi.advanceTimersByTime(1))

    expect(client.requests).toHaveLength(1)
    expect(client.requests[0]?.request.cart).toEqual(cartFor(configurationB()))
  })

  it('keeps a newer result when an older ignored-cancellation response arrives later', async () => {
    vi.useFakeTimers()
    const client = deferredClient()
    const { result, rerender } = renderHook(
      ({ cart }) => usePricePreview({ cart, client }),
      { initialProps: { cart: cartFor(configurationA()) } },
    )

    await act(async () => vi.advanceTimersByTime(300))
    rerender({ cart: cartFor(configurationB()) })
    expect(result.current.previewFreshness).toBe('none')
    await act(async () => vi.advanceTimersByTime(300))

    const newer = client.requests[1]
    const older = client.requests[0]
    if (!newer || !older) throw new Error('Expected two preview requests')

    await act(async () => newer.resolve(successFor(newer.request)))
    expect(result.current.pricing?.lines[0]?.unitPrice).toBe(67_950)
    expect(result.current.previewFreshness).toBe('current')

    await act(async () => older.resolve(successFor(older.request)))
    expect(result.current.pricing?.lines[0]?.unitPrice).toBe(67_950)
    expect(result.current.requestStatus).toBe('success')
  })

  it('marks the last successful preview stale as soon as configuration changes', async () => {
    vi.useFakeTimers()
    const client = immediateClient()
    const { result, rerender } = renderHook(
      ({ cart }) => usePricePreview({ cart, client }),
      { initialProps: { cart: cartFor(configurationA()) } },
    )

    await act(async () => vi.advanceTimersByTime(300))
    expect(result.current.previewFreshness).toBe('current')

    rerender({ cart: cartFor(configurationB()) })
    expect(result.current.previewFreshness).toBe('stale')
    expect(result.current.requestStatus).toBe('debouncing')
  })

  it('aborts the superseded request while still relying on identity checks', async () => {
    vi.useFakeTimers()
    const client = deferredClient()
    const { rerender } = renderHook(
      ({ cart }) => usePricePreview({ cart, client }),
      { initialProps: { cart: cartFor(configurationA()) } },
    )

    await act(async () => vi.advanceTimersByTime(300))
    const first = client.requests[0]
    if (!first) throw new Error('Expected first preview request')
    expect(first.signal.aborted).toBe(false)

    rerender({ cart: cartFor(configurationB()) })
    expect(first.signal.aborted).toBe(true)
  })

  it('reports failure and retries the unchanged configuration immediately', async () => {
    vi.useFakeTimers()
    const client = deferredClient()
    const cart = cartFor(configurationA())
    const { result } = renderHook(() => usePricePreview({ cart, client }))

    await act(async () => vi.advanceTimersByTime(300))
    const first = client.requests[0]
    if (!first) throw new Error('Expected first preview request')
    await act(async () => first.resolve(transientFailure()))

    expect(result.current.requestStatus).toBe('error')
    expect(result.current.error).toEqual({
      message: 'Preview failed',
      retryable: true,
      cause: 'api',
    })

    act(() => result.current.retry())
    await act(async () => vi.advanceTimersByTime(0))
    const retry = client.requests[1]
    if (!retry) throw new Error('Expected retry request')
    expect(retry.request.cart).toEqual(cart)
    await act(async () => retry.resolve(successFor(retry.request)))
    expect(result.current.requestStatus).toBe('success')
  })

  it('keeps component configuration after failure and offers Retry', async () => {
    vi.useFakeTimers()
    const client = deferredClient()
    const menuClient = {
      getMenu: async () => ({
        ok: true as const,
        data: menu,
        meta: { serverTime: new Date(0).toISOString(), stateVersion: 0 },
      }),
    }
    render(<OrderBuilderPreview menuClient={menuClient} priceClient={client} />)
    await act(async () => Promise.resolve())

    const toast = screen.getByRole('spinbutton', { name: 'Toast quantity' })
    act(() => {
      toast.focus()
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set?.call(toast, '1')
      toast.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(toast).toHaveValue(1)

    await act(async () => vi.advanceTimersByTime(300))
    const request = client.requests.at(-1)
    if (!request) throw new Error('Expected price request')
    await act(async () => request.resolve(transientFailure()))

    expect(toast).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(
      screen.getByText('Your current selections are still here.'),
    ).toBeInTheDocument()
  })

  it('cleans up both pending debounce timers and active requests on unmount', async () => {
    vi.useFakeTimers()
    const beforeStart = deferredClient()
    const first = renderHook(() =>
      usePricePreview({ cart: cartFor(configurationA()), client: beforeStart }),
    )
    first.unmount()
    await act(async () => vi.advanceTimersByTime(300))
    expect(beforeStart.requests).toHaveLength(0)

    const afterStart = deferredClient()
    const second = renderHook(() =>
      usePricePreview({ cart: cartFor(configurationA()), client: afterStart }),
    )
    await act(async () => vi.advanceTimersByTime(300))
    const active = afterStart.requests[0]
    if (!active) throw new Error('Expected active request')
    second.unmount()
    expect(active.signal.aborted).toBe(true)

    await act(async () => active.resolve(successFor(active.request)))
  })
})

interface DeferredRequest {
  readonly request: PricePreviewRequest
  readonly signal: AbortSignal
  readonly resolve: (
    value:
      | { readonly ok: true; readonly data: PricePreviewResponse }
      | { readonly ok: false; readonly error: ApiError },
  ) => void
}

function deferredClient(): PricePreviewClient & {
  readonly requests: DeferredRequest[]
} {
  const requests: DeferredRequest[] = []
  return {
    requests,
    previewPrice(request, signal) {
      return new Promise((resolve) => {
        requests.push({
          request,
          signal: signal ?? new AbortController().signal,
          resolve,
        })
      })
    },
  }
}

function immediateClient(): PricePreviewClient & {
  readonly requests: DeferredRequest[]
} {
  const requests: DeferredRequest[] = []
  return {
    requests,
    async previewPrice(request, signal) {
      requests.push({
        request,
        signal: signal ?? new AbortController().signal,
        resolve: () => undefined,
      })
      return successFor(request)
    },
  }
}

function successFor(request: PricePreviewRequest) {
  return {
    ok: true as const,
    data: {
      requestId: request.requestId,
      pricing: priceCart(
        request.cart,
        menu,
        menu.promotions,
        '2026-11-25T12:00:00+06:00',
      ),
    },
  }
}

function transientFailure() {
  return {
    ok: false as const,
    error: {
      code: 'TRANSIENT_ERROR' as const,
      message: 'Preview failed',
      retryable: true as const,
    },
  }
}

function cartFor(configuration: Configuration): PriceableCart {
  return {
    items: [{ id: 'preview', configuration, quantity: 1 }],
    attemptedCouponCode: null,
  }
}

function configurationA(): Configuration {
  return {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
}

function configurationB(): Configuration {
  return {
    selections: {
      croissant: 1,
      omelette: 2,
      fried: 2,
      sausage: 1,
      bacon: 1,
      hashbrown: 1,
      mushroom: 1,
      hollandaise: 1,
    },
  }
}
