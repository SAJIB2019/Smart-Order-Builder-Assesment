import { describe, expect, it } from 'vitest'

import { validate } from '../../src/domain/rules/validate'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'

const { groups, rules } = buildYourBreakfastFixture.menu

describe('Part A official acceptance tests', () => {
  it('TC-01 blocks Scrambled x3 because the eggs total violates step 2', () => {
    const result = validate(
      { selections: { toast: 1, scrambled: 3, sausage: 1 } },
      groups,
      rules,
    )

    expect(result.canAddToCart).toBe(false)
    expect(result.violations).toEqual([
      {
        source: 'group',
        code: 'step',
        id: 'eggs',
        groupId: 'eggs',
        message: 'eggs total must be 2–6 in steps of 2',
      },
    ])
  })

  it('TC-02 blocks Croissant with three Extras using the overriding maximum', () => {
    const result = validate(
      {
        selections: {
          croissant: 1,
          fried: 2,
          sausage: 1,
          hashbrown: 1,
          mushroom: 1,
          beans: 1,
        },
      },
      groups,
      rules,
    )

    expect(result.canAddToCart).toBe(false)
    expect(result.violations).toEqual([
      {
        source: 'group',
        code: 'max',
        id: 'extras',
        groupId: 'extras',
        appliedRuleId: 'R3',
        message: 'extras max is 2 when Croissant is selected (override wins)',
      },
    ])
  })

  it('TC-03 blocks Hollandaise when Fried is the only selected egg option', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          fried: 2,
          sausage: 1,
          hollandaise: 1,
        },
      },
      groups,
      rules,
    )

    expect(result.canAddToCart).toBe(false)
    expect(result.violations).toEqual([
      {
        source: 'rule',
        code: 'requires',
        id: 'R1',
        ruleId: 'R1',
        sourceOptionId: 'hollandaise',
        conflictingOptionIds: ['scrambled', 'omelette'],
        message: 'Hollandaise requires Scrambled or Omelette',
      },
    ])
  })

  it('TC-04 lists both exclusion violations when both pairs exist', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          scrambled: 2,
          tofu: 1,
          bacon: 1,
          chili: 1,
          hollandaise: 1,
        },
      },
      groups,
      rules,
    )

    expect(result.canAddToCart).toBe(false)
    expect(result.violations).toEqual([
      {
        source: 'rule',
        code: 'excludes',
        id: 'R2',
        ruleId: 'R2',
        sourceOptionId: 'tofu',
        conflictingOptionIds: ['bacon'],
        message: 'Tofu cannot be combined with Beef Bacon',
      },
      {
        source: 'rule',
        code: 'excludes',
        id: 'R4',
        ruleId: 'R4',
        sourceOptionId: 'chili',
        conflictingOptionIds: ['hollandaise'],
        message: 'Chili cannot be combined with Hollandaise',
      },
    ])
  })
})
