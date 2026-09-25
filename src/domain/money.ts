import Big from 'big.js';

/** A base-10 number as a plain string (never exponent notation), e.g. "0.0000004". */
export type Decimal = string;

export function toDecimal(value: number | string | null | undefined): Decimal | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  try {
    return new Big(typeof value === 'string' ? value.trim() : value).toFixed();
  } catch {
    return undefined;
  }
}

/** Ripio sent a value, but not one that reads as a number (e.g. "N/A", "1.234,56" or ""). Null and undefined mean "not sent". */
export function isUnreadable(value: number | string | null | undefined): boolean {
  return value !== null && value !== undefined && toDecimal(value) === undefined;
}

export const add = (a: Decimal, b: Decimal): Decimal => new Big(a).plus(b).toFixed();
export const sub = (a: Decimal, b: Decimal): Decimal => new Big(a).minus(b).toFixed();
export const mul = (a: Decimal, b: Decimal): Decimal => new Big(a).times(b).toFixed();
export const sum = (values: Decimal[]): Decimal => values.reduce((total, value) => add(total, value), '0');
export const abs = (a: Decimal): Decimal => new Big(a).abs().toFixed();
export const isZero = (a: Decimal): boolean => new Big(a).eq(0);
export const isNegative = (a: Decimal): boolean => new Big(a).lt(0);
export const compare = (a: Decimal, b: Decimal): number => new Big(a).cmp(b);

/** Rounds half-up to `dp` places and drops trailing zeros: round("1.50", 2) === "1.5". */
export const round = (a: Decimal, dp: number): Decimal => new Big(a).round(dp).toFixed();

/** Rounds half-up and pads to exactly `dp` places: fixed("2500.5", 2) === "2500.50". */
export const fixed = (a: Decimal, dp: number): Decimal => new Big(a).toFixed(dp);

/** a / b rounded half-up to `dp` places (trailing zeros dropped), or undefined when b is zero. */
export function divide(a: Decimal, b: Decimal, dp: number): Decimal | undefined {
  const divisor = new Big(b);
  if (divisor.eq(0)) return undefined;
  return new Big(a).div(divisor).round(dp).toFixed();
}
