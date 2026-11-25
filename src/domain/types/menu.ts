import type { Poisha } from './money'
import type { Promotion } from './promotions'
import type { CrossGroupRule, GroupConstraints } from './rules'

export interface Product {
  readonly id: string
  readonly name: string
  readonly basePrice: Poisha
}

export interface Ingredient {
  readonly id: string
  readonly name: string
}

export interface IngredientConsumption {
  readonly ingredientId: string
  readonly quantity: number
}

export interface Option {
  readonly id: string
  readonly name: string
  readonly price: Poisha
  readonly ingredientConsumption: readonly IngredientConsumption[]
}

export interface OptionGroup {
  readonly id: string
  readonly name: string
  readonly constraints: GroupConstraints
  readonly options: readonly Option[]
}

export interface Configuration {
  readonly selections: Readonly<Record<string, number>>
}

export interface PricingPolicy {
  readonly tax: {
    readonly id: string
    readonly name: string
    readonly percentageBasisPoints: number
  }
  readonly percentageRounding: 'halfUpNearestPoisha'
  readonly finalPayableRounding: 'halfUpWholeBdt'
}

export interface Menu {
  readonly product: Product
  readonly ingredients: readonly Ingredient[]
  readonly groups: readonly OptionGroup[]
  readonly rules: readonly CrossGroupRule[]
  readonly promotions: readonly Promotion[]
  readonly pricingPolicy: PricingPolicy
}
