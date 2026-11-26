import { describe, expect, it, vi } from 'vitest'

import { priceSeedOrders } from '../../src/domain/orders/seed-orders'
import { getBestSellingOption } from '../../src/domain/stats/sales-stats'
import type { StoredOrder } from '../../src/domain/types/order'
import { buildYourBreakfastFixture } from '../../src/mocks/fixtures/build-your-breakfast'
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
    let persisted: readonly StoredOrder[] = seeds
    const assistant = new SalesAssistant(
      selectingModel('getOrderCount'),
      async () => persisted,
    )

    expect((await assistant.ask('How many orders?')).toolResult).toEqual({
      orderCount: 6,
    })
    persisted = [...persisted, { ...firstSeed, id: 'ORD-NEW' }]
    expect((await assistant.ask('How many orders now?')).toolResult).toEqual({
      orderCount: 7,
    })
  })

  it('TC-19 matches deterministic statistics after order data changes', async () => {
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
    expect((await assistant.ask('Best seller?')).toolResult).toEqual(
      getBestSellingOption(modified),
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
