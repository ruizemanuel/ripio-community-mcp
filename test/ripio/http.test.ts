import { describe, expect, it } from 'vitest';
import { RipioApiError } from '../../src/ripio/errors.js';
import { RipioHttp, type RipioHttpOptions } from '../../src/ripio/http.js';
import { signRequest } from '../../src/ripio/signing.js';
import {
  fakeFetch,
  ripioError,
  SERVER_TIME_MS,
  serverTimeReply,
  walletOk,
  type FakeReply,
} from '../helpers/fake-fetch.js';

const NOW = 1_700_000_000_000;
const SECRET = 'super-secret-value';

function setup(reply: (url: URL, index: number) => FakeReply, extra: Partial<RipioHttpOptions> = {}) {
  const { fetch, calls } = fakeFetch(reply);
  const sleeps: number[] = [];
  const http = new RipioHttp({
    apiKey: 'key-123',
    apiSecret: SECRET,
    fetch,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    ...extra,
  });
  const callsTo = (path: string) => calls.filter((call) => call.url.pathname === path);
  return { http, calls, sleeps, callsTo };
}

async function rejection(promise: Promise<unknown>): Promise<RipioApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RipioApiError) return error;
    throw error;
  }
  throw new Error('expected a rejection');
}

const isServerTime = (url: URL) => url.pathname === '/trade/public/server-time';

describe('RipioHttp', () => {
  it('signs private GETs with the server-synced clock and leaves the query out of the signature', async () => {
    const { http, callsTo } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({ results: [] })));
    await http.get('/wallet/transactions/', { query: { rail: 'bank', cursor: undefined } });
    const [call] = callsTo('/wallet/transactions/');
    const timestamp = String(SERVER_TIME_MS);
    expect(call?.url.search).toBe('?rail=bank');
    expect(call?.method).toBe('GET');
    expect(call?.headers).toMatchObject({
      Authorization: 'key-123',
      Timestamp: timestamp,
      Signature: signRequest(SECRET, timestamp, 'GET', '/wallet/transactions/'),
    });
  });

  it('never sends the secret over the wire', async () => {
    const { http, calls } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({})));
    await http.get('/wallet/balance/');
    for (const call of calls) {
      expect(JSON.stringify(call.headers)).not.toContain(SECRET);
      expect(call.url.href).not.toContain(SECRET);
    }
  });

  it('sends public requests unsigned and without syncing the clock', async () => {
    const { http, calls } = setup(() => walletOk([]));
    await http.get('/trade/public/tickers', { signed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it('syncs the clock once for concurrent requests', async () => {
    const { http, callsTo } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({})));
    await Promise.all([http.get('/wallet/balance/'), http.get('/wallet/rates/'), http.get('/wallet/transactions/')]);
    expect(callsTo('/trade/public/server-time')).toHaveLength(1);
  });

  it('re-syncs the clock and retries once on "Invalid timestamp"', async () => {
    let balanceCalls = 0;
    const { http, callsTo } = setup((url) => {
      if (isServerTime(url)) return serverTimeReply;
      balanceCalls += 1;
      return balanceCalls === 1 ? ripioError(401, 'Invalid timestamp') : walletOk({ wallet: [] });
    });
    await expect(http.get('/wallet/balance/')).resolves.toEqual({ wallet: [] });
    expect(callsTo('/trade/public/server-time')).toHaveLength(2);
  });

  it('gives up with auth_clock when the timestamp is still rejected after re-syncing', async () => {
    const { http, callsTo } = setup((url) => (isServerTime(url) ? serverTimeReply : ripioError(401, 'Invalid timestamp')));
    expect((await rejection(http.get('/wallet/balance/'))).kind).toBe('auth_clock');
    expect(callsTo('/wallet/balance/')).toHaveLength(2);
  });

  it('retries 503 with backoff and then succeeds', async () => {
    let attempts = 0;
    const { http, sleeps } = setup((url) => {
      if (isServerTime(url)) return serverTimeReply;
      attempts += 1;
      return attempts <= 2 ? { status: 503, body: 'Service Unavailable' } : walletOk({ wallet: [] });
    });
    await expect(http.get('/wallet/balance/')).resolves.toEqual({ wallet: [] });
    expect(sleeps).toEqual([500, 1500]);
  });

  it('honors Retry-After on 429', async () => {
    let attempts = 0;
    const { http, sleeps } = setup((url) => {
      if (isServerTime(url)) return serverTimeReply;
      attempts += 1;
      return attempts === 1
        ? { status: 429, body: { error_code: 429, message: 'Too many requests' }, headers: { 'retry-after': '2' } }
        : walletOk({});
    });
    await http.get('/wallet/balance/');
    expect(sleeps).toEqual([2000]);
  });

  it('stops after maxRetries and reports upstream', async () => {
    const { http, callsTo } = setup((url) => (isServerTime(url) ? serverTimeReply : { status: 503, body: 'down' }));
    const error = await rejection(http.get('/wallet/balance/'));
    expect(error.kind).toBe('upstream');
    expect(callsTo('/wallet/balance/')).toHaveLength(3);
  });

  it.each([400, 403, 404, 500])('does not retry HTTP %i', async (status) => {
    const { http, callsTo } = setup((url) => (isServerTime(url) ? serverTimeReply : ripioError(status, 'nope')));
    await rejection(http.get('/wallet/balance/'));
    expect(callsTo('/wallet/balance/')).toHaveLength(1);
  });

  it('times out hung requests', async () => {
    const { http } = setup((url) => (isServerTime(url) ? serverTimeReply : 'hang'), { timeoutMs: 20, maxRetries: 0 });
    const error = await rejection(http.get('/wallet/balance/'));
    expect(error).toMatchObject({ kind: 'upstream', retryable: true });
    expect(error.message).toContain('timed out');
  });

  it('reports network errors as retryable upstream errors', async () => {
    const { http } = setup((url) => (isServerTime(url) ? serverTimeReply : new Error('ECONNRESET')), { maxRetries: 0 });
    const error = await rejection(http.get('/wallet/balance/'));
    expect(error).toMatchObject({ kind: 'upstream', retryable: true });
    expect(error.message).toContain('network error');
  });

  it('spaces Ripio Trade requests but not Wallet requests', async () => {
    const { http, sleeps } = setup(() => walletOk([]), { tradeRps: 1 });
    await http.get('/trade/public/tickers', { signed: false });
    await http.get('/trade/public/tickers', { signed: false });
    await http.get('/trade/public/tickers', { signed: false });
    await http.get('/wallet/rates/', { signed: false });
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('refuses to follow redirects, so a signed request never leaves api.ripio.com', async () => {
    const { http, calls } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({})));
    await http.get('/wallet/balance/');
    expect(calls.map((call) => call.redirect)).toEqual(['error', 'error']);
  });

  it('does not wait out a Retry-After longer than 10 seconds', async () => {
    const { http, sleeps } = setup((url) =>
      isServerTime(url)
        ? serverTimeReply
        : { status: 429, body: { error_code: 429, message: 'Too many requests' }, headers: { 'retry-after': '3600' } },
    );
    const error = await rejection(http.get('/wallet/balance/'));
    expect(error.kind).toBe('rate_limited');
    expect(sleeps).toEqual([]);
  });

  it('keeps the normal backoff when Retry-After is a date', async () => {
    let attempts = 0;
    const { http, sleeps } = setup((url) => {
      if (isServerTime(url)) return serverTimeReply;
      attempts += 1;
      return attempts === 1
        ? {
            status: 429,
            body: { error_code: 429, message: 'Too many requests' },
            headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' },
          }
        : walletOk({});
    });
    await http.get('/wallet/balance/');
    expect(sleeps).toEqual([500]);
  });

  it('identifies itself with a User-Agent', async () => {
    const { http, calls } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({})), {
      userAgent: 'ripio-community-mcp/9.9.9',
    });
    await http.get('/wallet/balance/');
    expect(calls.map((call) => call.headers['User-Agent'])).toEqual(['ripio-community-mcp/9.9.9', 'ripio-community-mcp/9.9.9']);
  });

  it('uses the package name as the default User-Agent', async () => {
    const { http, calls } = setup((url) => (isServerTime(url) ? serverTimeReply : walletOk({})));
    await http.get('/wallet/balance/');
    expect(calls[0]?.headers['User-Agent']).toBe('ripio-community-mcp');
  });

  it('waits out a Retry-After of exactly 10 seconds', async () => {
    let attempts = 0;
    const { http, sleeps } = setup((url) => {
      if (isServerTime(url)) return serverTimeReply;
      attempts += 1;
      return attempts === 1
        ? { status: 429, body: { error_code: 429, message: 'Too many requests' }, headers: { 'retry-after': '10' } }
        : walletOk({});
    });
    await http.get('/wallet/balance/');
    expect(sleeps).toEqual([10_000]);
  });

  it('fails fast on a Retry-After of 11 seconds', async () => {
    const { http, sleeps } = setup((url) =>
      isServerTime(url)
        ? serverTimeReply
        : { status: 429, body: { error_code: 429, message: 'Too many requests' }, headers: { 'retry-after': '11' } },
    );
    const error = await rejection(http.get('/wallet/balance/'));
    expect(error).toMatchObject({ kind: 'rate_limited', retryAfterMs: 11_000 });
    expect(sleeps).toEqual([]);
  });
});
