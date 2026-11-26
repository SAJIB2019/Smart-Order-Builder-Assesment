import {
  executeSalesTool,
  SALES_TOOL_DEFINITIONS,
  SalesToolValidationError,
  type SalesToolName,
} from '../../domain/stats/sales-tools'
import type { StoredOrder } from '../../domain/types/order'
import { ApiClient } from '../api/api-client'
import { SalesAssistantError } from './assistant-error'
import type { SalesAssistantModelClient } from './model-client'

export interface SalesAssistantAnswer {
  readonly answer: string
  readonly toolName: SalesToolName
  readonly toolResult: unknown
}

export type LatestOrdersLoader = () => Promise<readonly StoredOrder[]>

export class SalesAssistant {
  constructor(
    private readonly model: SalesAssistantModelClient,
    private readonly loadLatestOrders: LatestOrdersLoader,
  ) {}

  async ask(question: string): Promise<SalesAssistantAnswer> {
    const normalizedQuestion = question.trim()
    if (!normalizedQuestion) {
      throw new SalesAssistantError('invalidToolArguments', {
        retryable: false,
      })
    }

    const selection = await this.model.selectTool(
      normalizedQuestion,
      SALES_TOOL_DEFINITIONS,
    )
    let orders: readonly StoredOrder[]
    try {
      orders = await this.loadLatestOrders()
    } catch (error) {
      throw new SalesAssistantError('ordersUnavailable', { cause: error })
    }

    try {
      const execution = executeSalesTool(selection, orders)
      const answer =
        execution.directMessage ??
        (await this.model.phraseToolResult(
          selection,
          execution.name,
          execution.result,
        ))
      return {
        answer,
        toolName: execution.name,
        toolResult: execution.result,
      }
    } catch (error) {
      if (error instanceof SalesToolValidationError) {
        throw new SalesAssistantError(
          error.reason === 'invalidArguments'
            ? 'invalidToolArguments'
            : 'unsupportedTool',
          {
            cause: error,
            retryable: false,
          },
        )
      }
      throw error
    }
  }
}

export function createApiOrdersLoader(
  apiClient: ApiClient = new ApiClient(),
): LatestOrdersLoader {
  return async () => {
    const response = await apiClient.getOrders()
    if (!response.ok) throw new Error(response.error.message)
    return response.data.orders
  }
}
