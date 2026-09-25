import { RipioApiError } from './errors.js';
import { signRequest } from './signing.js';
import { parseRetryAfter, unwrapResponse } from './unwrap.js';

export const RIPIO_BASE_URL = 'https://api.ripio.com';
const SERVER_TIME_PATH = '/trade/public/server-time';
/** The longest Retry-After worth waiting out inside one tool call; beyond it the error goes back to the user. */
const MAX_RETRY_AFTER_MS = 10_000;

export interface FetchResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal; redirect: 'error' },
) => Promise<FetchResponseLike>;

export type Query = Record<string, string | number | undefined>;

export interface RipioHttpOptions {
  apiKey: string;
  apiSecret: string;
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Ripio Trade allows 1 request/second (3.5 with verified documents). */
  tradeRps?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Sent as User-Agent so Ripio can tell this client apart. */
  userAgent?: string;
}

export interface GetOptions {
  query?: Query;
  /** Private endpoints are signed; public ones (tickers, server time) are not. Default true. */
  signed?: boolean;
}

/** Signed, rate-limited, retrying client for the Ripio Retail API. It can only send GET requests. */
export class RipioHttp {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly tradeIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly userAgent: string;
  private clockOffsetMs: number | undefined;
  private clockSync: Promise<number> | undefined;
  private nextTradeSlotMs = 0;

  constructor(options: RipioHttpOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
    this.tradeIntervalMs = 1000 / (options.tradeRps ?? 1);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.userAgent = options.userAgent ?? 'ripio-community-mcp';
  }

  async get(path: string, options: GetOptions = {}): Promise<unknown> {
    const signed = options.signed ?? true;
    let retries = 0;
    let clockResynced = false;
    for (;;) {
      try {
        return await this.send(path, options.query, signed);
      } catch (error) {
        if (!(error instanceof RipioApiError)) throw error;
        if (error.kind === 'auth_clock' && signed && !clockResynced) {
          clockResynced = true;
          this.clockOffsetMs = undefined;
          continue;
        }
        if (error.retryable && retries < this.maxRetries && (error.retryAfterMs ?? 0) <= MAX_RETRY_AFTER_MS) {
          await this.sleep(this.backoffMs(retries, error.retryAfterMs));
          retries += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private backoffMs(retry: number, retryAfterMs: number | undefined): number {
    if (retryAfterMs !== undefined) return retryAfterMs;
    return (retry === 0 ? 500 : 1500) + Math.floor(this.random() * 250);
  }

  private async send(path: string, query: Query | undefined, signed: boolean): Promise<unknown> {
    const url = new URL(path, RIPIO_BASE_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const offset = signed ? await this.clockOffset() : 0;
    if (url.pathname.startsWith('/trade/')) await this.waitForTradeSlot();
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': this.userAgent };
    if (signed) {
      const timestamp = String(Math.round(this.now() + offset));
      headers.Authorization = this.apiKey;
      headers.Timestamp = timestamp;
      headers.Signature = signRequest(this.apiSecret, timestamp, 'GET', url.pathname);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number;
    let retryAfter: string | null;
    let text: string;
    try {
      const response = await this.fetchFn(url.toString(), { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
      status = response.status;
      retryAfter = response.headers.get('retry-after');
      text = await response.text();
    } catch (cause) {
      const reason = controller.signal.aborted ? 'timed out' : 'network error';
      throw new RipioApiError('upstream', `Ripio API unreachable (${reason})`, {
        endpoint: url.pathname,
        retryable: true,
        cause,
      });
    } finally {
      clearTimeout(timer);
    }
    return unwrapResponse(url.pathname, status, text, parseRetryAfter(retryAfter));
  }

  private async clockOffset(): Promise<number> {
    if (this.clockOffsetMs !== undefined) return this.clockOffsetMs;
    this.clockSync ??= this.syncClock().finally(() => {
      this.clockSync = undefined;
    });
    return this.clockSync;
  }

  private async syncClock(): Promise<number> {
    const before = this.now();
    const data = await this.send(SERVER_TIME_PATH, undefined, false);
    const after = this.now();
    const serverTime = typeof data === 'object' && data !== null ? (data as { timestamp?: unknown }).timestamp : undefined;
    if (typeof serverTime !== 'number') {
      throw new RipioApiError('schema', `Unexpected response from ${SERVER_TIME_PATH}`, { endpoint: SERVER_TIME_PATH });
    }
    this.clockOffsetMs = serverTime - Math.round((before + after) / 2);
    return this.clockOffsetMs;
  }

  private async waitForTradeSlot(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextTradeSlotMs);
    this.nextTradeSlotMs = slot + this.tradeIntervalMs;
    if (slot > now) await this.sleep(slot - now);
  }
}
