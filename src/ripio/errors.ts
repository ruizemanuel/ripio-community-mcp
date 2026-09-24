export type RipioErrorKind =
  | 'config'
  | 'auth_token'
  | 'auth_signature'
  | 'auth_clock'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'upstream'
  | 'schema';

export interface RipioErrorOptions {
  status?: number;
  code?: string;
  endpoint?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  details?: string;
  cause?: unknown;
}

/** Every failure talking to Ripio (or configuring the server) ends up as one of these. */
export class RipioApiError extends Error {
  readonly kind: RipioErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly endpoint: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly details: string | undefined;

  constructor(kind: RipioErrorKind, message: string, options: RipioErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'RipioApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

/** Maps a non-2xx Ripio response to a typed error. `message` must already be safe to show (no HTML). */
export function classifyHttpError(
  status: number,
  message: string,
  endpoint: string,
  extra: { code?: string; retryAfterMs?: number } = {},
): RipioApiError {
  const base = { status, endpoint, code: extra.code };
  const lower = message.toLowerCase();
  if (status === 401) {
    if (lower.includes('timestamp')) return new RipioApiError('auth_clock', message, base);
    if (lower.includes('signature')) return new RipioApiError('auth_signature', message, base);
    return new RipioApiError('auth_token', message, base);
  }
  if (status === 403) return new RipioApiError('forbidden', message, base);
  if (status === 404) return new RipioApiError('not_found', message, base);
  if (status === 429) {
    return new RipioApiError('rate_limited', message, { ...base, retryable: true, retryAfterMs: extra.retryAfterMs });
  }
  if (status >= 400 && status < 500) return new RipioApiError('bad_request', message, base);
  return new RipioApiError('upstream', message, { ...base, retryable: RETRYABLE_STATUS.has(status) });
}
