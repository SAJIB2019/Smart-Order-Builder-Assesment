import {
  ORDER_CURRENCY,
  ORDER_MONEY_UNIT,
  ORDERS_EXPORT_SCHEMA_VERSION,
  type OrdersExport,
  type StoredOrder,
} from '../types/order'

export function createOrdersExport(
  orders: readonly StoredOrder[],
): OrdersExport {
  return {
    schemaVersion: ORDERS_EXPORT_SCHEMA_VERSION,
    currency: ORDER_CURRENCY,
    moneyUnit: ORDER_MONEY_UNIT,
    orders,
  }
}

export function serializeOrdersExport(value: OrdersExport): string {
  return JSON.stringify(value, null, 2)
}
