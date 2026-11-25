import { useEffect, useRef, useState } from 'react'

import { serializeOrdersExport } from '../../domain/orders/export-orders'
import type { CartSnapshot } from '../../domain/types/cart'
import type { PaymentMethod } from '../../domain/types/order'
import { ApiClient } from '../../services/api/api-client'

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
  readonly createIdempotencyKey?: () => string
  readonly downloadFile?: (download: OrdersDownload) => void
  readonly onCartChanged: (cart: CartSnapshot, serverTime: string) => void
}

export function CheckoutPanel({
  cart,
  client = browserApiClient,
  createIdempotencyKey = defaultIdempotencyKey,
  downloadFile = downloadInBrowser,
  onCartChanged,
}: CheckoutPanelProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [couponCode, setCouponCode] = useState('')
  const [orderCount, setOrderCount] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
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
        idempotencyKey: operation.idempotencyKey,
        paymentMethod,
        attemptedCouponCode,
      })
      if (response.ok) {
        onCartChanged(response.data.cart, response.meta.serverTime)
        setLastOrderId(response.data.order.id)
        if (!response.data.replayed) {
          setOrderCount((current) => (current === null ? null : current + 1))
        }
        if (payOperationRef.current === operation) {
          payOperationRef.current = null
        }
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
    }
  }

  return (
    <section className="checkout-panel" aria-labelledby="checkout-title">
      <div>
        <h3 id="checkout-title">Checkout</h3>
        <p>Payment methods are labels only. No payment data is collected.</p>
      </div>
      <label>
        Payment method
        <select
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as PaymentMethod)
          }
        >
          <option value="card">card</option>
          <option value="bkash">bkash</option>
          <option value="cash">cash</option>
        </select>
      </label>
      <label>
        Coupon code
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value)}
          placeholder="Optional"
        />
      </label>
      <div className="checkout-actions">
        <button
          className="primary-action"
          type="button"
          disabled={activeItemCount === 0 || pending}
          onClick={() => void pay()}
        >
          Pay
        </button>
        <button type="button" onClick={() => void downloadOrders()}>
          Download orders.json
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
      {lastOrderId ? <p>Order created: {lastOrderId}</p> : null}
      <p>Stored orders: {orderCount ?? 'Loading…'}</p>
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
