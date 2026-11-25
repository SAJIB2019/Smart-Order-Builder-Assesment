import type { Menu } from '../../domain/types/menu'
import type { StockSnapshot } from '../../domain/types/stock'

export interface MockApiFixture {
  readonly menu: Menu
  readonly stock: StockSnapshot
}
