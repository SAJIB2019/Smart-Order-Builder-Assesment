import { ApiError, type GenerateContentResponse } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'

import { SALES_TOOL_DEFINITIONS } from '../../../../src/domain/stats/sales-tools'
import { SalesAssistantError } from '../../../../src/services/gemini/assistant-error'
import { GoogleGeminiClient } from '../../../../src/services/gemini/google-gemini-client'

function response(value: Partial<GenerateContentResponse>) {
  return value as GenerateContentResponse
}

describe('GoogleGeminiClient', () => {
  it('declares only allowed tools and returns the single model call', async () => {
    const generateContent = vi.fn().mockResolvedValue(
      response({
        functionCalls: [
          {
            id: 'call-1',
            name: 'getOrdersByDate',
            args: { date: '2026-11-21' },
          },
        ],
      }),
    )
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent },
    })

    await expect(
      client.selectTool('Orders on 21 November?', SALES_TOOL_DEFINITIONS),
    ).resolves.toEqual({
      name: 'getOrdersByDate',
      args: { date: '2026-11-21' },
      callId: 'call-1',
      question: 'Orders on 21 November?',
    })
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: 'Orders on 21 November?',
        config: expect.objectContaining({
          tools: [{ functionDeclarations: SALES_TOOL_DEFINITIONS }],
        }),
      }),
    )
  })

  it('sends only the computed result for phrasing', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValue(response({ text: 'Six orders.' }))
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent },
    })
    const selection = {
      name: 'getOrderCount',
      args: {},
      callId: 'call-2',
      question: 'How many orders?',
    }

    await expect(
      client.phraseToolResult(selection, 'getOrderCount', { orderCount: 6 }),
    ).resolves.toBe('Six orders.')
    const serialized = JSON.stringify(generateContent.mock.calls[0]?.[0])
    expect(serialized).toContain('"orderCount":6')
    expect(serialized).not.toContain('ORD-1001')
  })

  it.each([
    [new ApiError({ status: 401, message: 'bad key' }), 'invalidApiKey'],
    [new ApiError({ status: 429, message: 'quota' }), 'quotaExceeded'],
    [new TypeError('fetch failed'), 'network'],
  ] as const)('maps provider failures to %s', async (cause, code) => {
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent: vi.fn().mockRejectedValue(cause) },
    })
    await expect(
      client.selectTool('question', SALES_TOOL_DEFINITIONS),
    ).rejects.toMatchObject({ code })
  })

  it('handles missing keys and malformed responses', async () => {
    await expect(
      new GoogleGeminiClient({ apiKey: undefined }).selectTool(
        'question',
        SALES_TOOL_DEFINITIONS,
      ),
    ).rejects.toMatchObject({ code: 'missingApiKey' })

    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent: vi.fn().mockResolvedValue(response({})) },
    })
    await expect(
      client.selectTool('question', SALES_TOOL_DEFINITIONS),
    ).rejects.toBeInstanceOf(SalesAssistantError)
  })
})
