import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { priceCart } from '../../../src/domain/pricing/price-cart'
import type { AddCartItemRequest } from '../../../src/domain/types/cart'
import { OrderBuilderPreview } from '../../../src/features/order-builder/OrderBuilderPreview'
import type { PricePreviewClient } from '../../../src/hooks/use-price-preview'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import type { ApiClient } from '../../../src/services/api/api-client'
import type { ConfigurationDraftRepository } from '../../../src/services/drafts/configuration-draft'

const menu = buildYourBreakfastFixture.menu
const serverTime = '2026-11-25T10:01:30.000Z'

describe('order builder cart integration', () => {
  it('TC-13 blocks rapid repeated Add to Cart clicks after one logical request', async () => {
    const requests: AddCartItemRequest[] = []
    const createIdempotencyKey = vi.fn(() => 'logical-add-1')
    const cartClient: Pick<
      ApiClient,
      'getCart' | 'addCartItem' | 'removeCartItem' | 'expireReservations'
    > = {
      async getCart() {
        return {
          ok: true,
          data: emptyCart(),
          meta: { serverTime, stateVersion: 0 },
        }
      },
      addCartItem(request) {
        requests.push(request)
        return new Promise(() => undefined)
      },
      async removeCartItem() {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Not used' },
          meta: { serverTime, stateVersion: 0 },
        }
      },
      async expireReservations() {
        return {
          ok: true,
          data: { expiredReservationIds: [], cart: emptyCart() },
          meta: { serverTime, stateVersion: 0 },
        }
      },
    }
    const priceClient: PricePreviewClient = {
      async previewPrice(request) {
        return {
          ok: true,
          data: {
            requestId: request.requestId,
            pricing: priceCart(request.cart, menu, menu.promotions, serverTime),
          },
        }
      },
    }

    render(
      <OrderBuilderPreview
        menuClient={{
          getMenu: async () => ({
            ok: true,
            data: menu,
            meta: { serverTime, stateVersion: 0 },
          }),
        }}
        priceClient={priceClient}
        cartClient={cartClient}
        createIdempotencyKey={createIdempotencyKey}
      />,
    )

    await screen.findByRole('spinbutton', { name: 'Toast quantity' })
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Toast quantity' }),
      {
        target: { value: '1' },
      },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Scrambled quantity' }),
      { target: { value: '2' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Chicken Sausage quantity' }),
      { target: { value: '1' } },
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Ketchup quantity' }),
      { target: { value: '1' } },
    )

    const addButton = screen.getByRole('button', { name: 'Add to cart' })
    await waitFor(() => expect(addButton).toBeEnabled())
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    expect(requests).toHaveLength(1)
    expect(
      new Set(requests.map(({ idempotencyKey }) => idempotencyKey)),
    ).toEqual(new Set(['logical-add-1']))
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1)
    expect(addButton).toBeDisabled()
  })

  it('restores an unfinished configuration after refresh without reserving stock', async () => {
    let serializedDraft: ReturnType<ConfigurationDraftRepository['load']> = null
    const draftRepository: ConfigurationDraftRepository = {
      load: () => structuredClone(serializedDraft),
      save: (draft) => {
        serializedDraft = structuredClone(draft)
      },
      clear: () => {
        serializedDraft = null
      },
    }
    const addCartItem = vi.fn()
    const cartClient = {
      getCart: vi.fn(async () => ({
        ok: true as const,
        data: emptyCart(),
        meta: { serverTime, stateVersion: 0 },
      })),
      getInventory: vi.fn(async () => ({
        ok: true as const,
        data: buildYourBreakfastFixture.stock,
        meta: { serverTime, stateVersion: 0 },
      })),
      addCartItem,
      removeCartItem: vi.fn(),
      expireReservations: vi.fn(),
    }
    const view = render(
      <OrderBuilderPreview
        menuClient={menuClient()}
        priceClient={deterministicPriceClient()}
        cartClient={cartClient}
        draftRepository={draftRepository}
      />,
    )

    const toast = await screen.findByRole('spinbutton', {
      name: 'Toast quantity',
    })
    fireEvent.change(toast, { target: { value: '1' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Increase item quantity' }),
    )
    await waitFor(() =>
      expect(serializedDraft).toEqual(
        expect.objectContaining({
          configuration: { selections: { toast: 1 } },
          itemQuantity: 2,
        }),
      ),
    )
    view.unmount()

    render(
      <OrderBuilderPreview
        menuClient={menuClient()}
        priceClient={deterministicPriceClient()}
        cartClient={cartClient}
        draftRepository={draftRepository}
      />,
    )

    const restoredToast = await screen.findByRole('spinbutton', {
      name: 'Toast quantity',
    })
    await waitFor(() => expect(restoredToast).toHaveValue(1))
    expect(
      screen.getByRole('spinbutton', { name: 'Item quantity' }),
    ).toHaveValue(2)
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    expect(addCartItem).not.toHaveBeenCalled()
  })

  it('reloads the authoritative cart after a stale-version response', async () => {
    const authoritative = cartWithConfigurationA()
    const getCart = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: emptyCart(),
        meta: { serverTime, stateVersion: 0 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: authoritative,
        meta: { serverTime, stateVersion: 2 },
      })
    const addCartItem = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'CONFLICT' as const,
        message: 'Cart changed concurrently; reload the authoritative cart',
        currentVersion: 1,
      },
      meta: { serverTime, stateVersion: 2 },
    }))

    render(
      <OrderBuilderPreview
        menuClient={menuClient()}
        priceClient={deterministicPriceClient()}
        cartClient={{
          getCart,
          getInventory: vi.fn(async () => ({
            ok: true as const,
            data: buildYourBreakfastFixture.stock,
            meta: { serverTime, stateVersion: 0 },
          })),
          addCartItem,
          removeCartItem: vi.fn(),
          expireReservations: vi.fn(),
        }}
        draftRepository={emptyDraftRepository()}
      />,
    )

    await configureA()
    const addButton = screen.getByRole('button', { name: 'Add to cart' })
    await waitFor(() => expect(addButton).toBeEnabled())
    fireEvent.click(addButton)

    expect(
      await screen.findByText(
        'Cart changed in another tab. The latest cart was loaded; review and retry.',
      ),
    ).toBeInTheDocument()
    expect(getCart).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1 items')).toBeInTheDocument()
    expect(screen.getByText('Toast ×1')).toBeInTheDocument()
  })
})

function emptyCart() {
  return {
    version: 0,
    items: [],
    reservations: [],
    activePricing: priceCart(
      { items: [], attemptedCouponCode: null },
      menu,
      menu.promotions,
      serverTime,
    ),
  }
}

function menuClient() {
  return {
    getMenu: async () => ({
      ok: true as const,
      data: menu,
      meta: { serverTime, stateVersion: 0 },
    }),
  }
}

function deterministicPriceClient(): PricePreviewClient {
  return {
    async previewPrice(request) {
      return {
        ok: true,
        data: {
          requestId: request.requestId,
          pricing: priceCart(request.cart, menu, menu.promotions, serverTime),
        },
      }
    },
  }
}

async function configureA(): Promise<void> {
  await screen.findByRole('spinbutton', { name: 'Toast quantity' })
  for (const [name, value] of [
    ['Toast quantity', '1'],
    ['Scrambled quantity', '2'],
    ['Chicken Sausage quantity', '1'],
    ['Ketchup quantity', '1'],
  ] as const) {
    fireEvent.change(screen.getByRole('spinbutton', { name }), {
      target: { value },
    })
  }
}

function cartWithConfigurationA() {
  const configuration = {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
  return {
    version: 1,
    items: [
      {
        id: 'authoritative-item',
        configuration,
        quantity: 1,
        reservationId: 'authoritative-reservation',
      },
    ],
    reservations: [
      {
        id: 'authoritative-reservation',
        cartItemId: 'authoritative-item',
        allocation: [],
        reservedAt: serverTime,
        status: 'active' as const,
        expiresAt: '2099-11-25T10:06:30.000Z',
      },
    ],
    activePricing: priceCart(
      {
        items: [{ id: 'authoritative-item', configuration, quantity: 1 }],
        attemptedCouponCode: null,
      },
      menu,
      menu.promotions,
      serverTime,
    ),
  }
}

function emptyDraftRepository(): ConfigurationDraftRepository {
  return { load: () => null, save: () => undefined, clear: () => undefined }
}
