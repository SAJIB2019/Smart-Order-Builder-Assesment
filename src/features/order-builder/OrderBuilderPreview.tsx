import { useEffect, useMemo, useRef, useState } from 'react'

import { PricingSummary } from '../../components/PricingSummary'
import { validate } from '../../domain/rules/validate'
import {
  calculateConfigurationRequirements,
  calculateMaximumAdditionalOptionUnits,
  calculateRemainingStock,
  checkIngredientAvailability,
  multiplyIngredientRequirements,
  releaseStockAllocation,
} from '../../domain/stock/stock-engine'
import type {
  CartItem,
  CartSnapshot,
  Reservation,
} from '../../domain/types/cart'
import type { Configuration, Menu, OptionGroup } from '../../domain/types/menu'
import type { PriceableCart } from '../../domain/types/pricing'
import type { StockSnapshot } from '../../domain/types/stock'
import {
  type PricePreviewClient,
  usePricePreview,
} from '../../hooks/use-price-preview'
import { useReservationCountdown } from '../../hooks/use-reservation-countdown'
import { ApiClient } from '../../services/api/api-client'
import {
  createBrowserDraftRepository,
  createConfigurationDraft,
  type ConfigurationDraftRepository,
  revalidateConfigurationDraft,
} from '../../services/drafts/configuration-draft'
import { formatBdt } from '../../utils/formatters'
import { CheckoutPanel } from '../checkout/CheckoutPanel'
import { OrdersPanel } from '../orders/OrdersPanel'

const browserApiClient = new ApiClient()
const browserDraftRepository = createBrowserDraftRepository()

type CartClient = Pick<
  ApiClient,
  'getCart' | 'addCartItem' | 'removeCartItem' | 'expireReservations'
> &
  Partial<Pick<ApiClient, 'editCartItem' | 'getInventory'>>

interface OrderBuilderPreviewProps {
  readonly menuClient?: Pick<ApiClient, 'getMenu'>
  readonly priceClient?: PricePreviewClient
  readonly cartClient?: CartClient
  readonly createIdempotencyKey?: () => string
  readonly draftRepository?: ConfigurationDraftRepository
}

export function OrderBuilderPreview({
  menuClient = browserApiClient,
  priceClient = browserApiClient,
  cartClient = browserApiClient,
  createIdempotencyKey = defaultIdempotencyKey,
  draftRepository = browserDraftRepository,
}: OrderBuilderPreviewProps) {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [configuration, setConfiguration] = useState<Configuration>({
    selections: {},
  })
  const [itemQuantity, setItemQuantity] = useState(1)
  const [inventory, setInventory] = useState<StockSnapshot | null>(null)
  const [cartSnapshot, setCartSnapshot] = useState<CartSnapshot | null>(null)
  const [cartServerTime, setCartServerTime] = useState<string | null>(null)
  const [cartError, setCartError] = useState<string | null>(null)
  const [mutationPending, setMutationPending] = useState(false)
  const [canRetryAdd, setCanRetryAdd] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  const addOperationRef = useRef<{
    readonly fingerprint: string
    readonly idempotencyKey: string
  } | null>(null)
  const draftRestoreAttemptedRef = useRef(false)

  const previewCart = useMemo<PriceableCart>(
    () => ({
      items: [
        {
          id: editingItemId ?? 'builder-preview',
          configuration,
          quantity: itemQuantity,
        },
      ],
      attemptedCouponCode: null,
    }),
    [configuration, editingItemId, itemQuantity],
  )
  const preview = usePricePreview({ cart: previewCart, client: priceClient })
  const validation = menu
    ? validate(configuration, menu.groups, menu.rules)
    : null
  const stockState = useMemo(
    () =>
      deriveDraftStock(
        menu,
        inventory,
        cartSnapshot,
        editingItemId,
        configuration,
        itemQuantity,
      ),
    [cartSnapshot, configuration, editingItemId, inventory, itemQuantity, menu],
  )
  const canSubmit =
    validation?.canAddToCart === true &&
    stockState.availability !== 'insufficientStock' &&
    !mutationPending

  useEffect(() => {
    let ignore = false
    void menuClient
      .getMenu()
      .then((response) => {
        if (ignore) return
        if (response.ok) {
          setMenu(response.data)
          setMenuError(null)
        } else setMenuError(response.error.message)
      })
      .catch((error: unknown) => {
        if (!ignore) setMenuError(toMessage(error, 'Unable to load menu'))
      })
    return () => {
      ignore = true
    }
  }, [menuClient])

  useEffect(() => {
    let ignore = false
    void cartClient
      .getCart()
      .then((response) => {
        if (ignore) return
        if (response.ok) {
          setCartSnapshot(response.data)
          setCartServerTime(response.meta.serverTime)
        } else setCartError(response.error.message)
      })
      .catch((error: unknown) => {
        if (!ignore) setCartError(toMessage(error, 'Unable to load cart'))
      })
    if (cartClient.getInventory) {
      void cartClient.getInventory().then((response) => {
        if (!ignore && response.ok) setInventory(response.data)
      })
    }
    return () => {
      ignore = true
    }
  }, [cartClient])

  useEffect(() => {
    if (!menu || !inventory || draftRestoreAttemptedRef.current) return
    draftRestoreAttemptedRef.current = true
    const storedDraft = draftRepository.load()
    if (!storedDraft) return
    const restored = revalidateConfigurationDraft(storedDraft, menu, inventory)
    if (!restored) {
      draftRepository.clear()
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setConfiguration(restored.draft.configuration)
      setItemQuantity(restored.draft.itemQuantity)
    })
    return () => {
      cancelled = true
    }
  }, [draftRepository, inventory, menu])

  useEffect(() => {
    if (!draftRestoreAttemptedRef.current || editingItemId) return
    if (
      Object.keys(configuration.selections).length === 0 &&
      itemQuantity === 1
    ) {
      draftRepository.clear()
      return
    }
    draftRepository.save(createConfigurationDraft(configuration, itemQuantity))
  }, [configuration, draftRepository, editingItemId, itemQuantity])

  function setOptionQuantity(optionId: string, quantity: number): void {
    setConfiguration((current) => {
      const selections = { ...current.selections }
      if (quantity <= 0) delete selections[optionId]
      else selections[optionId] = quantity
      return { selections }
    })
    setCanRetryAdd(false)
  }

  async function refreshInventory(): Promise<void> {
    if (!cartClient.getInventory) return
    const response = await cartClient.getInventory()
    if (response.ok) setInventory(response.data)
  }

  async function reloadAfterVersionConflict(): Promise<void> {
    const response = await cartClient.getCart()
    if (response.ok) {
      setCartSnapshot(response.data)
      setCartServerTime(response.meta.serverTime)
    }
    await refreshInventory()
    setCartError(
      'Cart changed in another tab. The latest cart was loaded; review and retry.',
    )
  }

  async function addToCart(): Promise<void> {
    const fingerprint = configurationFingerprint(configuration, itemQuantity)
    if (addOperationRef.current?.fingerprint !== fingerprint) {
      addOperationRef.current = {
        fingerprint,
        idempotencyKey: createIdempotencyKey(),
      }
    }
    const operation = addOperationRef.current
    setMutationPending(true)
    setCanRetryAdd(false)
    setCartError(null)
    try {
      const response = await cartClient.addCartItem({
        cartVersion: cartSnapshot?.version ?? 0,
        idempotencyKey: operation.idempotencyKey,
        configuration,
        quantity: itemQuantity,
      })
      if (response.ok) {
        setCartSnapshot(response.data.cart)
        setCartServerTime(response.meta.serverTime)
        if (addOperationRef.current === operation)
          addOperationRef.current = null
        setConfiguration({ selections: {} })
        setItemQuantity(1)
        await refreshInventory()
      } else if (
        response.error.code === 'CONFLICT' &&
        addOperationRef.current === operation
      ) {
        await reloadAfterVersionConflict()
        setCanRetryAdd(true)
      } else if (addOperationRef.current === operation) {
        setCartError(response.error.message)
        setCanRetryAdd(true)
      }
    } catch (error) {
      if (addOperationRef.current === operation) {
        setCartError(toMessage(error, 'Unable to add item'))
        setCanRetryAdd(true)
      }
    } finally {
      setMutationPending(false)
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editingItemId || !cartClient.editCartItem) return
    setMutationPending(true)
    setCartError(null)
    try {
      const response = await cartClient.editCartItem(editingItemId, {
        cartVersion: cartSnapshot?.version ?? 0,
        configuration,
        quantity: itemQuantity,
      })
      if (response.ok) {
        setCartSnapshot(response.data.cart)
        setCartServerTime(response.meta.serverTime)
        cancelEdit()
        await refreshInventory()
      } else if (response.error.code === 'CONFLICT') {
        await reloadAfterVersionConflict()
      } else setCartError(response.error.message)
    } catch (error) {
      setCartError(toMessage(error, 'Unable to save changes'))
    } finally {
      setMutationPending(false)
    }
  }

  function beginEdit(item: CartItem): void {
    setEditingItemId(item.id)
    setConfiguration(item.configuration)
    setItemQuantity(item.quantity)
    setCartError(null)
    document
      .getElementById('builder-title')
      ?.scrollIntoView?.({ behavior: 'smooth' })
  }

  function cancelEdit(): void {
    setEditingItemId(null)
    setConfiguration({ selections: {} })
    setItemQuantity(1)
    setCartError(null)
  }

  async function removeCartItem(cartItemId: string): Promise<void> {
    setMutationPending(true)
    const response = await cartClient.removeCartItem(cartItemId, {
      cartVersion: cartSnapshot?.version ?? 0,
    })
    if (response.ok) {
      setCartSnapshot(response.data.cart)
      setCartServerTime(response.meta.serverTime)
      if (editingItemId === cartItemId) cancelEdit()
      await refreshInventory()
    } else if (response.error.code === 'CONFLICT') {
      await reloadAfterVersionConflict()
    } else setCartError(response.error.message)
    setMutationPending(false)
  }

  async function expireCartReservations(): Promise<void> {
    const response = await cartClient.expireReservations()
    if (response.ok) {
      setCartSnapshot(response.data.cart)
      setCartServerTime(response.meta.serverTime)
      await refreshInventory()
    } else setCartError(response.error.message)
  }

  return (
    <div className="order-workspace">
      <section
        className="panel builder"
        id="builder"
        aria-labelledby="builder-title"
      >
        <div className="section-heading hero-heading">
          <div>
            <p className="section-kicker">New order</p>
            <h2 id="builder-title">
              {editingItemId
                ? 'Edit configured item'
                : (menu?.product.name ?? 'Build your order')}
            </h2>
            <p>
              Configure from the live menu. Rules, stock, and prices update as
              you work.
            </p>
          </div>
          {editingItemId ? (
            <span className="editing-badge">Editing item</span>
          ) : null}
        </div>

        {menuError ? (
          <p className="alert error-alert" role="alert">
            Menu error: {menuError}
          </p>
        ) : null}
        {!menu && !menuError ? <BuilderSkeleton /> : null}

        {menu ? (
          <div className="builder-layout">
            <div className="builder-form">
              <ItemQuantityControl
                value={itemQuantity}
                onChange={setItemQuantity}
              />
              <div className="option-groups">
                {menu.groups.map((group) => (
                  <OptionGroupFieldset
                    configuration={configuration}
                    group={group}
                    itemQuantity={itemQuantity}
                    key={group.id}
                    menu={menu}
                    stock={stockState.remainingStock}
                    onChange={setOptionQuantity}
                  />
                ))}
              </div>

              {validation && !validation.isValid ? (
                <div className="validation-panel" role="alert">
                  <strong>Check your configuration</strong>
                  <ul aria-label="Configuration issues">
                    {validation.violations.map((violation, index) => (
                      <li
                        key={`${violation.source}-${violation.id}-${violation.code}-${index}`}
                      >
                        {violation.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {stockState.shortages.length > 0 ? (
                <div className="validation-panel stock-warning" role="alert">
                  <strong>Not enough ingredients</strong>
                  <ul>
                    {stockState.shortages.map((shortage) => (
                      <li key={shortage.ingredientId}>
                        Short: {shortage.missing} {shortage.ingredientName}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="builder-actions">
                <button
                  aria-label={editingItemId ? 'Save changes' : 'Add to cart'}
                  className="primary-action"
                  type="button"
                  disabled={!canSubmit}
                  onClick={() =>
                    void (editingItemId ? saveEdit() : addToCart())
                  }
                >
                  {mutationPending
                    ? 'Saving…'
                    : editingItemId
                      ? 'Save changes'
                      : `Add ${itemQuantity} to cart`}
                </button>
                {editingItemId ? (
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={mutationPending}
                    onClick={cancelEdit}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              {cartError ? (
                <div className="alert error-alert" role="alert">
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
              <div className="preview-heading">
                <span className="preview-icon" aria-hidden="true">
                  ৳
                </span>
                <div>
                  <span>Live total</span>
                  <strong>
                    {preview.pricing
                      ? formatBdt(preview.pricing.payable)
                      : 'Calculating…'}
                  </strong>
                </div>
              </div>
              <p className="preview-state">
                {formatPreviewState(
                  preview.requestStatus,
                  preview.previewFreshness,
                )}
              </p>
              {preview.requestStatus === 'error' ? (
                <div className="inline-alert" role="alert">
                  <span>
                    <span>
                      {preview.error?.message ?? 'Price preview failed.'}
                    </span>{' '}
                    <span>Your current selections are still here.</span>
                  </span>
                  <button type="button" onClick={preview.retry}>
                    Retry
                  </button>
                </div>
              ) : null}
              {preview.previewFreshness === 'current' && preview.pricing ? (
                <PricingSummary pricing={preview.pricing} title="Item price" />
              ) : (
                <div className="skeleton preview-skeleton" />
              )}
            </aside>
          </div>
        ) : null}
      </section>

      <section
        className="panel cart-panel"
        id="cart"
        aria-labelledby="cart-title"
      >
        <div className="section-heading">
          <div>
            <p className="section-kicker">Reserved for 5 minutes</p>
            <h2 id="cart-title">Cart</h2>
            <p>Stock is held by ingredient until checkout or expiry.</p>
          </div>
          <span className="count-badge">
            {cartSnapshot?.items.length ?? 0} items
          </span>
        </div>
        {!cartSnapshot ? (
          <div className="skeleton cart-skeleton" aria-label="Loading cart" />
        ) : null}
        {cartSnapshot?.items.length === 0 ? (
          <div className="empty-state">
            <span aria-hidden="true">◎</span>
            <strong>Your cart is empty</strong>
            <p>Configure an item above to start an order.</p>
          </div>
        ) : null}
        <div className="cart-list">
          {cartSnapshot?.items.map((item) => (
            <CartReservationRow
              item={item}
              key={item.id}
              menu={menu}
              mutationPending={mutationPending}
              reservation={cartSnapshot.reservations.find(
                (candidate) => candidate.id === item.reservationId,
              )}
              serverTime={cartServerTime}
              onEdit={beginEdit}
              onExpire={expireCartReservations}
              onRemove={removeCartItem}
            />
          ))}
        </div>
        {cartSnapshot && cartSnapshot.items.length > 0 ? (
          <PricingSummary
            pricing={cartSnapshot.activePricing}
            title="Reserved cart"
          />
        ) : null}
        {cartSnapshot ? (
          <CheckoutPanel
            cart={cartSnapshot}
            priceClient={priceClient}
            onVersionConflict={reloadAfterVersionConflict}
            onCartChanged={(cart, serverTime) => {
              setCartSnapshot(cart)
              setCartServerTime(serverTime)
              void refreshInventory()
            }}
            onOrderCreated={() => setOrdersRefreshKey((current) => current + 1)}
          />
        ) : null}
      </section>

      <OrdersPanel refreshKey={ordersRefreshKey} />
    </div>
  )
}

function OptionGroupFieldset({
  configuration,
  group,
  menu,
  stock,
  itemQuantity,
  onChange,
}: {
  readonly configuration: Configuration
  readonly group: OptionGroup
  readonly menu: Menu
  readonly stock: StockSnapshot | null
  readonly itemQuantity: number
  readonly onChange: (optionId: string, quantity: number) => void
}) {
  const groupTotal = group.options.reduce(
    (total, option) => total + (configuration.selections[option.id] ?? 0),
    0,
  )
  const effectiveMax = getEffectiveGroupMax(group, menu, configuration)
  return (
    <fieldset className="option-group">
      <legend>
        <span>{group.name}</span>
        <small>
          {describeConstraints(group, effectiveMax)} · Selected {groupTotal}
        </small>
      </legend>
      <div className="option-grid">
        {group.options.map((option) => {
          const quantity = configuration.selections[option.id] ?? 0
          const capacity = stock
            ? calculateMaximumAdditionalOptionUnits(option, itemQuantity, stock)
            : null
          const groupAtMax =
            effectiveMax !== undefined && groupTotal >= effectiveMax
          const optionAtMax =
            group.constraints.maxPerOption !== undefined &&
            quantity >= group.constraints.maxPerOption
          const noStock = capacity?.type === 'finite' && capacity.quantity === 0
          const canIncrease = !groupAtMax && !optionAtMax && !noStock
          const maxFromStock =
            capacity?.type === 'finite'
              ? quantity + capacity.quantity
              : undefined
          return (
            <div
              className={`option-card${quantity > 0 ? ' selected' : ''}${!canIncrease && quantity === 0 ? ' unavailable' : ''}`}
              key={option.id}
            >
              <div className="option-copy">
                <strong>{option.name}</strong>
                <span>
                  {option.price === 0
                    ? 'Included'
                    : `+${formatBdt(option.price)}`}
                </span>
                <small>{formatCapacity(capacity)}</small>
              </div>
              <div className="quantity-stepper">
                <button
                  type="button"
                  aria-label={`Decrease ${option.name}`}
                  disabled={quantity === 0}
                  onClick={() => onChange(option.id, quantity - 1)}
                >
                  −
                </button>
                <input
                  aria-label={`${option.name} quantity`}
                  min="0"
                  max={maxFromStock}
                  step="1"
                  type="number"
                  value={quantity}
                  onChange={(event) =>
                    onChange(
                      option.id,
                      Math.max(0, Number.parseInt(event.target.value) || 0),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Increase ${option.name}`}
                  disabled={!canIncrease}
                  onClick={() => onChange(option.id, quantity + 1)}
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

function ItemQuantityControl({
  value,
  onChange,
}: {
  readonly value: number
  readonly onChange: (value: number) => void
}) {
  return (
    <div className="item-quantity-card">
      <div>
        <strong>Item quantity</strong>
        <small>Each configured item reserves its own ingredients.</small>
      </div>
      <div className="quantity-stepper large-stepper">
        <button
          type="button"
          aria-label="Decrease item quantity"
          disabled={value === 1}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <input
          aria-label="Item quantity"
          min="1"
          max="3"
          type="number"
          value={value}
          onChange={(event) =>
            onChange(
              Math.min(
                3,
                Math.max(1, Number.parseInt(event.target.value) || 1),
              ),
            )
          }
        />
        <button
          type="button"
          aria-label="Increase item quantity"
          disabled={value === 3}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

function CartReservationRow({
  item,
  reservation,
  serverTime,
  menu,
  mutationPending,
  onEdit,
  onRemove,
  onExpire,
}: {
  readonly item: CartItem
  readonly reservation: Reservation | undefined
  readonly serverTime: string | null
  readonly menu: Menu | null
  readonly mutationPending: boolean
  readonly onEdit: (item: CartItem) => void
  readonly onRemove: (cartItemId: string) => Promise<void>
  readonly onExpire: () => Promise<void>
}) {
  if (!reservation)
    return (
      <p className="alert error-alert" role="alert">
        Reservation data is missing.
      </p>
    )
  const optionIndex = new Map(
    menu?.groups.flatMap((group) =>
      group.options.map((option) => [option.id, option.name] as const),
    ) ?? [],
  )
  const expired = reservation.status === 'expired'
  return (
    <article className={`cart-row${expired ? ' expired' : ''}`}>
      <div className="cart-item-main">
        <div className="cart-item-heading">
          <div>
            <strong>{menu?.product.name ?? 'Configured item'}</strong>
            <span>Quantity {item.quantity}</span>
          </div>
          <ReservationStatus
            reservation={reservation}
            serverTime={serverTime}
            onExpire={onExpire}
          />
        </div>
        <ul className="selection-chips">
          {Object.entries(item.configuration.selections)
            .filter(([, quantity]) => quantity > 0)
            .map(([optionId, quantity]) => (
              <li key={optionId}>
                {optionIndex.get(optionId) ?? optionId} ×{quantity}
              </li>
            ))}
        </ul>
        {expired ? (
          <p className="expired-copy">
            Reservation expired. This item is read-only but can still be
            removed.
          </p>
        ) : null}
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={expired || mutationPending}
          onClick={() => onEdit(item)}
        >
          Edit
        </button>
        <button
          className="danger-action"
          type="button"
          disabled={mutationPending}
          onClick={() => void onRemove(item.id)}
        >
          Remove
        </button>
      </div>
    </article>
  )
}

function ReservationStatus({
  reservation,
  serverTime,
  onExpire,
}: {
  readonly reservation: Reservation
  readonly serverTime: string | null
  readonly onExpire: () => Promise<void>
}) {
  if (reservation.status !== 'active' || !serverTime)
    return (
      <span className={`reservation-badge ${reservation.status}`}>
        {reservation.status}
      </span>
    )
  return (
    <ReservationTime
      expiresAt={reservation.expiresAt}
      serverTime={serverTime}
      onExpire={onExpire}
    />
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
  return (
    <span className="reservation-badge active">
      <span aria-hidden="true">◷</span> {Math.floor(totalSeconds / 60)}:
      {String(totalSeconds % 60).padStart(2, '0')}
    </span>
  )
}

function deriveDraftStock(
  menu: Menu | null,
  inventory: StockSnapshot | null,
  cart: CartSnapshot | null,
  editingItemId: string | null,
  configuration: Configuration,
  itemQuantity: number,
) {
  if (!menu || !inventory)
    return {
      availability: 'unknown' as const,
      shortages: [],
      remainingStock: inventory,
    }
  let availableStock = inventory
  if (editingItemId && cart) {
    const item = cart.items.find((candidate) => candidate.id === editingItemId)
    const reservation = item
      ? cart.reservations.find(
          (candidate) => candidate.id === item.reservationId,
        )
      : undefined
    if (reservation?.status === 'active')
      availableStock = releaseStockAllocation(
        inventory,
        reservation.allocation,
      ).stock
  }
  const requirements = multiplyIngredientRequirements(
    calculateConfigurationRequirements(configuration, menu.groups),
    itemQuantity,
  )
  const availability = checkIngredientAvailability(availableStock, requirements)
  const ingredientIndex = new Map(
    menu.ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
  )
  const shortages =
    availability.status === 'insufficientStock'
      ? availability.shortages.map((shortage) => ({
          ...shortage,
          ingredientName:
            ingredientIndex.get(shortage.ingredientId) ?? shortage.ingredientId,
        }))
      : []
  const remaining = calculateRemainingStock(availableStock, requirements)
  return {
    availability: availability.status,
    shortages,
    remainingStock:
      remaining.status === 'applied' ? remaining.stock : availableStock,
  }
}

function getEffectiveGroupMax(
  group: OptionGroup,
  menu: Menu,
  configuration: Configuration,
): number | undefined {
  let maximum = group.constraints.max
  for (const rule of menu.rules)
    if (
      rule.type === 'overrideLimit' &&
      rule.targetGroupId === group.id &&
      (configuration.selections[rule.triggerOptionId] ?? 0) > 0
    )
      maximum = rule.override.max
  return maximum
}

function describeConstraints(
  group: OptionGroup,
  effectiveMax: number | undefined,
): string {
  const parts = [`Min ${group.constraints.min}`]
  if (effectiveMax !== undefined) parts.push(`Max ${effectiveMax}`)
  if (group.constraints.step !== undefined)
    parts.push(`Step ${group.constraints.step}`)
  if (group.constraints.maxDistinct !== undefined)
    parts.push(`${group.constraints.maxDistinct} choices`)
  if (group.constraints.maxPerOption !== undefined)
    parts.push(`${group.constraints.maxPerOption} each`)
  return parts.join(' · ')
}

function formatCapacity(
  capacity: ReturnType<typeof calculateMaximumAdditionalOptionUnits> | null,
): string {
  if (!capacity) return 'Checking availability…'
  return capacity.type === 'unlimited'
    ? 'Unlimited availability'
    : `${capacity.quantity} more available`
}

function formatPreviewState(status: string, freshness: string): string {
  if (status === 'error')
    return 'Preview unavailable — your selections are preserved.'
  if (status === 'loading' || status === 'debouncing')
    return 'Updating from the pricing service…'
  if (freshness === 'current') return 'Calculated from current selections.'
  return 'Waiting for a valid configuration.'
}

function BuilderSkeleton() {
  return (
    <div className="builder-layout" aria-label="Loading menu" role="status">
      <div className="skeleton builder-skeleton" />
      <div className="skeleton preview-skeleton" />
    </div>
  )
}

function configurationFingerprint(
  configuration: Configuration,
  itemQuantity: number,
): string {
  return JSON.stringify({
    itemQuantity,
    selections: Object.entries(configuration.selections).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  })
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function defaultIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}
