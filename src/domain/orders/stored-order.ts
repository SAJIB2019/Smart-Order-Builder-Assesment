import { priceCart } from '../pricing/price-cart'
import type { Configuration, Menu } from '../types/menu'
import { poisha } from '../types/money'
import {
  ORDER_CURRENCY,
  ORDER_MONEY_UNIT,
  ORDER_SCHEMA_VERSION,
  type PaymentMethod,
  type StoredOrder,
  type StoredOrderLine,
  type StoredOrderSelection,
} from '../types/order'

export interface OrderSourceLine {
  readonly id: string
  readonly quantity: number
  readonly configuration: Configuration
}

interface CreateStoredOrderInput {
  readonly id: string
  readonly createdAt: string
  readonly paymentMethod: PaymentMethod
  readonly attemptedCouponCode: string | null
  readonly lines: readonly OrderSourceLine[]
  readonly menu: Menu
}

/** Creates an immutable, self-contained order snapshot using historical time. */
export function createStoredOrder({
  id,
  createdAt,
  paymentMethod,
  attemptedCouponCode,
  lines,
  menu,
}: CreateStoredOrderInput): StoredOrder {
  if (id.trim().length === 0) throw new Error('Order ID is required')
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error('Order createdAt must be a valid timestamp')
  }
  if (lines.length === 0) throw new Error('An order requires at least one line')
  if (new Set(lines.map(({ id: lineId }) => lineId)).size !== lines.length) {
    throw new Error('Order line IDs must be unique')
  }

  const pricing = priceCart(
    { items: lines, attemptedCouponCode },
    menu,
    menu.promotions,
    createdAt,
  )
  const linePricing = new Map(
    pricing.lines.map((line) => [line.cartItemId, line]),
  )

  return {
    schemaVersion: ORDER_SCHEMA_VERSION,
    id,
    createdAt,
    currency: ORDER_CURRENCY,
    moneyUnit: ORDER_MONEY_UNIT,
    paymentMethod,
    coupon: {
      attemptedCode: pricing.coupon.attemptedCode,
      status: pricing.coupon.status,
      matchedPromotionId: pricing.coupon.matchedPromotionId,
      applied: pricing.coupon.applied,
      appliedDiscountPoisha: pricing.coupon.applied
        ? (pricing.cartDiscount?.amount ?? poisha(0))
        : poisha(0),
    },
    lines: lines.map((line) =>
      snapshotLine(line, menu, requiredLinePricing(line.id, linePricing)),
    ),
    pricing,
  }
}

function snapshotLine(
  line: OrderSourceLine,
  menu: Menu,
  pricing: StoredOrderLine['pricing'],
): StoredOrderLine {
  const selected = new Map(Object.entries(line.configuration.selections))
  const selections: StoredOrderSelection[] = []

  for (const group of menu.groups) {
    for (const option of group.options) {
      const quantity = selected.get(option.id)
      if (quantity === undefined) continue
      selections.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        quantity,
        unitPricePoisha: option.price,
      })
      selected.delete(option.id)
    }
  }

  if (selected.size > 0) {
    throw new Error(`Unknown option ID: ${selected.keys().next().value}`)
  }

  return {
    id: line.id,
    quantity: line.quantity,
    product: {
      id: menu.product.id,
      name: menu.product.name,
      basePricePoisha: menu.product.basePrice,
    },
    selections,
    pricing,
  }
}

function requiredLinePricing(
  lineId: string,
  pricing: ReadonlyMap<string, StoredOrderLine['pricing']>,
): StoredOrderLine['pricing'] {
  const result = pricing.get(lineId)
  if (!result) throw new Error(`Pricing is missing for order line ${lineId}`)
  return result
}
