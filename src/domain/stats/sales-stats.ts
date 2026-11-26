import { addPoisha } from '../pricing/money'
import { poisha, type Poisha } from '../types/money'
import type { PaymentMethod, StoredOrder } from '../types/order'

export const BUSINESS_TIME_ZONE = 'Asia/Dhaka' as const

export interface OrderCountResult {
  readonly orderCount: number
}

export interface TotalRevenueResult {
  readonly totalRevenuePoisha: Poisha
  readonly currency: 'BDT'
  readonly moneyUnit: 'poisha'
}

export interface BestSellingOptionResult {
  readonly optionId: string
  readonly optionName: string
  readonly units: number
}

export interface RevenueByPaymentMethodResult {
  readonly cardPoisha: Poisha
  readonly bkashPoisha: Poisha
  readonly cashPoisha: Poisha
  readonly currency: 'BDT'
  readonly moneyUnit: 'poisha'
}

export interface AverageOrderValueResult extends TotalRevenueResult {
  readonly averageOrderValuePoisha: Poisha
  readonly orderCount: number
}

export interface CouponUsageCountResult {
  readonly couponUsageCount: number
}

export interface OrdersByDateResult {
  readonly date: string
  readonly timeZone: typeof BUSINESS_TIME_ZONE
  readonly orderCount: number
  readonly orderIds: readonly string[]
}

export function getOrderCount(
  orders: readonly StoredOrder[],
): OrderCountResult {
  return { orderCount: orders.length }
}

export function getTotalRevenue(
  orders: readonly StoredOrder[],
): TotalRevenueResult {
  return {
    totalRevenuePoisha: addPoisha(
      ...orders.map(({ pricing }) => pricing.payable),
    ),
    currency: 'BDT',
    moneyUnit: 'poisha',
  }
}

export function getBestSellingOption(
  orders: readonly StoredOrder[],
): BestSellingOptionResult | null {
  const totals = new Map<
    string,
    { readonly optionName: string; units: number }
  >()

  for (const order of orders) {
    for (const line of order.lines) {
      for (const selection of line.selections) {
        const units = safeMultiply(line.quantity, selection.quantity)
        const existing = totals.get(selection.optionId)
        totals.set(selection.optionId, {
          optionName: selection.optionName,
          units: safeAdd(existing?.units ?? 0, units),
        })
      }
    }
  }

  let best: BestSellingOptionResult | null = null
  for (const [optionId, value] of totals) {
    if (
      best === null ||
      value.units > best.units ||
      (value.units === best.units && optionId.localeCompare(best.optionId) < 0)
    ) {
      best = { optionId, optionName: value.optionName, units: value.units }
    }
  }
  return best
}

export function getRevenueByPaymentMethod(
  orders: readonly StoredOrder[],
): RevenueByPaymentMethodResult {
  const totals: Record<PaymentMethod, Poisha> = {
    card: poisha(0),
    bkash: poisha(0),
    cash: poisha(0),
  }
  for (const order of orders) {
    totals[order.paymentMethod] = addPoisha(
      totals[order.paymentMethod],
      order.pricing.payable,
    )
  }

  return {
    cardPoisha: totals.card,
    bkashPoisha: totals.bkash,
    cashPoisha: totals.cash,
    currency: 'BDT',
    moneyUnit: 'poisha',
  }
}

export function getAverageOrderValue(
  orders: readonly StoredOrder[],
): AverageOrderValueResult {
  const revenue = getTotalRevenue(orders)
  return {
    ...revenue,
    averageOrderValuePoisha:
      orders.length === 0
        ? poisha(0)
        : divideHalfUp(revenue.totalRevenuePoisha, orders.length),
    orderCount: orders.length,
  }
}

export function getCouponUsageCount(
  orders: readonly StoredOrder[],
): CouponUsageCountResult {
  return {
    couponUsageCount: orders.filter(({ coupon }) => coupon.applied).length,
  }
}

export function getOrdersByDate(
  orders: readonly StoredOrder[],
  date: string,
  timeZone: typeof BUSINESS_TIME_ZONE = BUSINESS_TIME_ZONE,
): OrdersByDateResult {
  assertIsoDate(date)
  const orderIds = orders
    .filter((order) => dateInTimeZone(order.createdAt, timeZone) === date)
    .map(({ id }) => id)

  return {
    date,
    timeZone,
    orderCount: orderIds.length,
    orderIds,
  }
}

function dateInTimeZone(timestamp: string, timeZone: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid order timestamp')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed)
  const values = new Map(parts.map(({ type, value }) => [type, value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

function assertIsoDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must use YYYY-MM-DD')
  }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Date must be a real calendar date')
  }
}

function divideHalfUp(amount: Poisha, divisor: number): Poisha {
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new Error('Divisor must be a positive safe integer')
  }
  const numerator = BigInt(amount)
  const denominator = BigInt(divisor)
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  return poisha(Number(rounded))
}

function safeAdd(left: number, right: number): number {
  const value = left + right
  if (!Number.isSafeInteger(value)) throw new Error('Unit total is unsafe')
  return value
}

function safeMultiply(left: number, right: number): number {
  const value = left * right
  if (!Number.isSafeInteger(value)) throw new Error('Unit total is unsafe')
  return value
}
