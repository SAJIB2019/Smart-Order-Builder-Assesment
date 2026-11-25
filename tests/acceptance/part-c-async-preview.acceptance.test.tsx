import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { priceCart } from '../../src/domain/pricing/price-cart'
import type { Configuration } from '../../src/domain/types/menu'
import type {
  PriceableCart,
  PricePreviewRequest,
  PricePreviewResponse,
} from '../../src/domain/types/pricing'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../src/hooks/use-price-preview'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'

afterEach(() => vi.useRealTimers())

describe('Part C asynchronous preview acceptance', () => {
  it("TC-12 displays only the latest configuration's price when responses return out of order", async () => {
    vi.useFakeTimers()
    const pending: Array<{
      request: PricePreviewRequest
      resolve: (value: { ok: true; data: PricePreviewResponse }) => void
    }> = []
    const client: PricePreviewClient = {
      previewPrice(request) {
        return new Promise((resolve) => pending.push({ request, resolve }))
      },
    }
    const { result, rerender } = renderHook(
      ({ cart }) => usePricePreview({ cart, client }),
      { initialProps: { cart: cartFor(configurationA()) } },
    )

    await act(async () => vi.advanceTimersByTime(300))
    rerender({ cart: cartFor(configurationB()) })
    expect(displayedUnitPrice(result.current)).toBeNull()
    await act(async () => vi.advanceTimersByTime(300))

    const older = pending[0]
    const newer = pending[1]
    if (!older || !newer) throw new Error('Expected two pricing responses')

    await act(async () => newer.resolve(success(newer.request)))
    expect(displayedUnitPrice(result.current)).toBe(67_950)

    await act(async () => older.resolve(success(older.request)))
    expect(displayedUnitPrice(result.current)).toBe(67_950)
  })
})

function displayedUnitPrice(
  preview: ReturnType<typeof usePricePreview>,
): number | null {
  if (preview.previewFreshness !== 'current') return null
  return preview.pricing?.lines[0]?.unitPrice ?? null
}

function success(request: PricePreviewRequest) {
  const menu = buildYourBreakfastFixture.menu
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
