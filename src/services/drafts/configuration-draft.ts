import { validate } from '../../domain/rules/validate'
import type { ValidationResult } from '../../domain/rules/validation-types'
import {
  calculateConfigurationRequirements,
  checkIngredientAvailability,
  multiplyIngredientRequirements,
} from '../../domain/stock/stock-engine'
import type { Configuration, Menu } from '../../domain/types/menu'
import type {
  AvailabilityResult,
  StockSnapshot,
} from '../../domain/types/stock'

const DRAFT_SCHEMA_VERSION = 1
const DEFAULT_DRAFT_KEY = 'smart-order-builder:configuration-draft:v1'

export interface ConfigurationDraft {
  readonly schemaVersion: typeof DRAFT_SCHEMA_VERSION
  readonly configuration: Configuration
  readonly itemQuantity: number
}

export interface ConfigurationDraftRepository {
  load(): ConfigurationDraft | null
  save(draft: ConfigurationDraft): void
  clear(): void
}

export interface RevalidatedConfigurationDraft {
  readonly draft: ConfigurationDraft
  readonly validation: ValidationResult
  readonly availability: AvailabilityResult
}

export function createConfigurationDraft(
  configuration: Configuration,
  itemQuantity: number,
): ConfigurationDraft {
  if (!Number.isInteger(itemQuantity) || itemQuantity < 1 || itemQuantity > 3) {
    throw new RangeError('Draft item quantity must be between 1 and 3')
  }
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    configuration,
    itemQuantity,
  }
}

export function revalidateConfigurationDraft(
  draft: ConfigurationDraft,
  menu: Menu,
  stock: StockSnapshot,
): RevalidatedConfigurationDraft | null {
  const validation = validate(draft.configuration, menu.groups, menu.rules)
  const malformedConfiguration = validation.violations.some(
    ({ source }) => source === 'configuration',
  )
  if (malformedConfiguration) return null

  const allocation = multiplyIngredientRequirements(
    calculateConfigurationRequirements(draft.configuration, menu.groups),
    draft.itemQuantity,
  )
  return {
    draft,
    validation,
    availability: checkIngredientAvailability(stock, allocation),
  }
}

export function createLocalStorageDraftRepository(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  key = DEFAULT_DRAFT_KEY,
): ConfigurationDraftRepository {
  return {
    load() {
      const serialized = storage.getItem(key)
      if (!serialized) return null
      try {
        return parseDraft(JSON.parse(serialized) as unknown)
      } catch {
        storage.removeItem(key)
        return null
      }
    },
    save(draft) {
      storage.setItem(key, JSON.stringify(draft))
    },
    clear() {
      storage.removeItem(key)
    },
  }
}

export function createBrowserDraftRepository(): ConfigurationDraftRepository {
  if (typeof globalThis.localStorage === 'undefined') {
    let draft: ConfigurationDraft | null = null
    return {
      load: () => draft,
      save: (next) => {
        draft = structuredClone(next)
      },
      clear: () => {
        draft = null
      },
    }
  }
  return createLocalStorageDraftRepository(globalThis.localStorage)
}

function parseDraft(value: unknown): ConfigurationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Draft must be an object')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== DRAFT_SCHEMA_VERSION) {
    throw new Error('Unsupported draft schema')
  }
  if (
    !Number.isInteger(candidate.itemQuantity) ||
    Number(candidate.itemQuantity) < 1 ||
    Number(candidate.itemQuantity) > 3
  ) {
    throw new Error('Invalid draft item quantity')
  }
  const configuration = candidate.configuration
  if (
    !configuration ||
    typeof configuration !== 'object' ||
    Array.isArray(configuration)
  ) {
    throw new Error('Invalid draft configuration')
  }
  const selections = (configuration as Record<string, unknown>).selections
  if (
    !selections ||
    typeof selections !== 'object' ||
    Array.isArray(selections)
  ) {
    throw new Error('Invalid draft selections')
  }
  const parsedSelections: Record<string, number> = {}
  for (const [optionId, quantity] of Object.entries(selections)) {
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 0) {
      throw new Error(`Invalid draft quantity for ${optionId}`)
    }
    if (Number(quantity) > 0) parsedSelections[optionId] = Number(quantity)
  }
  return createConfigurationDraft(
    { selections: parsedSelections },
    Number(candidate.itemQuantity),
  )
}
