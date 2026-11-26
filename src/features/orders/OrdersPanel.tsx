import { useEffect, useState } from 'react'

import type { StoredOrder } from '../../domain/types/order'
import { ApiClient } from '../../services/api/api-client'
import {
  formatBdt,
  formatDateTime,
  formatPaymentMethod,
} from '../../utils/formatters'

const browserApiClient = new ApiClient()

interface OrdersPanelProps {
  readonly refreshKey: number
  readonly client?: Pick<ApiClient, 'getOrders'>
}

export function OrdersPanel({
  refreshKey,
  client = browserApiClient,
}: OrdersPanelProps) {
  const [orders, setOrders] = useState<readonly StoredOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    void client
      .getOrders()
      .then((response) => {
        if (ignore) return
        if (response.ok) {
          setOrders(response.data.orders)
          setError(null)
        } else setError(response.error.message)
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(
            caught instanceof Error ? caught.message : 'Unable to load orders',
          )
        }
      })
    return () => {
      ignore = true
    }
  }, [client, refreshKey])

  return (
    <section
      className="panel orders-panel"
      id="orders"
      aria-labelledby="orders-title"
    >
      <div className="section-heading">
        <div>
          <p className="section-kicker">History</p>
          <h2 id="orders-title">Orders</h2>
          <p>
            Historical and newly completed orders, priced at their server
            timestamps.
          </p>
        </div>
        <span className="count-badge">{orders?.length ?? '—'} orders</span>
      </div>

      {error ? (
        <p className="alert error-alert" role="alert">
          {error}
        </p>
      ) : null}
      {!orders && !error ? <OrderListSkeleton /> : null}
      {orders?.length === 0 ? (
        <div className="empty-state">
          <p>No completed orders yet.</p>
        </div>
      ) : null}
      {orders ? (
        <div className="orders-list">
          {[...orders].reverse().map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card-heading">
                <div>
                  <strong>{order.id}</strong>
                  <time dateTime={order.createdAt}>
                    {formatDateTime(order.createdAt)}
                  </time>
                </div>
                <strong className="order-total">
                  {formatBdt(order.pricing.payable)}
                </strong>
              </div>
              <div className="order-meta">
                <span>{formatPaymentMethod(order.paymentMethod)}</span>
                <span>
                  {order.lines.length}{' '}
                  {order.lines.length === 1 ? 'item' : 'items'}
                </span>
                <span>
                  {order.coupon.applied
                    ? `Coupon ${order.coupon.attemptedCode} applied`
                    : 'No coupon discount'}
                </span>
              </div>
              <details>
                <summary>View configured items</summary>
                <ul className="order-lines">
                  {order.lines.map((line) => (
                    <li key={line.id}>
                      <span>
                        {line.quantity}× {line.product.name}
                      </span>
                      <small>
                        {line.selections
                          .map(
                            (selection) =>
                              `${selection.optionName} ×${selection.quantity}`,
                          )
                          .join(', ')}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function OrderListSkeleton() {
  return (
    <div className="orders-list" aria-label="Loading orders" role="status">
      {[1, 2, 3].map((value) => (
        <div className="skeleton order-skeleton" key={value} />
      ))}
    </div>
  )
}
