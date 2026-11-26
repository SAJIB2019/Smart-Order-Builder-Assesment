import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai'

import type {
  SalesToolDefinition,
  SalesToolName,
} from '../../domain/stats/sales-tools'
import { SalesAssistantError } from './assistant-error'
import type {
  ModelToolSelection,
  SalesAssistantModelClient,
} from './model-client'

export const GEMINI_FLASH_MODEL = 'gemini-3.8-flash' as const

interface GeminiGenerator {
  generateContent(
    parameters: GenerateContentParameters,
  ): Promise<GenerateContentResponse>
}

interface GoogleGeminiClientOptions {
  readonly apiKey: string | undefined
  readonly generator?: GeminiGenerator
  readonly model?: string
}

const systemInstruction = `You are a sales reporting router. Select exactly one declared function.
Never calculate a sales number yourself. Never invent data. Use explainDataLimitation when the
question requires data the tools do not provide, including customer identities.`

export class GoogleGeminiClient implements SalesAssistantModelClient {
  private readonly generator: GeminiGenerator | undefined
  private readonly model: string

  constructor(private readonly options: GoogleGeminiClientOptions) {
    this.model = options.model ?? GEMINI_FLASH_MODEL
    this.generator =
      options.generator ??
      (options.apiKey
        ? new GoogleGenAI({ apiKey: options.apiKey }).models
        : undefined)
  }

  async selectTool(
    question: string,
    definitions: readonly SalesToolDefinition[],
  ): Promise<ModelToolSelection> {
    const generator = this.requireGenerator()
    try {
      const response = await generator.generateContent({
        model: this.model,
        contents: question,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [...definitions] }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: definitions.map(({ name }) => name),
            },
          },
        },
      })
      const calls = response.functionCalls
      if (calls?.length !== 1 || !calls[0]?.name) {
        throw new SalesAssistantError('unexpectedModelResponse')
      }
      return {
        name: calls[0].name,
        args: calls[0].args ?? {},
        callId: calls[0].id ?? 'sales-tool-call',
        question,
      }
    } catch (error) {
      throw mapGeminiError(error)
    }
  }

  async phraseToolResult(
    selection: ModelToolSelection,
    toolName: SalesToolName,
    result: unknown,
  ): Promise<string> {
    const generator = this.requireGenerator()
    try {
      const response = await generator.generateContent({
        model: this.model,
        contents: [
          { role: 'user', parts: [{ text: selection.question }] },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: selection.callId,
                  name: toolName,
                  args: selection.args as Record<string, unknown>,
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: selection.callId,
                  name: toolName,
                  response: { output: result },
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            'Phrase the provided deterministic tool output concisely. Do not add, alter, or calculate numbers.',
        },
      })
      const answer = response.text?.trim()
      if (!answer) throw new SalesAssistantError('unexpectedModelResponse')
      return answer
    } catch (error) {
      throw mapGeminiError(error)
    }
  }

  private requireGenerator(): GeminiGenerator {
    if (!this.options.apiKey && !this.options.generator) {
      throw new SalesAssistantError('missingApiKey', { retryable: false })
    }
    if (!this.generator) throw new SalesAssistantError('missingApiKey')
    return this.generator
  }
}

function mapGeminiError(error: unknown): SalesAssistantError {
  if (error instanceof SalesAssistantError) return error
  if (error instanceof ApiError) {
    if ([400, 401, 403].includes(error.status)) {
      return new SalesAssistantError('invalidApiKey', {
        cause: error,
        retryable: false,
      })
    }
    if (error.status === 429) {
      return new SalesAssistantError('quotaExceeded', { cause: error })
    }
  }
  if (error instanceof TypeError) {
    return new SalesAssistantError('network', { cause: error })
  }
  return new SalesAssistantError('unexpectedModelResponse', { cause: error })
}
