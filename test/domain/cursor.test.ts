import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/domain/cursor.js';
import { RipioApiError } from '../../src/ripio/errors.js';

describe('cursor', () => {
  it('round-trips a token for the same source', () => {
    expect(decodeCursor(encodeCursor('wallet', 'ripio-next-token'), 'wallet')).toBe('ripio-next-token');
  });

  it('rejects a cursor from another source', () => {
    expect(() => decodeCursor(encodeCursor('trade', '2'), 'wallet')).toThrow(RipioApiError);
  });

  it('rejects garbage with an actionable message', () => {
    expect(() => decodeCursor('not-a-cursor', 'orders')).toThrow(/Use next_cursor exactly as returned/);
  });
});
