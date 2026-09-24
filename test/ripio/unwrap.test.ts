import { describe, expect, it } from 'vitest';
import { RipioApiError } from '../../src/ripio/errors.js';
import { parseRetryAfter, unwrapResponse } from '../../src/ripio/unwrap.js';

function errorOf(fn: () => unknown): RipioApiError {
  try {
    fn();
  } catch (error) {
    if (error instanceof RipioApiError) return error;
    throw error;
  }
  throw new Error('expected a RipioApiError');
}

const body = (value: unknown): string => JSON.stringify(value);

describe('unwrapResponse', () => {
  it('returns data from a Wallet envelope', () => {
    expect(unwrapResponse('/wallet/balance/', 200, body({ error_code: null, message: null, data: { wallet: [] } }))).toEqual({
      wallet: [],
    });
  });

  it('returns data from a Trade envelope', () => {
    expect(
      unwrapResponse('/trade/user/balances', 200, body({ data: [], error_code: null, message: null, timestamp: 1 })),
    ).toEqual([]);
  });

  it('rejects a 2xx body without a data envelope as a schema error without echoing it', () => {
    const error = errorOf(() => unwrapResponse('/wallet/balance/', 200, '<html>oops</html>'));
    expect(error.kind).toBe('schema');
    expect(error.message).not.toContain('<html');
  });

  it('never surfaces an HTML error page', () => {
    const error = errorOf(() =>
      unwrapResponse('/wallet/transactions/1/', 404, '\n<!doctype html><html><title>Not Found</title></html>'),
    );
    expect(error.kind).toBe('not_found');
    expect(error.message).toBe('HTTP 404');
  });

  it.each([
    ['Invalid timestamp', 'auth_clock'],
    ['Invalid token', 'auth_token'],
    ['Invalid signature', 'auth_signature'],
  ])('classifies 401 "%s" as %s', (message, kind) => {
    const error = errorOf(() => unwrapResponse('/wallet/balance/', 401, body({ error_code: 401, message, data: null })));
    expect(error.kind).toBe(kind);
    expect(error.retryable).toBe(false);
  });

  it('classifies a Wallet 403 and keeps its code', () => {
    const error = errorOf(() =>
      unwrapResponse('/wallet/balance/', 403, body({ error_code: '0009', message: 'Forbidden', data: { code: '0009' } })),
    );
    expect(error).toMatchObject({ kind: 'forbidden', code: '0009', status: 403, endpoint: '/wallet/balance/' });
  });

  it('classifies a 400 (unknown pair) as bad_request carrying Ripio’s message', () => {
    const error = errorOf(() =>
      unwrapResponse('/trade/orders/estimate-price/BTC_ARS', 400, body({ error_code: 40000, message: 'Invalid pair' })),
    );
    expect(error).toMatchObject({ kind: 'bad_request', message: 'Invalid pair', code: '40000', status: 400 });
  });

  it('marks 429 as retryable and carries Retry-After', () => {
    const error = errorOf(() =>
      unwrapResponse('/trade/user/balances', 429, body({ error_code: 429, message: 'Too many requests' }), 2000),
    );
    expect(error).toMatchObject({ kind: 'rate_limited', retryable: true, retryAfterMs: 2000 });
  });

  it.each([
    [502, true],
    [503, true],
    [504, true],
    [500, false],
  ])('treats HTTP %i as upstream (retryable: %s)', (status, retryable) => {
    const error = errorOf(() => unwrapResponse('/wallet/balance/', status, 'Service Unavailable'));
    expect(error).toMatchObject({ kind: 'upstream', retryable, message: 'Service Unavailable' });
  });
});

describe('parseRetryAfter', () => {
  it('converts seconds to milliseconds', () => {
    expect(parseRetryAfter('2')).toBe(2000);
  });

  it('ignores missing or non-numeric values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
  });
});
