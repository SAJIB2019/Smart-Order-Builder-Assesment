import { useEffect, useRef, useState } from 'react'

import { PricingSummary } from '../../components/PricingSummary'
import { serializeOrdersExport } from '../../domain/orders/export-orders'
import type { CartSnapshot } from '../../domain/types/cart'
import type { PaymentMethod } from '../../domain/types/order'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../hooks/use-price-preview'
import { ApiClient } from '../../services/api/api-client'
import { formatBdt } from '../../utils/formatters'

const browserApiClient = new ApiClient()

export interface OrdersDownload {
  readonly filename: string
  readonly content: string
  readonly mimeType: string
}

interface CheckoutPanelProps {
  readonly cart: CartSnapshot
  readonly client?: Pick<
    ApiClient,
    'checkout' | 'getOrders' | 'getOrdersExport'
  >
  readonly priceClient?: PricePreviewClient
  readonly createIdempotencyKey?: () => string
  readonly downloadFile?: (download: OrdersDownload) => void
  readonly onCartChanged: (cart: CartSnapshot, serverTime: string) => void
  readonly onVersionConflict?: () => Promise<void>
  readonly onOrderCreated?: () => void
}

export function CheckoutPanel({
  cart,
  client = browserApiClient,
  priceClient = browserApiClient,
  createIdempotencyKey = defaultIdempotencyKey,
  downloadFile = downloadInBrowser,
  onCartChanged,
  onVersionConflict,
  onOrderCreated,
}: CheckoutPanelProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [couponCode, setCouponCode] = useState('')
  const [orderCount, setOrderCount] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [downloadPending, setDownloadPending] = useState(false)
  const payOperationRef = useRef<{
    readonly fingerprint: string
    readonly idempotencyKey: string
  } | null>(null)
  const activeReservationIds = new Set(
    cart.reservations
      .filter((reservation) => reservation.status === 'active')
      .map(({ id }) => id),
  )
  const activeItemCount = cart.items.filter((item) =>
    activeReservationIds.has(item.reservationId),
  ).length
  const activeItems = cart.items.filter((item) =>
    activeReservationIds.has(item.reservationId),
  )
  const checkoutPreview = usePricePreview({
    cart: {
      items: activeItems,
      attemptedCouponCode: couponCode.trim() || null,
    },
    client: priceClient,
  })
  const displayedPricing =
    checkoutPreview.previewFreshness === 'current' && checkoutPreview.pricing
      ? checkoutPreview.pricing
      : cart.activePricing

  useEffect(() => {
    let ignore = false
    void client.getOrders().then((response) => {
      if (ignore) return
      if (response.ok) setOrderCount(response.data.orders.length)
      else setError(response.error.message)
    })
    return () => {
      ignore = true
    }
  }, [client])

  const pay = async () => {
    const attemptedCouponCode = couponCode.trim() || null
    const fingerprint = JSON.stringify({ paymentMethod, attemptedCouponCode })
    if (payOperationRef.current?.fingerprint !== fingerprint) {
      payOperationRef.current = {
        fingerprint,
        idempotencyKey: createIdempotencyKey(),
      }
    }
    const operation = payOperationRef.current
    setPending(true)
    setError(null)

    try {
      const response = await client.checkout({
        cartVersion: cart.version,
        idempotencyKey: operation.idempotencyKey,
        paymentMethod,
        attemptedCouponCode,
      })
      if (response.ok) {
        onCartChanged(response.data.cart, response.meta.serverTime)
        setLastOrderId(response.data.order.id)
        if (!response.data.replayed) {
          setOrderCount((current) => (current === null ? null : current + 1))
          onOrderCreated?.()
        }
        if (payOperationRef.current === operation) {
          payOperationRef.current = null
        }
      } else if (
        response.error.code === 'CONFLICT' &&
        payOperationRef.current === operation
      ) {
        await onVersionConflict?.()
        setError(
          'Cart changed in another tab. The latest cart was loaded; review and retry.',
        )
      } else if (payOperationRef.current === operation) {
        setError(response.error.message)
      }
    } catch (caught) {
      if (payOperationRef.current === operation) {
        setError(caught instanceof Error ? caught.message : 'Payment failed')
      }
    } finally {
      setPending(false)
    }
  }

  const downloadOrders = async () => {
    setError(null)
    setDownloadPending(true)
    try {
      const response = await client.getOrdersExport()
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      downloadFile({
        filename: 'orders.json',
        content: serializeOrdersExport(response.data),
        mimeType: 'application/json',
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed')
    } finally {
      setDownloadPending(false)
    }
  }

  return (
    <section
      className="checkout-panel"
      id="checkout"
      aria-labelledby="checkout-title"
    >
      <div className="section-heading compact-heading">
        <div>
          <p className="section-kicker">Complete order</p>
          <h3 id="checkout-title">Checkout</h3>
          <p>Choose a payment label. No payment data is collected.</p>
        </div>
        <strong className="checkout-total">
          {formatBdt(displayedPricing.payable)}
        </strong>
      </div>
      <fieldset className="payment-methods">
        <legend>Payment method</legend>
        {[
          ['card', 'Card'],
          ['bkash', 'bKash'],
          ['cash', 'Cash'],
        ].map(([value, label]) => (
          <label className="payment-option" key={value}>
            <input
              checked={paymentMethod === value}
              name="paymentMethod"
              type="radio"
              value={value}
              onChange={(event) =>
                setPaymentMethod(event.target.value as PaymentMethod)
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="field-label">
        Coupon code
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value)}
          placeholder="Optional code"
        />
      </label>
      {activeItemCount > 0 ? (
        <PricingSummary pricing={displayedPricing} title="Cart total" />
      ) : null}
      {checkoutPreview.requestStatus === 'error' ? (
        <div className="inline-alert" role="alert">
          <span>
            {checkoutPreview.error?.message ?? 'Could not update total.'}
          </span>
          <button type="button" onClick={checkoutPreview.retry}>
            Retry total
          </button>
        </div>
      ) : null}
      <div className="checkout-actions">
        <button
          aria-label="Pay"
          className="primary-action"
          type="button"
          disabled={activeItemCount === 0 || pending}
          onClick={() => void pay()}
        >
          {pending
            ? 'Processing…'
            : `Pay ${formatBdt(displayedPricing.payable)}`}
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={downloadPending}
          onClick={() => void downloadOrders()}
        >
          {downloadPending ? 'Preparing…' : 'Download orders.json'}
        </button>
      </div>
      {pending ? <p role="status">Processing payment…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void pay()}>
            Retry Pay
          </button>
        </div>
      ) : null}
      {lastOrderId ? (
        <p className="alert success-alert" role="status">
          Order created successfully: {lastOrderId}
        </p>
      ) : null}
      <p className="muted-copy">Stored orders: {orderCount ?? 'Loading…'}</p>
    </section>
  )
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}

function downloadInBrowser({
  filename,
  content,
  mimeType,
}: OrdersDownload): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
