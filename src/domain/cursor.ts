import { RipioApiError } from '../ripio/errors.js';

export type CursorSource = 'wallet' | 'trade' | 'orders';

export function encodeCursor(source: CursorSource, token: string): string {
  return Buffer.from(JSON.stringify({ s: source, t: token }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string, expected: CursorSource): string {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null) {
      const { s, t } = parsed as { s?: unknown; t?: unknown };
      if (s === expected && typeof t === 'string') return t;
    }
  } catch {
    // fall through to the error below
  }
  throw new RipioApiError(
    'bad_request',
    `Invalid cursor for ${expected}. Use next_cursor exactly as returned by the previous call.`,
  );
}
