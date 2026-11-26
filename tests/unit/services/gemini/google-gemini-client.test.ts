import { ApiError, type GenerateContentResponse } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'

import { SALES_TOOL_DEFINITIONS } from '../../../../src/domain/stats/sales-tools'
import { SalesAssistantError } from '../../../../src/services/gemini/assistant-error'
import {
  GEMINI_FLASH_FALLBACK_MODEL,
  GEMINI_FLASH_MODEL,
  GoogleGeminiClient,
} from '../../../../src/services/gemini/google-gemini-client'

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

  it('falls back to Flash Lite when the primary Flash model is unavailable', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 503, message: 'busy' }))
      .mockResolvedValueOnce(
        response({
          functionCalls: [
            { id: 'call-fallback', name: 'getOrderCount', args: {} },
          ],
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'call-fallback',
                      name: 'getOrderCount',
                      args: {},
                    },
                    thoughtSignature: 'signed-provider-state',
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ text: 'Seven orders.' }))
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent },
    })

    const selection = await client.selectTool(
      'How many orders?',
      SALES_TOOL_DEFINITIONS,
    )
    expect(selection).toMatchObject({ name: 'getOrderCount' })
    await expect(
      client.phraseToolResult(selection, 'getOrderCount', { orderCount: 7 }),
    ).resolves.toBe('Seven orders.')
    expect(generateContent).toHaveBeenCalledTimes(3)
    expect(
      generateContent.mock.calls.map(([request]) => request.model),
    ).toEqual([
      GEMINI_FLASH_MODEL,
      GEMINI_FLASH_FALLBACK_MODEL,
      GEMINI_FLASH_FALLBACK_MODEL,
    ])
    expect(JSON.stringify(generateContent.mock.calls[2]?.[0])).toContain(
      'signed-provider-state',
    )
  })

  it('does not misreport a generic bad request as an invalid API key', async () => {
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      fallbackModel: null,
      generator: {
        generateContent: vi
          .fn()
          .mockRejectedValue(
            new ApiError({ status: 400, message: 'bad input' }),
          ),
      },
    })

    await expect(
      client.selectTool('How many orders?', SALES_TOOL_DEFINITIONS),
    ).rejects.toMatchObject({ code: 'unexpectedModelResponse' })
  })

  it('reports high demand clearly when both Flash models are unavailable', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new ApiError({ status: 503, message: 'busy' }))
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent },
    })

    await expect(
      client.selectTool('question', SALES_TOOL_DEFINITIONS),
    ).rejects.toMatchObject({
      code: 'serviceUnavailable',
      message:
        'Gemini is temporarily unavailable due to high demand. Please retry later.',
    })
    expect(generateContent).toHaveBeenCalledTimes(2)
  })

  it('does not switch models after a signed function call', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          functionCalls: [
            { id: 'call-primary', name: 'getOrderCount', args: {} },
          ],
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'call-primary',
                      name: 'getOrderCount',
                      args: {},
                    },
                    thoughtSignature: 'primary-signature',
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockRejectedValueOnce(new ApiError({ status: 503, message: 'busy' }))
    const client = new GoogleGeminiClient({
      apiKey: 'test-key',
      generator: { generateContent },
    })
    const selection = await client.selectTool(
      'How many orders?',
      SALES_TOOL_DEFINITIONS,
    )

    await expect(
      client.phraseToolResult(selection, 'getOrderCount', { orderCount: 7 }),
    ).rejects.toMatchObject({ code: 'serviceUnavailable' })
    expect(
      generateContent.mock.calls.map(([request]) => request.model),
    ).toEqual([GEMINI_FLASH_MODEL, GEMINI_FLASH_MODEL])
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
