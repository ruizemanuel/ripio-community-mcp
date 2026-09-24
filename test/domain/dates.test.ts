import { describe, expect, it } from 'vitest';
import { isWithin, rangeEnd, rangeStart, toIsoDate } from '../../src/domain/dates.js';

describe('dates', () => {
  it('normalizes zoned timestamps (including microseconds) to ISO UTC', () => {
    expect(toIsoDate('2025-06-18T14:20:10.123456+00:00')).toBe('2025-06-18T14:20:10.123Z');
    expect(toIsoDate('2026-09-01T10:00:00-03:00')).toBe('2026-09-01T13:00:00.000Z');
  });

  it('assumes UTC for timestamps without a zone', () => {
    expect(toIsoDate('2022-03-14 09:21:37.418')).toBe('2022-03-14T09:21:37.418Z');
    expect(toIsoDate('2022-03-14T09:21:37')).toBe('2022-03-14T09:21:37.000Z');
  });

  it('returns unparseable values unchanged', () => {
    expect(toIsoDate('garbage')).toBe('garbage');
  });

  it('expands bare dates to whole UTC days', () => {
    expect(rangeStart('2026-09-01')).toBe('2026-09-01T00:00:00.000Z');
    expect(rangeEnd('2026-09-30')).toBe('2026-09-30T23:59:59.999Z');
    expect(rangeStart('2026-09-01T10:00:00-03:00')).toBe('2026-09-01T13:00:00.000Z');
  });

  it('checks ranges inclusively', () => {
    expect(isWithin('2025-06-18T14:20:10.123Z', '2025-06-18', '2025-06-18')).toBe(true);
    expect(isWithin('2025-06-04T11:05:30.654Z', '2025-06-18')).toBe(false);
    expect(isWithin('2025-06-04T11:05:30.654Z', undefined, '2025-06-03')).toBe(false);
    expect(isWithin('2025-06-04T11:05:30.654Z')).toBe(true);
  });
});
