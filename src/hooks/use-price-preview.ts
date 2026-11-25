import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApiError } from '../domain/types/api'
import type {
  PriceableCart,
  PricePreviewRequest,
  PricePreviewResponse,
  PricingBreakdown,
} from '../domain/types/pricing'
import { ApiClient } from '../services/api/api-client'

const DEFAULT_DEBOUNCE_MS = 300
const defaultClient = new ApiClient()

export interface PricePreviewClient {
  previewPrice(
    request: PricePreviewRequest,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly data: PricePreviewResponse }
    | { readonly ok: false; readonly error: ApiError }
  >
}

export interface PricePreviewError {
  readonly message: string
  readonly retryable: boolean
  readonly cause: 'api' | 'network'
}

export type PricePreviewRequestStatus =
  'idle' | 'debouncing' | 'loading' | 'success' | 'error'

export type PreviewFreshness = 'none' | 'current' | 'stale'

interface InternalState {
  readonly inputKey: string | null
  readonly requestStatus: PricePreviewRequestStatus
  readonly pricing: PricingBreakdown | null
  readonly pricingInputKey: string | null
  readonly error: PricePreviewError | null
}

export interface UsePricePreviewOptions {
  readonly cart: PriceableCart
  readonly client?: PricePreviewClient
  readonly debounceMs?: number
}

export interface UsePricePreviewResult {
  readonly requestStatus: PricePreviewRequestStatus
  readonly previewFreshness: PreviewFreshness
  readonly pricing: PricingBreakdown | null
  readonly error: PricePreviewError | null
  readonly retry: () => void
}

const initialState: InternalState = {
  inputKey: null,
  requestStatus: 'idle',
  pricing: null,
  pricingInputKey: null,
  error: null,
}

/** Debounced price coordinator that treats cancellation as an optimization, not a correctness boundary. */
export function usePricePreview({
  cart,
  client = defaultClient,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UsePricePreviewOptions): UsePricePreviewResult {
  const inputKey = useMemo(() => createCartKey(cart), [cart])
  const currentInputKeyRef = useRef(inputKey)
  const currentCartRef = useRef(cart)
  const requestSequenceRef = useRef(0)
  const generationRef = useRef(0)
  const retryImmediatelyRef = useRef(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const [state, setState] = useState<InternalState>(initialState)

  currentInputKeyRef.current = inputKey
  currentCartRef.current = cart

  useEffect(() => {
    const generation = ++generationRef.current
    const controller = new AbortController()
    const shouldRetryImmediately = retryImmediatelyRef.current
    retryImmediatelyRef.current = false

    setState((current) => ({
      ...current,
      inputKey,
      requestStatus: 'debouncing',
      error: null,
    }))

    const runRequest = async () => {
      if (
        generation !== generationRef.current ||
        inputKey !== currentInputKeyRef.current
      ) {
        return
      }

      const requestId = `price-preview-${++requestSequenceRef.current}`
      setState((current) => ({
        ...current,
        inputKey,
        requestStatus: 'loading',
        error: null,
      }))

      try {
        const response = await client.previewPrice(
          { requestId, cart: currentCartRef.current },
          controller.signal,
        )

        if (
          generation !== generationRef.current ||
          inputKey !== currentInputKeyRef.current
        ) {
          return
        }

        if (!response.ok) {
          setState((current) => ({
            ...current,
            inputKey,
            requestStatus: 'error',
            error: {
              message: response.error.message,
              retryable:
                response.error.code === 'TRANSIENT_ERROR' &&
                response.error.retryable,
              cause: 'api',
            },
          }))
          return
        }

        if (response.data.requestId !== requestId) {
          return
        }

        setState({
          inputKey,
          requestStatus: 'success',
          pricing: response.data.pricing,
          pricingInputKey: inputKey,
          error: null,
        })
      } catch (error) {
        if (
          generation !== generationRef.current ||
          inputKey !== currentInputKeyRef.current ||
          isAbortError(error)
        ) {
          return
        }

        setState((current) => ({
          ...current,
          inputKey,
          requestStatus: 'error',
          error: {
            message:
              error instanceof Error
                ? error.message
                : 'Unable to load the price preview',
            retryable: true,
            cause: 'network',
          },
        }))
      }
    }

    const timer = globalThis.setTimeout(
      () => void runRequest(),
      shouldRetryImmediately ? 0 : debounceMs,
    )

    return () => {
      globalThis.clearTimeout(timer)
      controller.abort()
    }
  }, [client, debounceMs, inputKey, retryVersion])

  const retry = useCallback(() => {
    retryImmediatelyRef.current = true
    setRetryVersion((current) => current + 1)
  }, [])

  const previewFreshness: PreviewFreshness = state.pricing
    ? state.pricingInputKey === inputKey
      ? 'current'
      : 'stale'
    : 'none'
  const requestStatus =
    state.inputKey === inputKey ? state.requestStatus : 'debouncing'

  return {
    requestStatus,
    previewFreshness,
    pricing: state.pricing,
    error: state.inputKey === inputKey ? state.error : null,
    retry,
  }
}

function createCartKey(cart: PriceableCart): string {
  return JSON.stringify({
    attemptedCouponCode: cart.attemptedCouponCode,
    items: cart.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      selections: Object.entries(item.configuration.selections).sort(
        ([left], [right]) => left.localeCompare(right),
      ),
    })),
  })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
