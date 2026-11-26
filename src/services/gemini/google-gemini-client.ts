import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
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

export const GEMINI_FLASH_MODEL = 'gemini-3.5-flash-lite' as const
export const GEMINI_FLASH_FALLBACK_MODEL = 'gemini-3.1-flash-lite' as const

interface GeminiGenerator {
  generateContent(
    parameters: GenerateContentParameters,
  ): Promise<GenerateContentResponse>
}

interface GoogleGeminiClientOptions {
  readonly apiKey: string | undefined
  readonly generator?: GeminiGenerator
  readonly model?: string
  readonly fallbackModel?: string | null
}

const systemInstruction = `You are a sales reporting router. Select exactly one declared function.
Never calculate a sales number yourself. Never invent data. Use explainDataLimitation when the
question requires data the tools do not provide, including customer identities.`

export class GoogleGeminiClient implements SalesAssistantModelClient {
  private readonly generator: GeminiGenerator | undefined
  private readonly model: string
  private readonly fallbackModel: string | undefined

  constructor(private readonly options: GoogleGeminiClientOptions) {
    this.model = options.model ?? GEMINI_FLASH_MODEL
    this.fallbackModel =
      options.fallbackModel === null
        ? undefined
        : (options.fallbackModel ?? GEMINI_FLASH_FALLBACK_MODEL)
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
      const { response, model } = await this.generateContent(generator, {
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
      const callId = calls[0].id ?? 'sales-tool-call'
      const signedPart = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.functionCall?.name === calls[0]?.name,
      )
      return {
        name: calls[0].name,
        args: calls[0].args ?? {},
        callId,
        question,
        ...(signedPart
          ? { continuation: { model, functionCallPart: signedPart } }
          : {}),
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
      const preferredModel = selection.continuation?.model ?? this.model
      const functionCallPart = isFunctionCallPart(
        selection.continuation?.functionCallPart,
      )
        ? selection.continuation.functionCallPart
        : {
            functionCall: {
              id: selection.callId,
              name: toolName,
              args: selection.args as Record<string, unknown>,
            },
          }
      const { response } = await this.generateContent(
        generator,
        {
          contents: [
            { role: 'user', parts: [{ text: selection.question }] },
            {
              role: 'model',
              parts: [functionCallPart],
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
        },
        preferredModel,
        false,
      )
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

  private async generateContent(
    generator: GeminiGenerator,
    parameters: Omit<GenerateContentParameters, 'model'>,
    preferredModel = this.model,
    allowFallback = true,
  ): Promise<{
    readonly response: GenerateContentResponse
    readonly model: string
  }> {
    try {
      return {
        response: await generator.generateContent({
          ...parameters,
          model: preferredModel,
        }),
        model: preferredModel,
      }
    } catch (error) {
      const fallbackModel =
        allowFallback && preferredModel === this.model
          ? this.fallbackModel
          : undefined
      if (!isServiceUnavailable(error) || !fallbackModel) throw error
      return {
        response: await generator.generateContent({
          ...parameters,
          model: fallbackModel,
        }),
        model: fallbackModel,
      }
    }
  }
}

function isServiceUnavailable(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 503
}

function isFunctionCallPart(value: unknown): value is Part {
  return (
    typeof value === 'object' &&
    value !== null &&
    'functionCall' in value &&
    typeof value.functionCall === 'object' &&
    value.functionCall !== null
  )
}

function mapGeminiError(error: unknown): SalesAssistantError {
  if (error instanceof SalesAssistantError) return error
  if (error instanceof ApiError) {
    if (isInvalidApiKeyError(error)) {
      return new SalesAssistantError('invalidApiKey', {
        cause: error,
        retryable: false,
      })
    }
    if (error.status === 429) {
      return new SalesAssistantError('quotaExceeded', { cause: error })
    }
    if (error.status === 503) {
      return new SalesAssistantError('serviceUnavailable', { cause: error })
    }
  }
  if (error instanceof TypeError) {
    return new SalesAssistantError('network', { cause: error })
  }
  return new SalesAssistantError('unexpectedModelResponse', { cause: error })
}

function isInvalidApiKeyError(error: ApiError): boolean {
  return (
    [401, 403].includes(error.status) ||
    (error.status === 400 &&
      /API_KEY_INVALID|API key not valid|invalid API key/i.test(error.message))
  )
}
