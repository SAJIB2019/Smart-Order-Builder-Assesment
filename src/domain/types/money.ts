declare const poishaBrand: unique symbol

/** A non-negative monetary amount stored as an integer number of poisha. */
export type Poisha = number & { readonly [poishaBrand]: 'Poisha' }

export function poisha(value: number): Poisha {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Poisha must be a non-negative safe integer')
  }

  return value as Poisha
}
