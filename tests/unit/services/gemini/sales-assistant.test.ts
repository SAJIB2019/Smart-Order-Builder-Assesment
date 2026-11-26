import { describe, expect, it, vi } from 'vitest'

import { priceSeedOrders } from '../../../../src/domain/orders/seed-orders'
import { buildYourBreakfastFixture } from '../../../../src/mocks/fixtures/build-your-breakfast'
import type { SalesAssistantModelClient } from '../../../../src/services/gemini/model-client'
import { SalesAssistant } from '../../../../src/services/gemini/sales-assistant'

const orders = priceSeedOrders(
  buildYourBreakfastFixture.seedOrders,
  buildYourBreakfastFixture.menu,
)

function model(
  name = 'getOrderCount',
  args: unknown = {},
): SalesAssistantModelClient {
  return {
    selectTool: vi.fn().mockResolvedValue({
      name,
      args,
      callId: 'call-1',
      question: 'question',
    }),
    phraseToolResult: vi.fn().mockResolvedValue('Computed answer.'),
  }
}

describe('SalesAssistant', () => {
  it('loads fresh persisted orders on every question', async () => {
    const client = model()
    const load = vi
      .fn()
      .mockResolvedValueOnce(orders)
      .mockResolvedValueOnce([...orders, orders[0]])
    const assistant = new SalesAssistant(client, load)

    expect((await assistant.ask('count')).toolResult).toEqual({ orderCount: 6 })
    expect((await assistant.ask('count again')).toolResult).toEqual({
      orderCount: 7,
    })
    expect(load).toHaveBeenCalledTimes(2)
    expect(client.selectTool).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ orders })]),
    )
  })

  it('does not ask Gemini to phrase a deterministic limitation', async () => {
    const client = model('explainDataLimitation', { subject: 'customer' })
    const answer = await new SalesAssistant(client, async () => orders).ask(
      'Who is our best customer?',
    )
    expect(answer.answer).toBe(
      'I cannot determine the best customer because orders do not store customer information.',
    )
    expect(client.phraseToolResult).not.toHaveBeenCalled()
  })

  it.each([
    ['madeUpTool', {}, 'unsupportedTool'],
    ['getOrdersByDate', { date: 'tomorrow' }, 'invalidToolArguments'],
  ])('rejects %s safely', async (name, args, code) => {
    await expect(
      new SalesAssistant(model(name, args), async () => orders).ask('question'),
    ).rejects.toMatchObject({ code })
  })
})
