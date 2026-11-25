import { describe, expect, it } from 'vitest'

import { validate } from '../../../../src/domain/rules/validate'
import type { OptionGroup } from '../../../../src/domain/types/menu'
import { poisha } from '../../../../src/domain/types/money'
import type { CrossGroupRule } from '../../../../src/domain/types/rules'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'

const { groups, rules } = buildYourBreakfastFixture.menu

describe('validate', () => {
  it('accepts a valid configuration and exposes the Add to Cart state', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          scrambled: 2,
          sausage: 1,
          ketchup: 1,
        },
      },
      groups,
      rules,
    )

    expect(result).toEqual({
      isValid: true,
      canAddToCart: true,
      violations: [],
    })
  })

  it('reports every group below its minimum', () => {
    const result = validate({ selections: {} }, groups, rules)

    expect(result.isValid).toBe(false)
    expect(result.canAddToCart).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'group', code: 'min', id: 'bread' }),
        expect.objectContaining({ source: 'group', code: 'min', id: 'eggs' }),
        expect.objectContaining({
          source: 'group',
          code: 'min',
          id: 'protein',
        }),
      ]),
    )
  })

  it('reports a group above its maximum', () => {
    const result = validate(
      { selections: { toast: 1, fried: 2, sausage: 4 } },
      groups,
      rules,
    )

    expect(result.violations).toContainEqual(
      expect.objectContaining({ source: 'group', code: 'max', id: 'protein' }),
    )
  })

  it('enforces step as a multiple of the group total', () => {
    const result = validate(
      { selections: { toast: 1, scrambled: 3, sausage: 1 } },
      groups,
      rules,
    )

    expect(result.violations).toContainEqual(
      expect.objectContaining({ source: 'group', code: 'step', id: 'eggs' }),
    )
  })

  it('enforces the maximum number of distinct options', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          fried: 2,
          sausage: 1,
          ketchup: 1,
          hollandaise: 1,
          chili: 1,
        },
      },
      groups,
      rules,
    )

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        source: 'group',
        code: 'maxDistinct',
        id: 'sauce',
      }),
    )
  })

  it('enforces the maximum quantity per option', () => {
    const result = validate(
      {
        selections: { toast: 1, fried: 2, sausage: 1, ketchup: 2 },
      },
      groups,
      rules,
    )

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        source: 'group',
        code: 'maxPerOption',
        id: 'sauce',
        optionId: 'ketchup',
      }),
    )
  })

  it('enforces requires rules', () => {
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

    expect(result.violations).toContainEqual(
      expect.objectContaining({ source: 'rule', code: 'requires', id: 'R1' }),
    )
  })

  it('enforces excludes rules', () => {
    const result = validate(
      {
        selections: { toast: 1, fried: 2, tofu: 1, bacon: 1 },
      },
      groups,
      rules,
    )

    expect(result.violations).toContainEqual(
      expect.objectContaining({ source: 'rule', code: 'excludes', id: 'R2' }),
    )
  })

  it('uses an active conditional maximum instead of the original group maximum', () => {
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

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        source: 'group',
        code: 'max',
        id: 'extras',
        appliedRuleId: 'R3',
      }),
    )
  })

  it('returns multiple simultaneous violations without short-circuiting', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          scrambled: 3,
          tofu: 1,
          bacon: 1,
          chili: 1,
          hollandaise: 1,
          unknown: 1,
        },
      },
      groups,
      rules,
    )

    expect(result.violations.map(({ id }) => id)).toEqual([
      'unknown',
      'eggs',
      'R2',
      'R4',
    ])
  })

  it('accepts inclusive minimum and maximum boundary values', () => {
    const minimum = validate(
      { selections: { toast: 1, fried: 2, sausage: 1 } },
      groups,
      rules,
    )
    const maximum = validate(
      {
        selections: {
          toast: 1,
          fried: 6,
          sausage: 1,
          bacon: 1,
          tofu: 1,
          hashbrown: 1,
          mushroom: 1,
          beans: 1,
          cheese: 1,
          ketchup: 1,
          chili: 1,
        },
      },
      groups,
      [],
    )

    expect(minimum.isValid).toBe(true)
    expect(maximum.isValid).toBe(true)
  })

  it('rejects unknown option IDs and invalid runtime quantities at the boundary', () => {
    const result = validate(
      {
        selections: {
          toast: 1,
          fried: 2,
          sausage: 1,
          missingFromMenu: 1,
          ketchup: -1,
          chili: 1.5,
        },
      },
      groups,
      rules,
    )

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'configuration',
          code: 'unknownOption',
          id: 'missingFromMenu',
        }),
        expect.objectContaining({
          source: 'configuration',
          code: 'invalidQuantity',
          id: 'ketchup',
        }),
        expect.objectContaining({
          source: 'configuration',
          code: 'invalidQuantity',
          id: 'chili',
        }),
      ]),
    )
  })

  it('interprets a modified menu fixture with entirely different option IDs', () => {
    const alternateGroups: readonly OptionGroup[] = [
      {
        id: 'foundation-v2',
        name: 'Foundation',
        constraints: { min: 1, max: 1 },
        options: [option('foundation-nimbus', 'Nimbus')],
      },
      {
        id: 'additions-v2',
        name: 'Additions',
        constraints: { min: 0, max: 4 },
        options: [
          option('addition-orbit', 'Orbit'),
          option('addition-comet', 'Comet'),
        ],
      },
    ]
    const alternateRules: readonly CrossGroupRule[] = [
      {
        id: 'limit-v2',
        type: 'overrideLimit',
        triggerOptionId: 'foundation-nimbus',
        targetGroupId: 'additions-v2',
        override: { max: 1 },
      },
      {
        id: 'need-v2',
        type: 'requires',
        sourceOptionId: 'addition-comet',
        anyOfOptionIds: ['addition-orbit'],
      },
    ]

    const result = validate(
      {
        selections: {
          'foundation-nimbus': 1,
          'addition-comet': 2,
        },
      },
      alternateGroups,
      alternateRules,
    )

    expect(result.violations).toEqual([
      expect.objectContaining({
        id: 'additions-v2',
        appliedRuleId: 'limit-v2',
      }),
      expect.objectContaining({ id: 'need-v2' }),
    ])
    expect(result.violations.map(({ message }) => message)).toEqual([
      'additions max is 1 when Nimbus is selected (override wins)',
      'Comet requires Orbit',
    ])
  })
})

function option(id: string, name: string): OptionGroup['options'][number] {
  return {
    id,
    name,
    price: poisha(0),
    ingredientConsumption: [],
  }
}
