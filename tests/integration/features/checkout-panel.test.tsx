import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { priceSeedOrders } from '../../../src/domain/orders/seed-orders'
import { priceCart } from '../../../src/domain/pricing/price-cart'
import type { ApiResponse } from '../../../src/domain/types/api'
import type { CartSnapshot } from '../../../src/domain/types/cart'
import type {
  CheckoutResponse,
  OrdersExport,
  OrdersSnapshot,
} from '../../../src/domain/types/order'
import { CheckoutPanel } from '../../../src/features/checkout/CheckoutPanel'
import type { PricePreviewClient } from '../../../src/hooks/use-price-preview'
import { buildYourBreakfastFixture } from '../../../src/mocks/fixtures/build-your-breakfast'

const serverTime = '2026-11-25T10:01:30.000Z'
const meta = { serverTime, stateVersion: 1 }

describe('checkout panel', () => {
  it('uses label-only payment methods and reuses the Pay key on Retry', async () => {
    const cart = activeCart()
    const checkedOutCart = emptyCart()
    const order = historicalOrders()[0]
    if (!order) throw new Error('Expected seed order')
    const checkout = vi
      .fn()
      .mockResolvedValueOnce(
        failure<CheckoutResponse>('Payment failed before commit'),
      )
      .mockResolvedValueOnce(
        success<CheckoutResponse>({
          order,
          cart: checkedOutCart,
          replayed: false,
        }),
      )
    const onCartChanged = vi.fn()

    render(
      <CheckoutPanel
        cart={cart}
        client={{
          checkout,
          getOrders: vi
            .fn()
            .mockResolvedValue(
              success<OrdersSnapshot>({ orders: historicalOrders() }),
            ),
          getOrdersExport: vi.fn(),
        }}
        priceClient={deterministicPriceClient()}
        createIdempotencyKey={() => 'one-pay-key'}
        onCartChanged={onCartChanged}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Card' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'bKash' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Cash' })).toBeInTheDocument()
    expect(
      screen.getByText('No payment data is collected.', { exact: false }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'bKash' }))
    fireEvent.change(screen.getByLabelText('Coupon code'), {
      target: { value: 'MORNING15' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment failed before commit',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry Pay' }))

    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2))
    expect(checkout.mock.calls[0]?.[0]).toEqual({
      idempotencyKey: 'one-pay-key',
      paymentMethod: 'bkash',
      attemptedCouponCode: 'MORNING15',
    })
    expect(checkout.mock.calls[1]?.[0]).toEqual(checkout.mock.calls[0]?.[0])
    expect(onCartChanged).toHaveBeenCalledWith(checkedOutCart, serverTime)
  })

  it('downloads all orders as valid orders.json', async () => {
    const orders = historicalOrders()
    const exportValue: OrdersExport = {
      schemaVersion: 1,
      currency: 'BDT',
      moneyUnit: 'poisha',
      orders,
    }
    const downloadFile = vi.fn()

    render(
      <CheckoutPanel
        cart={emptyCart()}
        client={{
          checkout: vi.fn(),
          getOrders: vi
            .fn()
            .mockResolvedValue(success<OrdersSnapshot>({ orders })),
          getOrdersExport: vi
            .fn()
            .mockResolvedValue(success<OrdersExport>(exportValue)),
        }}
        priceClient={deterministicPriceClient()}
        downloadFile={downloadFile}
        onCartChanged={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Download orders.json' }),
    )
    await waitFor(() => expect(downloadFile).toHaveBeenCalledOnce())
    const download = downloadFile.mock.calls[0]?.[0]
    expect(download.filename).toBe('orders.json')
    expect(download.mimeType).toBe('application/json')
    expect(JSON.parse(download.content)).toEqual(exportValue)
  })
})

function historicalOrders() {
  return priceSeedOrders(
    buildYourBreakfastFixture.seedOrders,
    buildYourBreakfastFixture.menu,
  )
}

function activeCart(): CartSnapshot {
  const configuration = {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
  return {
    items: [
      {
        id: 'cart-1',
        configuration,
        quantity: 1,
        reservationId: 'reservation-1',
      },
    ],
    reservations: [
      {
        id: 'reservation-1',
        cartItemId: 'cart-1',
        allocation: [],
        reservedAt: serverTime,
        status: 'active',
        expiresAt: '2026-11-25T10:06:30.000Z',
      },
    ],
    activePricing: priceCart(
      {
        items: [{ id: 'cart-1', configuration, quantity: 1 }],
        attemptedCouponCode: null,
      },
      buildYourBreakfastFixture.menu,
      buildYourBreakfastFixture.menu.promotions,
      serverTime,
    ),
  }
}

function emptyCart(): CartSnapshot {
  return {
    items: [],
    reservations: [],
    activePricing: priceCart(
      { items: [], attemptedCouponCode: null },
      buildYourBreakfastFixture.menu,
      buildYourBreakfastFixture.menu.promotions,
      serverTime,
    ),
  }
}

function success<T>(data: T): ApiResponse<T> {
  return { ok: true, data, meta }
}

function failure<T>(message: string): ApiResponse<T> {
  return {
    ok: false,
    error: { code: 'TRANSIENT_ERROR', message, retryable: true },
    meta,
  }
}

function deterministicPriceClient(): PricePreviewClient {
  return {
    async previewPrice(request) {
      return {
        ok: true,
        data: {
          requestId: request.requestId,
          pricing: priceCart(
            request.cart,
            buildYourBreakfastFixture.menu,
            buildYourBreakfastFixture.menu.promotions,
            serverTime,
          ),
        },
      }
    },
  }
}
