import type { StoredOrder } from '../types/order'
import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponUsageCount,
  getOrderCount,
  getOrdersByDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from './sales-stats'

export const SALES_TOOL_NAMES = [
  'getOrderCount',
  'getTotalRevenue',
  'getBestSellingOption',
  'getRevenueByPaymentMethod',
  'getAverageOrderValue',
  'getCouponUsageCount',
  'getOrdersByDate',
  'explainDataLimitation',
] as const

export type SalesToolName = (typeof SALES_TOOL_NAMES)[number]

export interface SalesToolDefinition {
  readonly name: SalesToolName
  readonly description: string
  readonly parametersJsonSchema: Readonly<Record<string, unknown>>
}

export interface ProposedToolCall {
  readonly name: string
  readonly args: unknown
}

export interface SalesToolExecution {
  readonly name: SalesToolName
  readonly result: unknown
  readonly directMessage?: string
}

export class SalesToolValidationError extends Error {
  constructor(
    readonly reason: 'unsupportedTool' | 'invalidArguments',
    message: string,
  ) {
    super(message)
    this.name = 'SalesToolValidationError'
  }
}

const noArgumentsSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

export const SALES_TOOL_DEFINITIONS: readonly SalesToolDefinition[] = [
  {
    name: 'getOrderCount',
    description: 'Count all persisted orders.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getTotalRevenue',
    description: 'Calculate total final payable revenue across all orders.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getBestSellingOption',
    description:
      'Find the option with the most units, multiplying option quantity by line quantity.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getRevenueByPaymentMethod',
    description: 'Calculate revenue totals for card, bkash, and cash.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getAverageOrderValue',
    description: 'Calculate total revenue divided by order count.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getCouponUsageCount',
    description:
      'Count orders where a coupon discount actually applied, not merely where a code was entered.',
    parametersJsonSchema: noArgumentsSchema,
  },
  {
    name: 'getOrdersByDate',
    description:
      'Count orders on one business date interpreted in Asia/Dhaka time.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Business date in strict YYYY-MM-DD format.',
        },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'explainDataLimitation',
    description:
      'Use when the question requires customer data or other fields absent from stored orders.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          enum: ['customer', 'unsupported'],
        },
      },
      required: ['subject'],
      additionalProperties: false,
    },
  },
]

export function executeSalesTool(
  call: ProposedToolCall,
  orders: readonly StoredOrder[],
): SalesToolExecution {
  if (!isSalesToolName(call.name)) {
    throw new SalesToolValidationError(
      'unsupportedTool',
      `Unsupported sales tool: ${call.name}`,
    )
  }

  if (call.name === 'getOrdersByDate') {
    const args = exactRecord(call.args, ['date'])
    if (typeof args.date !== 'string') {
      throw invalidArguments('getOrdersByDate requires a string date')
    }
    try {
      return { name: call.name, result: getOrdersByDate(orders, args.date) }
    } catch (error) {
      throw invalidArguments(
        error instanceof Error ? error.message : 'Invalid business date',
      )
    }
  }

  if (call.name === 'explainDataLimitation') {
    const args = exactRecord(call.args, ['subject'])
    if (args.subject !== 'customer' && args.subject !== 'unsupported') {
      throw invalidArguments('Unsupported data-limitation subject')
    }
    const message =
      args.subject === 'customer'
        ? 'I cannot determine the best customer because orders do not store customer information.'
        : 'I cannot answer that from the available order data, so I will not guess.'
    return {
      name: call.name,
      result: { supported: false, subject: args.subject, message },
      directMessage: message,
    }
  }

  assertNoArguments(call.name, call.args)
  switch (call.name) {
    case 'getOrderCount':
      return { name: call.name, result: getOrderCount(orders) }
    case 'getTotalRevenue':
      return { name: call.name, result: getTotalRevenue(orders) }
    case 'getBestSellingOption':
      return { name: call.name, result: getBestSellingOption(orders) }
    case 'getRevenueByPaymentMethod':
      return { name: call.name, result: getRevenueByPaymentMethod(orders) }
    case 'getAverageOrderValue':
      return { name: call.name, result: getAverageOrderValue(orders) }
    case 'getCouponUsageCount':
      return { name: call.name, result: getCouponUsageCount(orders) }
  }
}

function isSalesToolName(name: string): name is SalesToolName {
  return (SALES_TOOL_NAMES as readonly string[]).includes(name)
}

function assertNoArguments(name: SalesToolName, value: unknown): void {
  const args = exactRecord(value ?? {}, [])
  if (Object.keys(args).length !== 0) {
    throw invalidArguments(`${name} does not accept arguments`)
  }
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidArguments('Tool arguments must be an object')
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.some((key) => !allowedKeys.includes(key)) ||
    allowedKeys.some((key) => !Object.hasOwn(record, key))
  ) {
    throw invalidArguments('Tool arguments do not match the declared schema')
  }
  return record
}

function invalidArguments(message: string): SalesToolValidationError {
  return new SalesToolValidationError('invalidArguments', message)
}
