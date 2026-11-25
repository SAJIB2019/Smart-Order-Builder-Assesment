import rawSeedOrders from '../../../orders.seed.json'

import type {
  PaymentMethod,
  SeedOrder,
  SeedOrderLine,
  SeedOrdersFile,
} from '../../domain/types/order'

/** Fails loudly instead of inventing or silently repairing missing seed data. */
export const officialSeedOrders = parseSeedOrdersFile(rawSeedOrders)

export function parseSeedOrdersFile(value: unknown): SeedOrdersFile {
  const root = record(value, 'seed file')
  if (root.schemaVersion !== 1) throw new Error('Seed schemaVersion must be 1')
  if (root.currency !== 'BDT') throw new Error('Seed currency must be BDT')
  if (typeof root.note !== 'string') throw new Error('Seed note is required')
  if (!Array.isArray(root.orders))
    throw new Error('Seed orders must be an array')

  const orders = root.orders.map(parseSeedOrder)
  const ids = new Set(orders.map(({ id }) => id))
  if (ids.size !== orders.length)
    throw new Error('Seed order IDs must be unique')

  return {
    schemaVersion: 1,
    currency: 'BDT',
    note: root.note,
    orders,
  }
}

function parseSeedOrder(value: unknown, index: number): SeedOrder {
  const order = record(value, `seed order ${index}`)
  const id = requiredString(order.id, `seed order ${index} id`)
  const createdAt = requiredString(
    order.createdAt,
    `seed order ${index} createdAt`,
  )
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`Seed order ${id} has an invalid createdAt`)
  }
  const paymentMethod = parsePaymentMethod(order.paymentMethod, id)
  if (order.couponCode !== null && typeof order.couponCode !== 'string') {
    throw new Error(`Seed order ${id} has an invalid couponCode`)
  }
  if (!Array.isArray(order.lines) || order.lines.length === 0) {
    throw new Error(`Seed order ${id} must contain lines`)
  }

  return {
    id,
    createdAt,
    paymentMethod,
    couponCode: order.couponCode,
    lines: order.lines.map((line, lineIndex) =>
      parseSeedLine(line, id, lineIndex),
    ),
  }
}

function parseSeedLine(
  value: unknown,
  orderId: string,
  index: number,
): SeedOrderLine {
  const line = record(value, `${orderId} line ${index}`)
  if (!Number.isInteger(line.qty) || Number(line.qty) < 1) {
    throw new Error(`${orderId} line ${index} has an invalid qty`)
  }
  const options = record(line.options, `${orderId} line ${index} options`)
  const parsedOptions: Record<string, number> = {}
  for (const [optionId, quantity] of Object.entries(options)) {
    if (!Number.isInteger(quantity) || Number(quantity) < 1) {
      throw new Error(`${orderId} has an invalid quantity for ${optionId}`)
    }
    parsedOptions[optionId] = Number(quantity)
  }

  return { qty: Number(line.qty), options: parsedOptions }
}

function parsePaymentMethod(value: unknown, orderId: string): PaymentMethod {
  if (value === 'card' || value === 'bkash' || value === 'cash') return value
  throw new Error(`Seed order ${orderId} has an invalid paymentMethod`)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required`)
  }
  return value
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}
