import { describe, expect, it } from 'vitest';
import { abs, compare, divide, fixed, isNegative, isUnreadable, isZero, round, sum, toDecimal } from '../../src/domain/money.js';

describe('money', () => {
  it('turns numbers and numeric strings into plain decimal strings', () => {
    expect(toDecimal(4e-7)).toBe('0.0000004');
    expect(toDecimal('1e-8')).toBe('0.00000001');
    expect(toDecimal(' 250.5 ')).toBe('250.5');
    expect(toDecimal('0.00')).toBe('0');
  });

  it('returns undefined for empty or invalid values', () => {
    expect(toDecimal(undefined)).toBeUndefined();
    expect(toDecimal(null)).toBeUndefined();
    expect(toDecimal('')).toBeUndefined();
    expect(toDecimal('abc')).toBeUndefined();
    expect(toDecimal(Number.NaN)).toBeUndefined();
  });

  it('adds without floating point error', () => {
    expect(sum(['0.1', '0.2'])).toBe('0.3');
  });

  it('rounds half-up, trimming or padding as asked', () => {
    expect(round('1.255', 2)).toBe('1.26');
    expect(round('1.50', 2)).toBe('1.5');
    expect(fixed('2500.5', 2)).toBe('2500.50');
  });

  it('divides and refuses to divide by zero', () => {
    expect(divide('2611.44', '1600', 2)).toBe('1.63');
    expect(divide('1', '0', 2)).toBeUndefined();
  });

  it('compares and inspects signs', () => {
    expect(abs('-5')).toBe('5');
    expect(isNegative('-0.1')).toBe(true);
    expect(isZero('0.000')).toBe(true);
    expect(compare('2', '10')).toBe(-1);
  });

  it('tells a value Ripio sent unreadable from one it did not send', () => {
    for (const value of [null, undefined, '12.5', 0, ' 3 ']) expect(isUnreadable(value), String(value)).toBe(false);
    for (const value of ['N/A', '1.234,56', '', '  ', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isUnreadable(value), String(value)).toBe(true);
    }
  });
});
