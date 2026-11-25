import type { PricePreviewRequest } from '../../domain/types/pricing'

const MIN_LATENCY_MS = 200
const MAX_LATENCY_MS = 1_500
const FAILURE_RATE = 0.15

export interface PricePreviewSimulation {
  latencyMs(request: PricePreviewRequest): number
  shouldFail(request: PricePreviewRequest): boolean
}

export type RandomSource = () => number

/** Production-like defaults; tests inject a deterministic implementation. */
export function createPricePreviewSimulation(
  random: RandomSource = Math.random,
): PricePreviewSimulation {
  return {
    latencyMs() {
      return Math.floor(
        MIN_LATENCY_MS + random() * (MAX_LATENCY_MS - MIN_LATENCY_MS + 1),
      )
    },
    shouldFail() {
      return random() < FAILURE_RATE
    },
  }
}
