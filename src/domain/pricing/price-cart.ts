import type { Menu, Option, OptionGroup } from '../types/menu'
import { poisha, type Poisha } from '../types/money'
import type {
  AppliedDiscount,
  CouponPricingBreakdown,
  LinePricingBreakdown,
  PriceableCart,
  PricingBreakdown,
} from '../types/pricing'
import type {
  GroupThresholdPercentagePromotion,
  Promotion,
  QuantityCheapestFreePromotion,
  ThresholdFixedDiscountPromotion,
  TimedPercentageCouponPromotion,
} from '../types/promotions'
import {
  addPoisha,
  multiplyPoisha,
  percentageOfPoisha,
  roundPoishaToWholeBdt,
  subtractPoisha,
} from './money'

interface IndexedOption {
  readonly option: Option
  readonly group: OptionGroup
}

interface DiscountCandidate extends AppliedDiscount {
  readonly tieBreakPriority: number
  readonly kind: 'fixed' | 'coupon'
}

interface CouponEvaluation {
  readonly breakdown: CouponPricingBreakdown
  readonly candidate: DiscountCandidate | null
}

/** Pure six-step pricing pipeline driven entirely by supplied API data. */
export function priceCart(
  cart: PriceableCart,
  menu: Menu,
  promos: readonly Promotion[],
  serverTime: string,
): PricingBreakdown {
  assertValidServerTime(serverTime)
  const optionIndex = indexOptions(menu.groups)
  const unitPromotions = promos.filter(
    (promotion) => promotion.enabled && promotion.scope === 'unit',
  )
  const lines = cart.items.map((item) => {
    assertCartItemQuantity(item.quantity)
    return priceLine(item, menu, optionIndex, unitPromotions)
  })
  const subtotal = addPoisha(...lines.map(({ lineTotal }) => lineTotal))
  const fixedCandidates = evaluateFixedDiscounts(promos, subtotal)
  const couponEvaluation = evaluateCoupon(
    promos,
    cart.attemptedCouponCode,
    subtotal,
    serverTime,
  )
  const candidates = couponEvaluation.candidate
    ? [...fixedCandidates, couponEvaluation.candidate]
    : fixedCandidates
  const selectedCandidate = selectCartDiscount(candidates)
  const cartDiscount = selectedCandidate
    ? toAppliedDiscount(selectedCandidate)
    : null
  const coupon = finalizeCouponBreakdown(
    couponEvaluation.breakdown,
    selectedCandidate,
  )
  const discountedSubtotal = subtractPoisha(
    subtotal,
    cartDiscount?.amount ?? poisha(0),
  )
  const vat = percentageOfPoisha(
    discountedSubtotal,
    menu.pricingPolicy.tax.percentageBasisPoints,
  )
  const payableBeforeWholeBdtRounding = addPoisha(discountedSubtotal, vat)
  const payable = roundPoishaToWholeBdt(payableBeforeWholeBdtRounding)

  return {
    serverTime,
    lines,
    subtotal,
    cartDiscountCandidates: candidates.map(toAppliedDiscount),
    cartDiscount,
    coupon,
    discountedSubtotal,
    vat,
    payableBeforeWholeBdtRounding,
    payable,
  }
}

function priceLine(
  item: PriceableCart['items'][number],
  menu: Menu,
  optionIndex: ReadonlyMap<string, IndexedOption>,
  unitPromotions: readonly Promotion[],
): LinePricingBreakdown {
  const selections = selectedOptions(item.configuration.selections, optionIndex)
  const optionTotal = addPoisha(
    ...selections.map(({ indexed, quantity }) =>
      multiplyPoisha(indexed.option.price, quantity),
    ),
  )
  const unitSubtotal = addPoisha(menu.product.basePrice, optionTotal)
  const unitDiscounts: AppliedDiscount[] = []

  for (const promotion of unitPromotions) {
    if (promotion.type !== 'quantityCheapestFree') {
      continue
    }

    const discount = calculateCheapestFreeDiscount(promotion, selections)

    if (discount > 0) {
      unitDiscounts.push({
        promotionId: promotion.id,
        name: promotion.name,
        amount: discount,
      })
    }
  }

  const afterCheapestFree = subtractPoisha(
    unitSubtotal,
    addPoisha(...unitDiscounts.map(({ amount }) => amount)),
  )

  for (const promotion of unitPromotions) {
    if (promotion.type !== 'groupThresholdPercentage') {
      continue
    }

    if (meetsGroupThresholds(promotion, selections)) {
      unitDiscounts.push({
        promotionId: promotion.id,
        name: promotion.name,
        amount: percentageOfPoisha(
          afterCheapestFree,
          promotion.percentageBasisPoints,
        ),
      })
    }
  }

  const totalUnitDiscount = addPoisha(
    ...unitDiscounts.map(({ amount }) => amount),
  )
  const unitPrice = subtractPoisha(unitSubtotal, totalUnitDiscount)
  const lineTotal = multiplyPoisha(unitPrice, item.quantity)

  return {
    cartItemId: item.id,
    unitSubtotal,
    unitDiscounts,
    unitPrice,
    quantity: item.quantity,
    lineTotal,
  }
}

function calculateCheapestFreeDiscount(
  promotion: QuantityCheapestFreePromotion,
  selections: readonly {
    readonly indexed: IndexedOption
    readonly quantity: number
  }[],
): Poisha {
  assertPositiveSafeInteger(
    promotion.qualifyingQuantity,
    `${promotion.id} qualifying quantity`,
  )
  assertPositiveSafeInteger(
    promotion.freeQuantity,
    `${promotion.id} free quantity`,
  )
  const eligible = selections
    .filter(({ indexed }) => indexed.group.id === promotion.eligibleGroupId)
    .sort(
      (left, right) => left.indexed.option.price - right.indexed.option.price,
    )
  const eligibleUnitCount = eligible.reduce(
    (total, selection) => safeAdd(total, selection.quantity),
    0,
  )
  let freeUnits = Math.min(
    eligibleUnitCount,
    Math.floor(eligibleUnitCount / promotion.qualifyingQuantity) *
      promotion.freeQuantity,
  )
  let discount = poisha(0)

  for (const selection of eligible) {
    if (freeUnits === 0) {
      break
    }

    const unitsAtThisPrice = Math.min(selection.quantity, freeUnits)
    discount = addPoisha(
      discount,
      multiplyPoisha(selection.indexed.option.price, unitsAtThisPrice),
    )
    freeUnits -= unitsAtThisPrice
  }

  return discount
}

function meetsGroupThresholds(
  promotion: GroupThresholdPercentagePromotion,
  selections: readonly {
    readonly indexed: IndexedOption
    readonly quantity: number
  }[],
): boolean {
  return promotion.conditions.every((condition) => {
    assertNonNegativeSafeInteger(
      condition.minimumQuantity,
      `${promotion.id} minimum quantity`,
    )
    const groupQuantity = selections
      .filter(({ indexed }) => indexed.group.id === condition.groupId)
      .reduce((total, selection) => safeAdd(total, selection.quantity), 0)

    return groupQuantity >= condition.minimumQuantity
  })
}

function evaluateFixedDiscounts(
  promotions: readonly Promotion[],
  subtotal: Poisha,
): DiscountCandidate[] {
  return promotions
    .filter(
      (promotion): promotion is ThresholdFixedDiscountPromotion =>
        promotion.type === 'thresholdFixedDiscount' && promotion.enabled,
    )
    .filter((promotion) => subtotal >= promotion.minimumSubtotal)
    .map((promotion) => ({
      promotionId: promotion.id,
      name: promotion.name,
      amount: poisha(Math.min(promotion.discountAmount, subtotal)),
      tieBreakPriority: promotion.tieBreakPriority,
      kind: 'fixed',
    }))
}

function evaluateCoupon(
  promotions: readonly Promotion[],
  attemptedCode: string | null,
  subtotal: Poisha,
  serverTime: string,
): CouponEvaluation {
  if (attemptedCode === null) {
    return {
      breakdown: couponBreakdown(null, null, false, null, 'notAttempted'),
      candidate: null,
    }
  }

  const promotion = promotions.find(
    (candidate): candidate is TimedPercentageCouponPromotion =>
      candidate.type === 'timedPercentageCoupon' &&
      candidate.couponCode === attemptedCode,
  )

  if (!promotion) {
    return {
      breakdown: couponBreakdown(
        attemptedCode,
        null,
        false,
        null,
        'unknownCode',
      ),
      candidate: null,
    }
  }

  if (!promotion.enabled) {
    return {
      breakdown: couponBreakdown(
        attemptedCode,
        promotion.id,
        false,
        null,
        'unavailable',
      ),
      candidate: null,
    }
  }

  if (!isBeforeLocalCutoff(serverTime, promotion)) {
    return {
      breakdown: couponBreakdown(
        attemptedCode,
        promotion.id,
        false,
        null,
        'outsideTimeWindow',
      ),
      candidate: null,
    }
  }

  const percentageDiscount = percentageOfPoisha(
    subtotal,
    promotion.percentageBasisPoints,
  )
  const amount = poisha(
    Math.min(percentageDiscount, promotion.maximumDiscount, subtotal),
  )
  const candidate: DiscountCandidate = {
    promotionId: promotion.id,
    name: promotion.name,
    amount,
    tieBreakPriority: promotion.tieBreakPriority,
    kind: 'coupon',
  }

  return {
    breakdown: couponBreakdown(
      attemptedCode,
      promotion.id,
      true,
      amount,
      'eligibleNotApplied',
    ),
    candidate,
  }
}

function selectCartDiscount(
  candidates: readonly DiscountCandidate[],
): DiscountCandidate | null {
  return (
    candidates.reduce<DiscountCandidate | null>((selected, candidate) => {
      if (
        !selected ||
        candidate.amount > selected.amount ||
        (candidate.amount === selected.amount &&
          candidate.tieBreakPriority > selected.tieBreakPriority)
      ) {
        return candidate
      }

      return selected
    }, null) ?? null
  )
}

function finalizeCouponBreakdown(
  coupon: CouponPricingBreakdown,
  selectedCandidate: DiscountCandidate | null,
): CouponPricingBreakdown {
  if (!coupon.eligible) {
    return coupon
  }

  const applied =
    selectedCandidate?.kind === 'coupon' &&
    selectedCandidate.promotionId === coupon.matchedPromotionId

  return {
    ...coupon,
    applied,
    status: applied ? 'applied' : 'eligibleNotApplied',
  }
}

function couponBreakdown(
  attemptedCode: string | null,
  matchedPromotionId: string | null,
  eligible: boolean,
  candidateDiscount: Poisha | null,
  status: CouponPricingBreakdown['status'],
): CouponPricingBreakdown {
  return {
    attemptedCode,
    matchedPromotionId,
    eligible,
    applied: false,
    candidateDiscount,
    status,
  }
}

function isBeforeLocalCutoff(
  serverTime: string,
  promotion: TimedPercentageCouponPromotion,
): boolean {
  const serverDate = new Date(serverTime)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: promotion.validBefore.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(serverDate)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  )
  const localSeconds =
    requiredTimePart(parts, 'hour') * 3_600 +
    requiredTimePart(parts, 'minute') * 60 +
    requiredTimePart(parts, 'second')
  const cutoffSeconds = parseLocalTime(promotion.validBefore.localTime)

  return localSeconds < cutoffSeconds
}

function parseLocalTime(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    throw new RangeError(`Invalid local cutoff time: ${value}`)
  }

  const [, hoursText, minutesText, secondsText] = match
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new RangeError(`Invalid local cutoff time: ${value}`)
  }

  return hours * 3_600 + minutes * 60 + seconds
}

function requiredTimePart(
  parts: Readonly<Record<string, number>>,
  key: 'hour' | 'minute' | 'second',
): number {
  const value = parts[key]

  if (value === undefined) {
    throw new RangeError(`Missing ${key} in localized server time`)
  }

  return value
}

function selectedOptions(
  selections: Readonly<Record<string, number>>,
  optionIndex: ReadonlyMap<string, IndexedOption>,
): readonly { readonly indexed: IndexedOption; readonly quantity: number }[] {
  return Object.entries(selections)
    .map(([optionId, quantity]) => {
      const indexed = optionIndex.get(optionId)

      if (!indexed) {
        throw new RangeError(`Unknown option: ${optionId}`)
      }

      assertNonNegativeSafeInteger(quantity, `${indexed.option.name} quantity`)
      return { indexed, quantity }
    })
    .filter(({ quantity }) => quantity > 0)
}

function indexOptions(
  groups: readonly OptionGroup[],
): ReadonlyMap<string, IndexedOption> {
  const index = new Map<string, IndexedOption>()

  for (const group of groups) {
    for (const option of group.options) {
      index.set(option.id, { option, group })
    }
  }

  return index
}

function toAppliedDiscount(candidate: DiscountCandidate): AppliedDiscount {
  return {
    promotionId: candidate.promotionId,
    name: candidate.name,
    amount: candidate.amount,
  }
}

function assertValidServerTime(serverTime: string): void {
  if (Number.isNaN(new Date(serverTime).getTime())) {
    throw new RangeError(`Invalid server time: ${serverTime}`)
  }
}

function assertCartItemQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 3) {
    throw new RangeError('Cart item quantity must be an integer from 1 to 3')
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`)
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}

function safeAdd(left: number, right: number): number {
  const total = left + right
  assertNonNegativeSafeInteger(total, 'Quantity total')
  return total
}
