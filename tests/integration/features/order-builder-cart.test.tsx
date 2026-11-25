import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { priceCart } from '../../../src/domain/pricing/price-cart'
import type { AddCartItemRequest } from '../../../src/domain/types/cart'
import { OrderBuilderPreview } from '../../../src/features/order-builder/OrderBuilderPreview'
import type { PricePreviewClient } from '../../../src/hooks/use-price-preview'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'
import type { ApiClient } from '../../../src/services/api/api-client'

const menu = buildYourBreakfastFixture.menu
const serverTime = '2026-11-25T10:01:30.000Z'

describe('order builder cart integration', () => {
  it('uses one generated idempotency key for rapid repeated Add to Cart clicks', async () => {
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

    expect(requests).toHaveLength(3)
    expect(
      new Set(requests.map(({ idempotencyKey }) => idempotencyKey)),
    ).toEqual(new Set(['logical-add-1']))
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1)
  })
})

function emptyCart() {
  return {
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
