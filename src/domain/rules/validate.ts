import type { Configuration, Option, OptionGroup } from '../types/menu'
import type { CrossGroupRule, OverrideLimitRule } from '../types/rules'
import type {
  GroupViolation,
  RuleViolation,
  ValidationResult,
  ValidationViolation,
} from './validation-types'

interface IndexedOption {
  readonly option: Option
  readonly group: OptionGroup
}

interface ActiveOverride {
  readonly rule: OverrideLimitRule
  readonly triggerName: string
}

/**
 * Validates one configuration using only the supplied menu definitions.
 *
 * The function is pure: it performs no I/O, does not mutate its arguments,
 * and has no knowledge of assessment-specific option IDs.
 */
export function validate(
  config: Configuration,
  groups: readonly OptionGroup[],
  rules: readonly CrossGroupRule[],
): ValidationResult {
  const optionIndex = indexOptions(groups)
  const violations: ValidationViolation[] = []
  const quantities = validateConfiguration(config, optionIndex, violations)
  const activeOverrides = findActiveOverrides(rules, quantities, optionIndex)

  for (const group of groups) {
    validateGroup(group, quantities, activeOverrides.get(group.id), violations)
  }

  for (const rule of rules) {
    if (rule.type === 'requires') {
      validateRequiresRule(rule, quantities, optionIndex, violations)
    } else if (rule.type === 'excludes') {
      validateExcludesRule(rule, quantities, optionIndex, violations)
    } else if (rule.type !== 'overrideLimit') {
      const exhaustiveCheck: never = rule
      return exhaustiveCheck
    }
  }

  const isValid = violations.length === 0

  return {
    isValid,
    canAddToCart: isValid,
    violations,
  }
}

function indexOptions(
  groups: readonly OptionGroup[],
): Map<string, IndexedOption> {
  const index = new Map<string, IndexedOption>()

  for (const group of groups) {
    for (const option of group.options) {
      index.set(option.id, { option, group })
    }
  }

  return index
}

function validateConfiguration(
  config: Configuration,
  optionIndex: ReadonlyMap<string, IndexedOption>,
  violations: ValidationViolation[],
): ReadonlyMap<string, number> {
  const quantities = new Map<string, number>()

  for (const [optionId, quantity] of Object.entries(config.selections)) {
    const indexedOption = optionIndex.get(optionId)

    if (!indexedOption) {
      violations.push({
        source: 'configuration',
        code: 'unknownOption',
        id: optionId,
        optionId,
        message: `Unknown option: ${optionId}`,
      })
      continue
    }

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      violations.push({
        source: 'configuration',
        code: 'invalidQuantity',
        id: optionId,
        optionId,
        message: `${indexedOption.option.name} quantity must be a non-negative integer`,
      })
      continue
    }

    quantities.set(optionId, quantity)
  }

  return quantities
}

function findActiveOverrides(
  rules: readonly CrossGroupRule[],
  quantities: ReadonlyMap<string, number>,
  optionIndex: ReadonlyMap<string, IndexedOption>,
): ReadonlyMap<string, ActiveOverride> {
  const overrides = new Map<string, ActiveOverride>()

  for (const rule of rules) {
    if (
      rule.type !== 'overrideLimit' ||
      !isSelected(rule.triggerOptionId, quantities)
    ) {
      continue
    }

    overrides.set(rule.targetGroupId, {
      rule,
      triggerName: optionName(rule.triggerOptionId, optionIndex),
    })
  }

  return overrides
}

function validateGroup(
  group: OptionGroup,
  quantities: ReadonlyMap<string, number>,
  activeOverride: ActiveOverride | undefined,
  violations: ValidationViolation[],
): void {
  const selectedOptions = group.options
    .map((option) => ({ option, quantity: quantities.get(option.id) ?? 0 }))
    .filter(({ quantity }) => quantity > 0)
  const total = selectedOptions.reduce(
    (sum, selection) => sum + selection.quantity,
    0,
  )
  const groupName = group.name.toLocaleLowerCase()
  const { constraints } = group

  if (total < constraints.min) {
    violations.push(
      groupViolation(
        group,
        'min',
        `${groupName} requires at least ${constraints.min} ${pluralize('selection', constraints.min)}`,
      ),
    )
  }

  const effectiveMax = activeOverride?.rule.override.max ?? constraints.max

  if (effectiveMax !== undefined && total > effectiveMax) {
    const message = activeOverride
      ? `${groupName} max is ${effectiveMax} when ${activeOverride.triggerName} is selected (override wins)`
      : `${groupName} allows at most ${effectiveMax} ${pluralize('selection', effectiveMax)}`

    violations.push({
      ...groupViolation(group, 'max', message),
      ...(activeOverride ? { appliedRuleId: activeOverride.rule.id } : {}),
    })
  }

  if (constraints.step !== undefined && total % constraints.step !== 0) {
    const message =
      effectiveMax === undefined
        ? `${groupName} total must be a multiple of ${constraints.step}`
        : `${groupName} total must be ${constraints.min}–${effectiveMax} in steps of ${constraints.step}`

    violations.push(groupViolation(group, 'step', message))
  }

  if (
    constraints.maxDistinct !== undefined &&
    selectedOptions.length > constraints.maxDistinct
  ) {
    violations.push(
      groupViolation(
        group,
        'maxDistinct',
        `${groupName} allows at most ${constraints.maxDistinct} distinct ${pluralize('option', constraints.maxDistinct)}`,
      ),
    )
  }

  if (constraints.maxPerOption !== undefined) {
    for (const { option, quantity } of selectedOptions) {
      if (quantity <= constraints.maxPerOption) {
        continue
      }

      violations.push({
        ...groupViolation(
          group,
          'maxPerOption',
          `${option.name} quantity cannot exceed ${constraints.maxPerOption} in ${groupName}`,
        ),
        optionId: option.id,
      })
    }
  }
}

function validateRequiresRule(
  rule: Extract<CrossGroupRule, { readonly type: 'requires' }>,
  quantities: ReadonlyMap<string, number>,
  optionIndex: ReadonlyMap<string, IndexedOption>,
  violations: ValidationViolation[],
): void {
  if (
    !isSelected(rule.sourceOptionId, quantities) ||
    rule.anyOfOptionIds.some((optionId) => isSelected(optionId, quantities))
  ) {
    return
  }

  violations.push(
    ruleViolation(
      rule.id,
      'requires',
      rule.sourceOptionId,
      rule.anyOfOptionIds,
      `${optionName(rule.sourceOptionId, optionIndex)} requires ${joinWithOr(
        rule.anyOfOptionIds.map((optionId) =>
          optionName(optionId, optionIndex),
        ),
      )}`,
    ),
  )
}

function validateExcludesRule(
  rule: Extract<CrossGroupRule, { readonly type: 'excludes' }>,
  quantities: ReadonlyMap<string, number>,
  optionIndex: ReadonlyMap<string, IndexedOption>,
  violations: ValidationViolation[],
): void {
  if (!isSelected(rule.sourceOptionId, quantities)) {
    return
  }

  const conflicts = rule.excludedOptionIds.filter((optionId) =>
    isSelected(optionId, quantities),
  )

  if (conflicts.length === 0) {
    return
  }

  violations.push(
    ruleViolation(
      rule.id,
      'excludes',
      rule.sourceOptionId,
      conflicts,
      `${optionName(rule.sourceOptionId, optionIndex)} cannot be combined with ${joinWithOr(
        conflicts.map((optionId) => optionName(optionId, optionIndex)),
      )}`,
    ),
  )
}

function groupViolation(
  group: OptionGroup,
  code: GroupViolation['code'],
  message: string,
): GroupViolation {
  return {
    source: 'group',
    code,
    id: group.id,
    groupId: group.id,
    message,
  }
}

function ruleViolation(
  ruleId: string,
  code: RuleViolation['code'],
  sourceOptionId: string,
  conflictingOptionIds: readonly string[],
  message: string,
): RuleViolation {
  return {
    source: 'rule',
    code,
    id: ruleId,
    ruleId,
    sourceOptionId,
    conflictingOptionIds,
    message,
  }
}

function isSelected(
  optionId: string,
  quantities: ReadonlyMap<string, number>,
): boolean {
  return (quantities.get(optionId) ?? 0) > 0
}

function optionName(
  optionId: string,
  optionIndex: ReadonlyMap<string, IndexedOption>,
): string {
  return optionIndex.get(optionId)?.option.name ?? optionId
}

function joinWithOr(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? ''
  }

  return `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}
