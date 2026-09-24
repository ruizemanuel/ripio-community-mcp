import Big from 'big.js';

/** Keys whose values identify the account or a counterparty. */
const REDACT_KEY =
  /^(id|nc|pc|c)$|(^|_)(id|hash|address|destination|origin|cbu|cvu|alias|name|email|ticket|tag|memo|account|reference)$/i;
/** Keys holding account-specific amounts; scaled so real balances are not published. */
const SCALE_KEY = /(amount|balance|value|fee|volume|qty)/i;
const SCALE = '0.37';
const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

export function anonymize(value: unknown, key = '', counter = { n: 0 }): unknown {
  if (Array.isArray(value)) return value.map((item) => anonymize(item, key, counter));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, anonymize(v, k, counter)]));
  }
  if (value === null || value === undefined) return value;
  if (REDACT_KEY.test(key)) {
    counter.n += 1;
    return typeof value === 'number' ? 100000 + counter.n : `redacted-${counter.n}`;
  }
  if (SCALE_KEY.test(key)) {
    if (typeof value === 'number') return Number(new Big(value).times(SCALE).toFixed(8));
    if (typeof value === 'string' && NUMERIC_STRING.test(value)) return new Big(value).times(SCALE).toFixed(8);
  }
  return value;
}
