import type {
  SalesToolDefinition,
  SalesToolName,
} from '../../domain/stats/sales-tools'

export interface ModelToolSelection {
  readonly name: string
  readonly args: unknown
  readonly callId: string
  readonly question: string
}

export interface SalesAssistantModelClient {
  selectTool(
    question: string,
    definitions: readonly SalesToolDefinition[],
  ): Promise<ModelToolSelection>
  phraseToolResult(
    selection: ModelToolSelection,
    toolName: SalesToolName,
    result: unknown,
  ): Promise<string>
}
