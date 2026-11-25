import { poisha, type Poisha } from '../types/money'

const BASIS_POINTS_DENOMINATOR = 10_000
const POISHA_PER_BDT = 100

export function addPoisha(...amounts: readonly Poisha[]): Poisha {
  return poishaFromBigInt(
    amounts.reduce((total, amount) => total + BigInt(amount), 0n),
  )
}

export function subtractPoisha(amount: Poisha, discount: Poisha): Poisha {
  if (discount > amount) {
    throw new RangeError('A monetary discount cannot exceed its amount')
  }

  return poisha(amount - discount)
}

export function multiplyPoisha(amount: Poisha, quantity: number): Poisha {
  assertNonNegativeSafeInteger(quantity, 'Money multiplier')
  return poishaFromBigInt(BigInt(amount) * BigInt(quantity))
}

/** Exact non-negative ratio calculation with half-up integer rounding. */
export function roundRatioHalfUp(
  value: Poisha,
  numerator: number,
  denominator: number,
): Poisha {
  assertNonNegativeSafeInteger(numerator, 'Ratio numerator')

  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('Ratio denominator must be a positive safe integer')
  }

  const scaled = BigInt(value) * BigInt(numerator)
  const divisor = BigInt(denominator)
  const quotient = scaled / divisor
  const remainder = scaled % divisor
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient

  return poishaFromBigInt(rounded)
}

export function percentageOfPoisha(
  amount: Poisha,
  percentageBasisPoints: number,
): Poisha {
  return roundRatioHalfUp(
    amount,
    percentageBasisPoints,
    BASIS_POINTS_DENOMINATOR,
  )
}

export function roundPoishaToWholeBdt(amount: Poisha): Poisha {
  return multiplyPoisha(
    roundRatioHalfUp(amount, 1, POISHA_PER_BDT),
    POISHA_PER_BDT,
  )
}

function poishaFromBigInt(value: bigint): Poisha {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Poisha calculation exceeds the safe integer range')
  }

  return poisha(Number(value))
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`)
  }
}
