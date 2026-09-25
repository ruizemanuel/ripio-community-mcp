import type { CallToolResult } from '@modelcontextprotocol/server';
import { RipioApiError } from '../ripio/errors.js';
import { MAX_RETRY_AFTER_MS } from '../ripio/http.js';

export type Logger = (message: string) => void;

export const stderrLogger: Logger = (message) => {
  process.stderr.write(`[ripio-community-mcp] ${message}\n`);
};

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** The summary, then the full result as JSON text for clients that ignore structuredContent (MCP 2025-06-18). */
export function ok(structured: Record<string, unknown>, summary: string): CallToolResult {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(structured) },
    ],
    structuredContent: structured,
  };
}

export function failText(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Permission names as shown in Ripio → Profile → API (English interface). Other endpoints get generic advice. */
const SCOPE_BY_PATH: Array<[RegExp, string]> = [
  [/^\/wallet\/balance\//, 'Balance'],
  [/^\/trade\/user\/balances/, 'Balance'],
  [/^\/trade\/user\/statement/, 'Statement'],
  [/^\/trade\/(orders|user\/trading-fees)/, 'Trading'],
  [/^\/wallet\/(addresses|network\/currency-networks|currencies|banking\/deposit-accounts)\//, 'General data'],
];

const DEPOSIT_ACCOUNTS_NOTE = ' Ripio only offers deposit accounts through the API to users in Argentina and Brazil.';

function scopeFor(endpoint: string | undefined): string | undefined {
  if (endpoint === undefined) return undefined;
  return SCOPE_BY_PATH.find(([pattern]) => pattern.test(endpoint))?.[1];
}

/** A Retry-After as a person would say it: "45 seconds", "about 12 minutes", "about 3 hours". */
function waitText(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 120) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 120 ? `about ${minutes} minutes` : `about ${Math.ceil(minutes / 60)} hours`;
}

export function userMessage(error: unknown): string {
  if (!(error instanceof RipioApiError)) {
    return 'Unexpected error while talking to Ripio. Check the server logs (stderr).';
  }
  switch (error.kind) {
    case 'config':
      return error.message;
    case 'auth_token':
      return 'Ripio rejected the API key (invalid or revoked). Create a new key in Ripio → Profile → API and update RIPIO_API_KEY / RIPIO_API_SECRET.';
    case 'auth_signature':
      return "Ripio rejected the request signature: RIPIO_API_SECRET doesn't match RIPIO_API_KEY.";
    case 'auth_clock':
      return "Ripio rejected the request time even after re-syncing the clock. Check your computer's date and time.";
    case 'forbidden': {
      // Keys made with the README's "Read-only" preset have every read permission, so a changed IP is likelier.
      const scope = scopeFor(error.endpoint);
      const ip = `Ripio denied access to ${error.endpoint ?? 'this endpoint'}. If your key only allows specific IPs, your public IP may have changed: add the new one to the key in Ripio → Profile → API.`;
      const message = scope
        ? `${ip} Otherwise the key lacks the "${scope}" permission.`
        : `${ip} Otherwise use a key with the full "Read-only" preset.`;
      return error.endpoint?.startsWith('/wallet/banking/deposit-accounts/') ? `${message}${DEPOSIT_ACCOUNTS_NOTE}` : message;
    }
    case 'not_found':
      return `Not found: ${error.endpoint ?? 'the requested resource'}.`;
    case 'bad_request':
      return error.status === undefined ? error.message : `Ripio rejected the request: ${error.message}`;
    case 'rate_limited': {
      const wait =
        error.retryAfterMs !== undefined && error.retryAfterMs > MAX_RETRY_AFTER_MS
          ? `Ripio asks to wait ${waitText(error.retryAfterMs)} before trying again.`
          : 'Try again in a few seconds.';
      return `Ripio rate limit reached (Ripio Trade allows 1 request/second without verified documents). ${wait}`;
    }
    case 'upstream':
      return `Ripio API unavailable${error.status === undefined ? '' : ` (HTTP ${error.status})`}: ${error.message}. Try again later.`;
    case 'schema':
      return `Unexpected response from ${error.endpoint ?? 'Ripio'}; Ripio may have changed its API. Please report it at https://github.com/ruizemanuel/ripio-community-mcp/issues`;
  }
}

export function fail(error: unknown, log: Logger): CallToolResult {
  if (error instanceof RipioApiError) {
    const details = error.details === undefined ? '' : ` | ${error.details}`;
    log(`${error.kind} ${error.endpoint ?? '-'} ${error.status ?? '-'} ${error.message}${details}`);
  } else {
    log(`unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }
  return failText(userMessage(error));
}
