import { classifyHttpError, RipioApiError } from './errors.js';

const MAX_MESSAGE_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function looksLikeHtml(text: string): boolean {
  return /^\s*</.test(text);
}

/**
 * Returns `data` from a Ripio response. Wallet answers `{error_code, message, data}` and Trade
 * `{data, error_code, message, timestamp?}`; both carry `data`. Non-2xx answers become a
 * RipioApiError whose message never contains HTML.
 */
export function unwrapResponse(endpoint: string, status: number, text: string, retryAfterMs?: number): unknown {
  const json = parseJson(text);
  if (status >= 200 && status < 300) {
    if (isRecord(json) && 'data' in json) return json.data;
    throw new RipioApiError('schema', `Unexpected response from ${endpoint}`, {
      status,
      endpoint,
      details: looksLikeHtml(text) ? 'HTML body' : 'missing data envelope',
    });
  }
  const ripioMessage = isRecord(json) && typeof json.message === 'string' ? json.message.trim() : '';
  const fallback = looksLikeHtml(text) ? '' : text.trim();
  const message = (ripioMessage || fallback).slice(0, MAX_MESSAGE_LENGTH) || `HTTP ${status}`;
  const code =
    isRecord(json) && json.error_code !== null && json.error_code !== undefined ? String(json.error_code) : undefined;
  throw classifyHttpError(status, message, endpoint, { code, retryAfterMs });
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || header.trim() === '') return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}
