import { useEffect, useMemo, useRef, useState } from 'react'

import { validate } from '../../domain/rules/validate'
import type {
  CartItem,
  CartSnapshot,
  Reservation,
} from '../../domain/types/cart'
import type { Configuration, Menu } from '../../domain/types/menu'
import type { PriceableCart } from '../../domain/types/pricing'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../hooks/use-price-preview'
import { useReservationCountdown } from '../../hooks/use-reservation-countdown'
import { ApiClient } from '../../services/api/api-client'
import { CheckoutPanel } from '../checkout/CheckoutPanel'

const browserApiClient = new ApiClient()

interface OrderBuilderPreviewProps {
  readonly menuClient?: Pick<ApiClient, 'getMenu'>
  readonly priceClient?: PricePreviewClient
  readonly cartClient?: Pick<
    ApiClient,
    'getCart' | 'addCartItem' | 'removeCartItem' | 'expireReservations'
  >
  readonly createIdempotencyKey?: () => string
}

export function OrderBuilderPreview({
  menuClient = browserApiClient,
  priceClient = browserApiClient,
  cartClient = browserApiClient,
  createIdempotencyKey = defaultIdempotencyKey,
}: OrderBuilderPreviewProps) {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [configuration, setConfiguration] = useState<Configuration>({
    selections: {},
  })
  const [cartSnapshot, setCartSnapshot] = useState<CartSnapshot | null>(null)
  const [cartServerTime, setCartServerTime] = useState<string | null>(null)
  const [cartError, setCartError] = useState<string | null>(null)
  const [addPending, setAddPending] = useState(false)
  const [canRetryAdd, setCanRetryAdd] = useState(false)
  const addOperationRef = useRef<{
    readonly fingerprint: string
    readonly idempotencyKey: string
  } | null>(null)
  const cart = useMemo<PriceableCart>(
    () => ({
      items: [{ id: 'builder-preview', configuration, quantity: 1 }],
      attemptedCouponCode: null,
    }),
    [configuration],
  )
  const preview = usePricePreview({ cart, client: priceClient })
  const validation = menu
    ? validate(configuration, menu.groups, menu.rules)
    : null

  useEffect(() => {
    let ignore = false

    void menuClient
      .getMenu()
      .then((response) => {
        if (ignore) return
        if (response.ok) {
          setMenu(response.data)
          setMenuError(null)
        } else {
          setMenuError(response.error.message)
        }
      })
      .catch((error: unknown) => {
        if (!ignore) {
          setMenuError(
            error instanceof Error ? error.message : 'Unable to load menu',
          )
        }
      })

    return () => {
      ignore = true
    }
  }, [menuClient])

  useEffect(() => {
    let ignore = false

    void cartClient.getCart().then((response) => {
      if (ignore) return
      if (response.ok) {
        setCartSnapshot(response.data)
        setCartServerTime(response.meta.serverTime)
      } else {
        setCartError(response.error.message)
      }
    })

    return () => {
      ignore = true
    }
  }, [cartClient])

  const setOptionQuantity = (optionId: string, quantity: number) => {
    setConfiguration((current) => {
      const selections = { ...current.selections }
      if (quantity === 0) {
        delete selections[optionId]
      } else {
        selections[optionId] = quantity
      }
      return { selections }
    })
  }

  const addToCart = async () => {
    const fingerprint = configurationFingerprint(configuration)
    if (addOperationRef.current?.fingerprint !== fingerprint) {
      addOperationRef.current = {
        fingerprint,
        idempotencyKey: createIdempotencyKey(),
      }
    }
    const operation = addOperationRef.current
    setAddPending(true)
    setCanRetryAdd(false)
    setCartError(null)

    try {
      const response = await cartClient.addCartItem({
        idempotencyKey: operation.idempotencyKey,
        configuration,
        quantity: 1,
      })
      if (response.ok) {
        setCartSnapshot(response.data.cart)
        setCartServerTime(response.meta.serverTime)
        setCanRetryAdd(false)
        if (addOperationRef.current === operation)
          addOperationRef.current = null
      } else if (addOperationRef.current === operation) {
        setCartError(response.error.message)
        setCanRetryAdd(true)
      }
    } catch (error) {
      if (addOperationRef.current === operation) {
        setCartError(
          error instanceof Error ? error.message : 'Unable to add item',
        )
        setCanRetryAdd(true)
      }
    } finally {
      setAddPending(false)
    }
  }

  const removeCartItem = async (cartItemId: string) => {
    const response = await cartClient.removeCartItem(cartItemId)
    if (response.ok) {
      setCartSnapshot(response.data.cart)
      setCartServerTime(response.meta.serverTime)
      setCartError(null)
      setCanRetryAdd(false)
    } else {
      setCartError(response.error.message)
      setCanRetryAdd(false)
    }
  }

  const expireCartReservations = async () => {
    const response = await cartClient.expireReservations()
    if (response.ok) {
      setCartSnapshot(response.data.cart)
      setCartServerTime(response.meta.serverTime)
    } else {
      setCartError(response.error.message)
      setCanRetryAdd(false)
    }
  }

  return (
    <section className="builder" aria-labelledby="builder-title">
      <div>
        <p className="eyebrow">Live mock API preview</p>
        <h2 id="builder-title">Build your order</h2>
        <p className="builder-intro">
          Menu definitions and every displayed price come from the mock API.
        </p>
      </div>

      {menuError ? <p role="alert">Menu error: {menuError}</p> : null}
      {!menu && !menuError ? <p>Loading menu…</p> : null}

      {menu ? (
        <div className="builder-layout">
          <div className="option-groups">
            {menu.groups.map((group) => (
              <fieldset key={group.id}>
                <legend>{group.name}</legend>
                {group.options.map((option) => (
                  <label className="option-row" key={option.id}>
                    <span>
                      {option.name} <small>+{formatBdt(option.price)}</small>
                    </span>
                    <input
                      aria-label={`${option.name} quantity`}
                      min="0"
                      step="1"
                      type="number"
                      value={configuration.selections[option.id] ?? 0}
                      onChange={(event) =>
                        setOptionQuantity(
                          option.id,
                          Math.max(0, Number.parseInt(event.target.value) || 0),
                        )
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            {validation && !validation.isValid ? (
              <ul className="validation-list" aria-label="Configuration issues">
                {validation.violations.map((violation) => (
                  <li
                    key={`${violation.source}-${violation.id}-${violation.code}`}
                  >
                    {violation.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              className="primary-action"
              type="button"
              disabled={!validation?.canAddToCart}
              onClick={() => void addToCart()}
            >
              Add to cart
            </button>
            {addPending ? <p role="status">Adding item…</p> : null}
            {cartError ? (
              <div role="alert">
                <p>{cartError}</p>
                {canRetryAdd ? (
                  <button type="button" onClick={() => void addToCart()}>
                    Retry add
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="price-preview" aria-live="polite">
            <h3>Price preview</h3>
            <p className="preview-state">
              Request: {preview.requestStatus} · Preview:{' '}
              {preview.previewFreshness}
            </p>

            {preview.requestStatus === 'error' ? (
              <div role="alert">
                <p>{preview.error?.message ?? 'Price preview failed.'}</p>
                <p>Your current selections are still here.</p>
                <button type="button" onClick={preview.retry}>
                  Retry
                </button>
              </div>
            ) : null}

            {preview.previewFreshness === 'current' && preview.pricing ? (
              <dl>
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatBdt(preview.pricing.subtotal)}</dd>
                </div>
                {preview.pricing.lines.flatMap((line) =>
                  line.unitDiscounts.map((discount) => (
                    <div key={`${line.cartItemId}-${discount.promotionId}`}>
                      <dt>{discount.name} (per unit)</dt>
                      <dd>−{formatBdt(discount.amount)}</dd>
                    </div>
                  )),
                )}
                <div>
                  <dt>Cart discount</dt>
                  <dd>
                    −{formatBdt(preview.pricing.cartDiscount?.amount ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>VAT</dt>
                  <dd>{formatBdt(preview.pricing.vat)}</dd>
                </div>
                <div className="payable-row">
                  <dt>Payable</dt>
                  <dd>{formatBdt(preview.pricing.payable)}</dd>
                </div>
              </dl>
            ) : (
              <p>
                {preview.previewFreshness === 'stale'
                  ? 'Updating this configuration’s price…'
                  : 'Calculating price…'}
              </p>
            )}
          </aside>
        </div>
      ) : null}

      <section className="cart-panel" aria-labelledby="cart-title">
        <h3 id="cart-title">Cart reservations</h3>
        {!cartSnapshot ? <p>Loading cart…</p> : null}
        {cartSnapshot?.items.length === 0 ? <p>Your cart is empty.</p> : null}
        {cartSnapshot?.items.map((item) => (
          <CartReservationRow
            key={item.id}
            item={item}
            reservation={cartSnapshot.reservations.find(
              (candidate) => candidate.id === item.reservationId,
            )}
            serverTime={cartServerTime}
            onRemove={removeCartItem}
            onExpire={expireCartReservations}
          />
        ))}
      </section>
      {cartSnapshot ? (
        <CheckoutPanel
          cart={cartSnapshot}
          onCartChanged={(cart, serverTime) => {
            setCartSnapshot(cart)
            setCartServerTime(serverTime)
          }}
        />
      ) : null}
    </section>
  )
}

function CartReservationRow({
  item,
  reservation,
  serverTime,
  onRemove,
  onExpire,
}: {
  readonly item: CartItem
  readonly reservation: Reservation | undefined
  readonly serverTime: string | null
  readonly onRemove: (cartItemId: string) => Promise<void>
  readonly onExpire: () => Promise<void>
}) {
  if (!reservation) return <p role="alert">Reservation data is missing.</p>

  return (
    <article className="cart-row">
      <div>
        <strong>Item quantity: {item.quantity}</strong>
        <p>
          Reservation: {reservation.status}
          {reservation.status === 'active' && serverTime ? (
            <ReservationTime
              expiresAt={reservation.expiresAt}
              serverTime={serverTime}
              onExpire={onExpire}
            />
          ) : null}
        </p>
        {reservation.status === 'expired' ? (
          <p>This item is read-only because its reservation expired.</p>
        ) : null}
      </div>
      <button type="button" onClick={() => void onRemove(item.id)}>
        Remove
      </button>
    </article>
  )
}

function ReservationTime({
  expiresAt,
  serverTime,
  onExpire,
}: {
  readonly expiresAt: string
  readonly serverTime: string
  readonly onExpire: () => Promise<void>
}) {
  const remainingMs = useReservationCountdown({ expiresAt, serverTime })
  const expirationReportedRef = useRef(false)

  useEffect(() => {
    if (remainingMs === 0 && !expirationReportedRef.current) {
      expirationReportedRef.current = true
      void onExpire()
    }
  }, [onExpire, remainingMs])
  const totalSeconds = Math.ceil(remainingMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return (
    <span>
      {' '}
      · {minutes}:{seconds} remaining
    </span>
  )
}

function formatBdt(poisha: number): string {
  return `${(poisha / 100).toFixed(2)} BDT`
}

function configurationFingerprint(configuration: Configuration): string {
  return JSON.stringify(
    Object.entries(configuration.selections).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}
