import { useEffect, useMemo, useState } from 'react'

import type { Configuration, Menu } from '../../domain/types/menu'
import type { PriceableCart } from '../../domain/types/pricing'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../hooks/use-price-preview'
import { ApiClient } from '../../services/api/api-client'

const browserApiClient = new ApiClient()

interface OrderBuilderPreviewProps {
  readonly menuClient?: Pick<ApiClient, 'getMenu'>
  readonly priceClient?: PricePreviewClient
}

export function OrderBuilderPreview({
  menuClient = browserApiClient,
  priceClient = browserApiClient,
}: OrderBuilderPreviewProps) {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [configuration, setConfiguration] = useState<Configuration>({
    selections: {},
  })
  const cart = useMemo<PriceableCart>(
    () => ({
      items: [{ id: 'builder-preview', configuration, quantity: 1 }],
      attemptedCouponCode: null,
    }),
    [configuration],
  )
  const preview = usePricePreview({ cart, client: priceClient })

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
    </section>
  )
}

function formatBdt(poisha: number): string {
  return `${(poisha / 100).toFixed(2)} BDT`
}
