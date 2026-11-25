import type { Menu } from '../types/menu'
import type { SeedOrdersFile, StoredOrder } from '../types/order'
import { createStoredOrder } from './stored-order'

/** Prices source seed orders without consuming today's inventory. */
export function priceSeedOrders(
  seedFile: SeedOrdersFile,
  menu: Menu,
): readonly StoredOrder[] {
  return seedFile.orders.map((seedOrder) =>
    createStoredOrder({
      id: seedOrder.id,
      createdAt: seedOrder.createdAt,
      paymentMethod: seedOrder.paymentMethod,
      attemptedCouponCode: seedOrder.couponCode,
      menu,
      lines: seedOrder.lines.map((line, index) => ({
        id: `${seedOrder.id}-line-${index + 1}`,
        quantity: line.qty,
        configuration: { selections: line.options },
      })),
    }),
  )
}
