import type { ApiResponse } from '../../domain/types/api'
import type { Menu } from '../../domain/types/menu'
import type {
  PricePreviewRequest,
  PricePreviewResponse,
} from '../../domain/types/pricing'
import type { StockSnapshot } from '../../domain/types/stock'
import { apiEndpoints } from './endpoints'

export type FetchClient = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

interface ApiClientOptions {
  readonly baseUrl?: string
  readonly fetchClient?: FetchClient
}

const defaultFetchClient: FetchClient = (input, init) =>
  globalThis.fetch(input, init)

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchClient: FetchClient

  constructor({
    baseUrl = '',
    fetchClient = defaultFetchClient,
  }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl
    this.fetchClient = fetchClient
  }

  getMenu(): Promise<ApiResponse<Menu>> {
    return this.get(apiEndpoints.menu)
  }

  getStock(): Promise<ApiResponse<StockSnapshot>> {
    return this.get(apiEndpoints.stock)
  }

  previewPrice(
    request: PricePreviewRequest,
    signal?: AbortSignal,
  ): Promise<ApiResponse<PricePreviewResponse>> {
    return this.post(apiEndpoints.price, request, signal)
  }

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    const response = await this.fetchClient(joinUrl(this.baseUrl, path), {
      headers: { Accept: 'application/json' },
    })
    const body = (await response.json()) as ApiResponse<T>

    if (!response.ok && body.ok) {
      throw new Error(
        `API returned HTTP ${response.status} with a success body`,
      )
    }

    return body
  }

  private async post<T>(
    path: string,
    request: unknown,
    signal?: AbortSignal,
  ): Promise<ApiResponse<T>> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }

    if (signal) {
      init.signal = signal
    }

    const response = await this.fetchClient(joinUrl(this.baseUrl, path), init)
    const body = (await response.json()) as ApiResponse<T>

    if (!response.ok && body.ok) {
      throw new Error(
        `API returned HTTP ${response.status} with a success body`,
      )
    }

    return body
  }
}
