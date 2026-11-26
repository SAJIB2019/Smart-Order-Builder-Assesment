import { describe, expect, it, vi } from 'vitest'

import { priceSeedOrders } from '../../src/domain/orders/seed-orders'
import { getBestSellingOption } from '../../src/domain/stats/sales-stats'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'
import { CartService } from '../../src/mocks/services/cart-service'
import { OrderService } from '../../src/mocks/services/order-service'
import { ServerClock } from '../../src/mocks/services/server-clock'
import { createInMemoryMockStore } from '../../src/mocks/store/in-memory-mock-store'
import type { SalesAssistantModelClient } from '../../src/services/gemini/model-client'
import { SalesAssistant } from '../../src/services/gemini/sales-assistant'

const seeds = priceSeedOrders(
  buildYourBreakfastFixture.seedOrders,
  buildYourBreakfastFixture.menu,
)
const firstSeed = seeds[0]!

function selectingModel(
  name: string,
  args: unknown = {},
): SalesAssistantModelClient {
  return {
    selectTool: vi.fn().mockImplementation(async (question: string) => ({
      name,
      args,
      callId: 'acceptance-call',
      question,
    })),
    phraseToolResult: vi
      .fn()
      .mockImplementation(async (_selection, _name, result) =>
        JSON.stringify(result),
      ),
  }
}

describe('Part F official sales-assistant acceptance tests', () => {
  it('TC-18 reflects one new checkout immediately without reload', async () => {
    const store = createInMemoryMockStore(buildYourBreakfastFixture)
    const clock = new ServerClock(
      { now: () => Date.parse('2026-11-25T10:00:00.000Z') },
      0,
    )
    const cart = new CartService({ store, clock })
    const orders = new OrderService({
      store,
      clock,
      seedOrders: buildYourBreakfastFixture.seedOrders,
      ids: { orderId: () => 'ORD-TC-18' },
    })
    const assistant = new SalesAssistant(
      selectingModel('getOrderCount'),
      async () => {
        const outcome = await orders.getOrders()
        if (!outcome.result.ok) throw new Error('Could not load orders')
        return outcome.result.data.orders
      },
    )

    expect((await assistant.ask('How many orders?')).toolResult).toEqual({
      orderCount: 6,
    })
    await cart.addItem({
      idempotencyKey: 'tc-18-add',
      configuration: {
        selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
      },
      quantity: 1,
      cartVersion: 0,
    })
    const checkout = await orders.checkout({
      idempotencyKey: 'tc-18-pay',
      paymentMethod: 'card',
      attemptedCouponCode: null,
      cartVersion: 1,
    })
    expect(checkout.result.ok).toBe(true)
    expect((await assistant.ask('How many orders now?')).toolResult).toEqual({
      orderCount: 7,
    })
  })

  it('TC-19 matches deterministic statistics after order data changes', async () => {
    const seedAssistant = new SalesAssistant(
      selectingModel('getBestSellingOption'),
      async () => seeds,
    )

    expect(await seedAssistant.ask('Best seller?')).toEqual(
      expect.objectContaining({
        toolName: 'getBestSellingOption',
        toolResult: {
          optionId: 'fried',
          optionName: 'Fried',
          units: 10,
        },
      }),
    )

    const modified = [
      ...seeds,
      {
        ...firstSeed,
        id: 'ORD-MODIFIED',
        lines: firstSeed.lines.map((line) => ({
          ...line,
          quantity: 3,
          selections: line.selections.map((selection) =>
            selection.optionId === 'scrambled'
              ? { ...selection, quantity: 3 }
              : selection,
          ),
        })),
      },
    ]
    const assistant = new SalesAssistant(
      selectingModel('getBestSellingOption'),
      async () => modified,
    )
    const expectedAfterDataChange = getBestSellingOption(modified)
    expect(expectedAfterDataChange).toEqual({
      optionId: 'scrambled',
      optionName: 'Scrambled',
      units: 17,
    })
    expect((await assistant.ask('Best seller?')).toolResult).toEqual(
      expectedAfterDataChange,
    )
  })

  it('TC-20 explains missing customer data without inventing a name', async () => {
    const model = selectingModel('explainDataLimitation', {
      subject: 'customer',
    })
    const result = await new SalesAssistant(model, async () => seeds).ask(
      'Who is our best customer?',
    )
    expect(result.answer).toBe(
      'I cannot determine the best customer because orders do not store customer information.',
    )
    expect(result.answer).not.toMatch(/customer is [A-Z]/i)
    expect(model.phraseToolResult).not.toHaveBeenCalled()
  })
})
