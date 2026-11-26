export type SalesAssistantErrorCode =
  | 'missingApiKey'
  | 'invalidApiKey'
  | 'quotaExceeded'
  | 'network'
  | 'invalidToolArguments'
  | 'unsupportedTool'
  | 'ordersUnavailable'
  | 'unexpectedModelResponse'

const messages: Record<SalesAssistantErrorCode, string> = {
  missingApiKey:
    'The sales assistant is unavailable because VITE_GEMINI_API_KEY is not configured.',
  invalidApiKey: 'The Gemini API key is invalid or not authorized.',
  quotaExceeded: 'Gemini quota is currently exhausted. Please retry later.',
  network:
    'The sales assistant could not reach Gemini. Check the network and retry.',
  invalidToolArguments: 'Gemini returned invalid arguments for a sales tool.',
  unsupportedTool: 'Gemini requested an unsupported sales tool.',
  ordersUnavailable: 'The latest persisted orders could not be loaded.',
  unexpectedModelResponse:
    'Gemini returned an unexpected response. Please retry.',
}

export class SalesAssistantError extends Error {
  readonly retryable: boolean

  constructor(
    readonly code: SalesAssistantErrorCode,
    options?: { readonly cause?: unknown; readonly retryable?: boolean },
  ) {
    super(messages[code], { cause: options?.cause })
    this.name = 'SalesAssistantError'
    this.retryable =
      options?.retryable ??
      [
        'quotaExceeded',
        'network',
        'ordersUnavailable',
        'unexpectedModelResponse',
      ].includes(code)
  }
}

export function assistantErrorMessage(error: unknown): string {
  return error instanceof SalesAssistantError
    ? error.message
    : messages.unexpectedModelResponse
}
