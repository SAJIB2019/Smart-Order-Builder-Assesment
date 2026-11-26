import { describe, expect, it } from 'vitest'

import { priceSeedOrders } from '../src/domain/orders/seed-orders'
import { priceCart } from '../src/domain/pricing/price-cart'
import { validate } from '../src/domain/rules/validate'
import {
  getBestSellingOption,
  getCouponUsageCount,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from '../src/domain/stats/sales-stats'
import {
  applyStockAllocation,
  calculateConfigurationRequirements,
  checkIngredientAvailability,
} from '../src/domain/stock/stock-engine'
import type { Configuration, Menu, OptionGroup } from '../src/domain/types/menu'
import type { Poisha } from '../src/domain/types/money'
import type { PaymentMethod, StoredOrder } from '../src/domain/types/order'
import type { PricingBreakdown } from '../src/domain/types/pricing'
import type { StockSnapshot } from '../src/domain/types/stock'
import { buildYourBreakfastFixture } from '../src/mocks/fixtures/build-your-breakfast'

const QUESTIONS = {
  q1: 'Starting from an empty cart, what is the maximum number of item C you can add? Which ingredient limits it?',
  q2: 'What is the cheapest valid configuration and its unit price?',
  q3: 'Cart = A x3, server time 10:30. Give subtotal, chosen discount, VAT and payable. Then the same at 11:30.',
  q4: 'After TC-10, what is the payable at 11:30?',
  q5: 'The payable of each seed order, and the total revenue of all six.',
  q6: 'The best-selling option across the seed orders, counted in units (line quantity x option quantity).',
  q7: 'Which payment method brought in the most revenue in the seed orders?',
  q8: 'How many seed orders actually received the MORNING15 discount? Explain every order that has the code but did not get the discount.',
} as const

const fixture = buildYourBreakfastFixture
const menu = fixture.menu
const ANSWER_DATE = '2026-11-25'

describe('Section 10 computed answers', () => {
  it('prints Q1 through Q8 from the official fixture and domain engines', () => {
    const answers = computeAnswers()

    expect(Object.keys(QUESTIONS)).toHaveLength(8)
    expect(answers.seedOrders).toHaveLength(fixture.seedOrders.orders.length)
    expect(answers.cheapest.validConfigurationsEvaluated).toBeGreaterThan(0)
    expect(answers.q1.maximumItems).toBeGreaterThan(0)
    expect(answers.q6).not.toBeNull()

    console.log('\n--- BEGIN COMPUTED ANSWERS ---\n')
    console.log(renderAnswersMarkdown(answers))
    console.log('\n--- END COMPUTED ANSWERS ---\n')
  }, 20_000)
})

interface ComputedAnswers {
  readonly q1: {
    readonly maximumItems: number
    readonly limitingIngredients: readonly string[]
    readonly nextItemShortages: readonly string[]
  }
  readonly cheapest: {
    readonly candidateConfigurationsEvaluated: number
    readonly validConfigurationsEvaluated: number
    readonly unitPrice: Poisha
    readonly configurations: readonly Configuration[]
  }
  readonly q3Morning: PricingBreakdown
  readonly q3Late: PricingBreakdown
  readonly q4: PricingBreakdown
  readonly seedOrders: readonly StoredOrder[]
  readonly totalRevenue: Poisha
  readonly q6: ReturnType<typeof getBestSellingOption>
  readonly q7: {
    readonly paymentMethod: PaymentMethod
    readonly revenue: Poisha
  }
  readonly q8Count: number
  readonly couponAttempts: readonly StoredOrder[]
}

function computeAnswers(): ComputedAnswers {
  const q1 = computeMaximumItemC()
  const cheapest = findCheapestValidConfigurations(menu, fixture.stock)
  const q3Morning = priceCart(
    cart(
      [{ id: 'A', configuration: configurationA(), quantity: 3 }],
      'MORNING15',
    ),
    menu,
    menu.promotions,
    `${ANSWER_DATE}T10:30:00+06:00`,
  )
  const q3Late = priceCart(
    cart(
      [{ id: 'A', configuration: configurationA(), quantity: 3 }],
      'MORNING15',
    ),
    menu,
    menu.promotions,
    `${ANSWER_DATE}T11:30:00+06:00`,
  )
  const q4 = priceCart(
    cart([
      {
        id: 'B-after-TC-10',
        configuration: configurationBAfterTc10(),
        quantity: 1,
      },
      { id: 'C', configuration: configurationC(), quantity: 2 },
    ]),
    menu,
    menu.promotions,
    `${ANSWER_DATE}T11:30:00+06:00`,
  )
  const seedOrders = priceSeedOrders(fixture.seedOrders, menu)
  const totalRevenue = getTotalRevenue(seedOrders).totalRevenuePoisha
  const q6 = getBestSellingOption(seedOrders)
  const revenueByPayment = getRevenueByPaymentMethod(seedOrders)
  const paymentRevenue: Readonly<Record<PaymentMethod, Poisha>> = {
    card: revenueByPayment.cardPoisha,
    bkash: revenueByPayment.bkashPoisha,
    cash: revenueByPayment.cashPoisha,
  }
  const q7 = (
    Object.entries(paymentRevenue) as [PaymentMethod, Poisha][]
  ).reduce((best, current) => (current[1] > best[1] ? current : best))
  const couponAttempts = seedOrders.filter(
    ({ coupon }) => coupon.attemptedCode === 'MORNING15',
  )

  return {
    q1,
    cheapest,
    q3Morning,
    q3Late,
    q4,
    seedOrders,
    totalRevenue,
    q6,
    q7: { paymentMethod: q7[0], revenue: q7[1] },
    q8Count: getCouponUsageCount(seedOrders).couponUsageCount,
    couponAttempts,
  }
}

function computeMaximumItemC(): ComputedAnswers['q1'] {
  const perItem = calculateConfigurationRequirements(
    configurationC(),
    menu.groups,
  )
  let remaining = fixture.stock
  let maximumItems = 0

  while (true) {
    const allocation = applyStockAllocation(remaining, perItem)
    if (allocation.status !== 'applied') break
    remaining = allocation.stock
    maximumItems += 1
  }

  const nextAvailability = checkIngredientAvailability(remaining, perItem)
  if (nextAvailability.status !== 'insufficientStock') {
    throw new Error('Expected the next item C to exceed finite stock')
  }
  const ingredientNames = new Map(
    menu.ingredients.map(({ id, name }) => [id, name]),
  )

  return {
    maximumItems,
    limitingIngredients: nextAvailability.shortages.map(
      ({ ingredientId }) => ingredientNames.get(ingredientId) ?? ingredientId,
    ),
    nextItemShortages: nextAvailability.shortages.map(
      ({ ingredientId, missing }) =>
        `${ingredientNames.get(ingredientId) ?? ingredientId}: ${missing}`,
    ),
  }
}

function findCheapestValidConfigurations(
  targetMenu: Menu,
  stock: StockSnapshot,
): ComputedAnswers['cheapest'] {
  const variantsByGroup = targetMenu.groups.map(enumerateGroupSelections)
  let candidateConfigurationsEvaluated = 0
  let validConfigurationsEvaluated = 0
  let cheapestUnitPrice: Poisha | null = null
  let cheapestConfigurations: Configuration[] = []

  visitCartesian(variantsByGroup, 0, {}, (selections) => {
    candidateConfigurationsEvaluated += 1
    const configuration = { selections }
    if (!validate(configuration, targetMenu.groups, targetMenu.rules).isValid) {
      return
    }
    const requirements = calculateConfigurationRequirements(
      configuration,
      targetMenu.groups,
    )
    if (
      checkIngredientAvailability(stock, requirements).status !== 'available'
    ) {
      return
    }

    validConfigurationsEvaluated += 1
    const pricing = priceCart(
      cart([{ id: 'candidate', configuration, quantity: 1 }]),
      targetMenu,
      targetMenu.promotions,
      `${ANSWER_DATE}T12:00:00+06:00`,
    )
    const unitPrice = pricing.lines[0]?.unitPrice
    if (unitPrice === undefined) throw new Error('Candidate price is missing')

    if (cheapestUnitPrice === null || unitPrice < cheapestUnitPrice) {
      cheapestUnitPrice = unitPrice
      cheapestConfigurations = [configuration]
    } else if (unitPrice === cheapestUnitPrice) {
      cheapestConfigurations.push(configuration)
    }
  })

  if (cheapestUnitPrice === null || cheapestConfigurations.length === 0) {
    throw new Error('No valid configuration was found')
  }

  return {
    candidateConfigurationsEvaluated,
    validConfigurationsEvaluated,
    unitPrice: cheapestUnitPrice,
    configurations: cheapestConfigurations,
  }
}

function enumerateGroupSelections(
  group: OptionGroup,
): readonly Readonly<Record<string, number>>[] {
  const selections: Record<string, number>[] = []
  const perOptionMaximum =
    group.constraints.maxPerOption ?? group.constraints.max ?? 0

  visitOptionQuantities(group, 0, {}, perOptionMaximum, (candidate) => {
    if (validate({ selections: candidate }, [group], []).isValid) {
      selections.push(candidate)
    }
  })

  return selections
}

function visitOptionQuantities(
  group: OptionGroup,
  optionIndex: number,
  selections: Readonly<Record<string, number>>,
  maximum: number,
  visit: (selections: Record<string, number>) => void,
): void {
  const option = group.options[optionIndex]
  if (!option) {
    visit({ ...selections })
    return
  }

  for (let quantity = 0; quantity <= maximum; quantity += 1) {
    visitOptionQuantities(
      group,
      optionIndex + 1,
      quantity === 0 ? selections : { ...selections, [option.id]: quantity },
      maximum,
      visit,
    )
  }
}

function visitCartesian(
  variantsByGroup: readonly (readonly Readonly<Record<string, number>>[])[],
  groupIndex: number,
  selections: Readonly<Record<string, number>>,
  visit: (selections: Record<string, number>) => void,
): void {
  const variants = variantsByGroup[groupIndex]
  if (!variants) {
    visit({ ...selections })
    return
  }

  for (const variant of variants) {
    visitCartesian(
      variantsByGroup,
      groupIndex + 1,
      { ...selections, ...variant },
      visit,
    )
  }
}

function renderAnswersMarkdown(answers: ComputedAnswers): string {
  const lines: string[] = [
    '# Smart Order Builder — Computed Answers',
    '',
    'Generated by `npm run answers` from the official fixture, supplied seed file, and production domain engines.',
    '',
    `## Q1. ${QUESTIONS.q1}`,
    '',
    `**Answer:** ${answers.q1.maximumItems} item C configurations. **Limiting ingredient:** ${answers.q1.limitingIngredients.join(', ')}.`,
    '',
    `The next item is blocked by ${answers.q1.nextItemShortages.join(', ')} unit(s).`,
    '',
    `## Q2. ${QUESTIONS.q2}`,
    '',
    `**Answer:** ${formatConfiguration(answers.cheapest.configurations[0] ?? { selections: {} })} = **${formatBdt(answers.cheapest.unitPrice)} BDT**.`,
    '',
    `The exhaustive search evaluated ${answers.cheapest.candidateConfigurationsEvaluated.toLocaleString('en-US')} bounded candidates and ${answers.cheapest.validConfigurationsEvaluated.toLocaleString('en-US')} rule-valid, in-stock configurations through the production engines. ${renderCheapestTie(answers.cheapest.configurations)}`,
    '',
    `## Q3. ${QUESTIONS.q3}`,
    '',
    ...renderQ3Working('10:30', answers.q3Morning),
    '',
    ...renderQ3Working('11:30', answers.q3Late),
    '',
    `## Q4. ${QUESTIONS.q4}`,
    '',
    `**Answer:** **${formatBdt(answers.q4.payable)} BDT**. Subtotal ${formatBdt(answers.q4.subtotal)}; selected discount ${formatDiscount(answers.q4)}; VAT ${formatBdt(answers.q4.vat)}.`,
    '',
    `## Q5. ${QUESTIONS.q5}`,
    '',
    ...answers.seedOrders.map(
      ({ id, pricing }) => `- ${id}: **${formatBdt(pricing.payable)} BDT**`,
    ),
    '',
    `**Total revenue: ${formatBdt(answers.totalRevenue)} BDT.**`,
    '',
    `## Q6. ${QUESTIONS.q6}`,
    '',
    answers.q6
      ? `**Answer:** ${answers.q6.optionName} (${answers.q6.optionId}), **${answers.q6.units} units**.`
      : '**Answer:** No seed option sales were available.',
    '',
    `## Q7. ${QUESTIONS.q7}`,
    '',
    `**Answer:** ${paymentLabel(answers.q7.paymentMethod)}, **${formatBdt(answers.q7.revenue)} BDT**.`,
    '',
    `## Q8. ${QUESTIONS.q8}`,
    '',
    `**Answer:** **${answers.q8Count} seed orders** actually received MORNING15.`,
    '',
    'Step-by-step coupon audit:',
    '',
    ...answers.couponAttempts.map(renderCouponAttempt),
  ]

  return lines.join('\n')
}

function renderQ3Working(
  label: string,
  pricing: PricingBreakdown,
): readonly string[] {
  const line = pricing.lines[0]
  if (!line) throw new Error('Q3 line pricing is missing')
  const discount = pricing.cartDiscount?.amount ?? 0

  return [
    `### ${label} Asia/Dhaka`,
    '',
    `1. A unit price = ${formatBdt(line.unitPrice)} BDT; A ×3 gives subtotal **${formatBdt(pricing.subtotal)} BDT**.`,
    `2. Cart candidates: ${formatCandidates(pricing)}. Selected discount: **${formatDiscount(pricing)}**.`,
    `3. Discounted subtotal = ${formatBdt(pricing.subtotal)} − ${formatBdt(discount)} = ${formatBdt(pricing.discountedSubtotal)} BDT.`,
    `4. VAT = 5% × ${formatBdt(pricing.discountedSubtotal)} = **${formatBdt(pricing.vat)} BDT** after half-up poisha rounding.`,
    `5. Before whole-BDT rounding: ${formatBdt(pricing.payableBeforeWholeBdtRounding)} BDT; payable = **${formatBdt(pricing.payable)} BDT**.`,
  ]
}

function renderCouponAttempt(order: StoredOrder): string {
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(order.createdAt))
  const candidate = order.pricing.coupon.candidateDiscount
  const selected = formatDiscount(order.pricing)

  if (order.coupon.applied) {
    return `- ${order.id} at ${localTime}: subtotal ${formatBdt(order.pricing.subtotal)} BDT; candidates ${formatCandidates(order.pricing)}; MORNING15 candidate ${formatNullableBdt(candidate)} BDT; selected ${selected}; **received the coupon**.`
  }

  const reason =
    order.coupon.status === 'outsideTimeWindow'
      ? 'the order was not strictly before 11:00 Asia/Dhaka'
      : `coupon status was ${order.coupon.status}`
  return `- ${order.id} at ${localTime}: subtotal ${formatBdt(order.pricing.subtotal)} BDT; **did not receive MORNING15** because ${reason}; candidates ${formatCandidates(order.pricing)}; selected ${selected}.`
}

function renderCheapestTie(configurations: readonly Configuration[]): string {
  if (configurations.length <= 1) return 'There was no price tie.'
  return `There are ${configurations.length} cheapest configurations: ${configurations.map(formatConfiguration).join('; ')}. Ketchup is optional and costs zero, so both have the same price.`
}

function formatConfiguration(configuration: Configuration): string {
  const optionNames = new Map(
    menu.groups.flatMap(({ options }) =>
      options.map(({ id, name }) => [id, name] as const),
    ),
  )
  return Object.entries(configuration.selections)
    .map(([id, quantity]) => `${optionNames.get(id) ?? id} ×${quantity}`)
    .join(', ')
}

function formatCandidates(pricing: PricingBreakdown): string {
  if (pricing.cartDiscountCandidates.length === 0) return 'none'
  return pricing.cartDiscountCandidates
    .map(({ promotionId, amount }) => `${promotionId} ${formatBdt(amount)} BDT`)
    .join(', ')
}

function formatDiscount(pricing: PricingBreakdown): string {
  return pricing.cartDiscount
    ? `${pricing.cartDiscount.promotionId} ${formatBdt(pricing.cartDiscount.amount)} BDT`
    : 'none (0.00 BDT)'
}

function formatNullableBdt(amount: Poisha | null): string {
  return amount === null ? '0.00' : formatBdt(amount)
}

function formatBdt(amount: number): string {
  return (amount / 100).toFixed(2)
}

function paymentLabel(method: PaymentMethod): string {
  if (method === 'card') return 'Card'
  if (method === 'bkash') return 'bKash'
  return 'Cash'
}

function cart(
  items: readonly {
    readonly id: string
    readonly configuration: Configuration
    readonly quantity: number
  }[],
  attemptedCouponCode: string | null = null,
) {
  return { items, attemptedCouponCode }
}

function configurationA(): Configuration {
  return {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
  }
}

function configurationBAfterTc10(): Configuration {
  return {
    selections: {
      croissant: 1,
      omelette: 1,
      fried: 3,
      sausage: 1,
      bacon: 1,
      hashbrown: 1,
      mushroom: 1,
      hollandaise: 1,
    },
  }
}

function configurationC(): Configuration {
  return {
    selections: {
      paratha: 1,
      fried: 2,
      tofu: 1,
      cheese: 2,
      beans: 1,
      mushroom: 1,
      chili: 1,
    },
  }
}
