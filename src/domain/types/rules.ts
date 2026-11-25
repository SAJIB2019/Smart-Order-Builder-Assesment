export interface GroupConstraints {
  readonly min: number
  readonly max?: number
  readonly step?: number
  readonly maxDistinct?: number
  readonly maxPerOption?: number
}

interface BaseCrossGroupRule {
  readonly id: string
}

export interface RequiresRule extends BaseCrossGroupRule {
  readonly type: 'requires'
  readonly sourceOptionId: string
  readonly anyOfOptionIds: readonly string[]
}

export interface ExcludesRule extends BaseCrossGroupRule {
  readonly type: 'excludes'
  readonly sourceOptionId: string
  readonly excludedOptionIds: readonly string[]
}

export interface OverrideLimitRule extends BaseCrossGroupRule {
  readonly type: 'overrideLimit'
  readonly triggerOptionId: string
  readonly targetGroupId: string
  readonly override: { readonly max: number }
}

export type CrossGroupRule = RequiresRule | ExcludesRule | OverrideLimitRule
