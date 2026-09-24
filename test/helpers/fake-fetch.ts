import type { FetchLike } from '../../src/ripio/http.js';

export type FakeReply = { status: number; body: unknown; headers?: Record<string, string> } | Error | 'hang';

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
}

/** A fetch stand-in: `reply` decides each answer; every call is recorded. */
export function fakeFetch(reply: (url: URL, index: number) => FakeReply): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, method: init.method, headers: init.headers });
    const result = reply(parsed, calls.length - 1);
    if (result === 'hang') {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    if (result instanceof Error) return Promise.reject(result);
    const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    const headers = result.headers ?? {};
    return Promise.resolve({
      status: result.status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => text,
    });
  };
  return { fetch, calls };
}

export const SERVER_TIME_MS = 1_700_000_001_000;

export const serverTimeReply: FakeReply = { status: 200, body: { data: { timestamp: SERVER_TIME_MS }, message: null } };

export const walletOk = (data: unknown): FakeReply => ({ status: 200, body: { error_code: null, message: null, data } });

export const tradeOk = (data: unknown): FakeReply => ({ status: 200, body: { data, error_code: null, message: null } });

export const ripioError = (status: number, message: string, code: string | number = status): FakeReply => ({
  status,
  body: { error_code: code, message, data: null },
});
