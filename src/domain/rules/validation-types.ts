export type ConfigurationViolationCode = 'unknownOption' | 'invalidQuantity'

export type GroupViolationCode =
  'min' | 'max' | 'step' | 'maxDistinct' | 'maxPerOption'

export type RuleViolationCode = 'requires' | 'excludes'

interface BaseViolation {
  /** Stable identifier for the configuration entry, group, or rule. */
  readonly id: string
  readonly message: string
}

export interface ConfigurationViolation extends BaseViolation {
  readonly source: 'configuration'
  readonly code: ConfigurationViolationCode
  readonly optionId: string
}

export interface GroupViolation extends BaseViolation {
  readonly source: 'group'
  readonly code: GroupViolationCode
  readonly groupId: string
  readonly optionId?: string
  /** Present when an overrideLimit rule supplied the effective maximum. */
  readonly appliedRuleId?: string
}

export interface RuleViolation extends BaseViolation {
  readonly source: 'rule'
  readonly code: RuleViolationCode
  readonly ruleId: string
  readonly sourceOptionId: string
  readonly conflictingOptionIds: readonly string[]
}

export type ValidationViolation =
  ConfigurationViolation | GroupViolation | RuleViolation

/** UI-ready output: Add to Cart is allowed only when every check passes. */
export interface ValidationResult {
  readonly isValid: boolean
  readonly canAddToCart: boolean
  readonly violations: readonly ValidationViolation[]
}
