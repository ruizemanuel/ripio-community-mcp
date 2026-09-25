import { describe, expect, it } from 'vitest';
import { RipioApiError, type RipioErrorKind, type RipioErrorOptions } from '../../src/ripio/errors.js';
import { fail, userMessage } from '../../src/tools/result.js';

const error = (kind: RipioErrorKind, message: string, options: RipioErrorOptions = {}) =>
  new RipioApiError(kind, message, options);

describe('userMessage', () => {
  it.each([
    [error('config', 'RIPIO_API_KEY not set. See README → Setup.'), 'RIPIO_API_KEY not set. See README → Setup.'],
    [error('auth_token', 'Invalid token', { status: 401 }), 'invalid or revoked'],
    [error('auth_signature', 'Invalid signature', { status: 401 }), "RIPIO_API_SECRET doesn't match RIPIO_API_KEY"],
    [error('auth_clock', 'Invalid timestamp', { status: 401 }), 'even after re-syncing the clock'],
    [error('forbidden', 'Forbidden', { status: 403, endpoint: '/wallet/balance/' }), 'lacks the "Balance" permission'],
    [error('forbidden', 'Forbidden', { status: 403, endpoint: '/trade/user/statement' }), 'lacks the "Statement" permission'],
    [error('forbidden', 'Forbidden', { status: 403, endpoint: '/trade/orders/open' }), 'lacks the "Trading" permission'],
    [error('forbidden', 'Forbidden', { status: 403, endpoint: '/wallet/transactions/' }), 'full "Read-only" preset'],
    [error('not_found', 'HTTP 404', { status: 404, endpoint: '/wallet/transactions/9/' }), 'Not found: /wallet/transactions/9/.'],
    [error('bad_request', 'Invalid pair', { status: 400 }), 'Ripio rejected the request: Invalid pair'],
    [error('bad_request', 'rail only applies to source "wallet".'), 'rail only applies to source "wallet".'],
    [error('rate_limited', 'Too many requests', { status: 429 }), 'Ripio rate limit reached'],
    [error('upstream', 'Service Unavailable', { status: 503 }), 'Ripio API unavailable (HTTP 503)'],
    [error('upstream', 'Ripio API unreachable (timed out)'), 'Ripio API unavailable: Ripio API unreachable (timed out)'],
    [error('schema', 'Unexpected response', { endpoint: '/wallet/balance/' }), 'Unexpected response from /wallet/balance/'],
    [new Error('boom'), 'Unexpected error while talking to Ripio'],
  ])('explains %s', (input, expected) => {
    expect(userMessage(input)).toContain(expected);
  });
});

describe('userMessage for 403', () => {
  it('leads with a changed public IP, the likeliest cause for a "Read-only" key with an allowlist', () => {
    const message = userMessage(error('forbidden', 'Forbidden', { status: 403, endpoint: '/wallet/balance/' }));
    expect(message.startsWith('Ripio denied access to /wallet/balance/.')).toBe(true);
    expect(message.indexOf('public IP may have changed')).toBeGreaterThan(-1);
    expect(message.indexOf('public IP may have changed')).toBeLessThan(message.indexOf('permission'));
  });

  it('adds the country rule to a 403 on deposit accounts', () => {
    const message = userMessage(error('forbidden', 'Forbidden', { status: 403, endpoint: '/wallet/banking/deposit-accounts/' }));
    expect(message).toContain('public IP may have changed');
    expect(message.endsWith('Ripio only offers deposit accounts through the API to users in Argentina and Brazil.')).toBe(true);
  });

  it('names the "General data" permission for the deposit endpoints', () => {
    const endpoints = ['/wallet/addresses/', '/wallet/network/currency-networks/USDT/', '/wallet/currencies/', '/wallet/banking/deposit-accounts/'];
    for (const endpoint of endpoints) {
      expect(userMessage(error('forbidden', 'Forbidden', { status: 403, endpoint })), endpoint).toContain(
        'Otherwise the key lacks the "General data" permission.',
      );
    }
  });
});

describe('fail', () => {
  it('logs schema details for the maintainer but keeps them out of the answer', () => {
    const logs: string[] = [];
    const result = fail(
      error('schema', 'Unexpected response', { endpoint: '/wallet/balance/', details: 'wallet: Required' }),
      (m) => logs.push(m),
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).not.toContain('wallet: Required');
    expect(logs.join('\n')).toContain('wallet: Required');
  });
});

describe('userMessage for 429', () => {
  const limited = (retryAfterMs?: number) =>
    userMessage(error('rate_limited', 'Too many requests', { status: 429, retryAfterMs }));

  it('says how long Ripio asks to wait when that is longer than the server waits by itself', () => {
    expect(limited(30_000)).toContain('Ripio asks to wait 30 seconds before trying again.');
    expect(limited(3_600_000)).toContain('Ripio asks to wait about 60 minutes before trying again.');
    expect(limited(7_200_000)).toContain('Ripio asks to wait about 2 hours before trying again.');
  });

  it('keeps "a few seconds" when the server already waited, or Ripio gave no usable wait', () => {
    for (const short of [undefined, 2_000, 10_000]) {
      expect(limited(short), String(short)).toContain('Try again in a few seconds.');
      expect(limited(short), String(short)).not.toContain('asks to wait');
    }
  });
});
