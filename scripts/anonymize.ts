import Big from 'big.js';

/** Values under these keys are public market data, enums or flags, and are kept as recorded. */
const KEEP_KEYS = new Set([
  'ticker',
  'pair',
  'side',
  'type',
  'status',
  'transaction_type',
  'operation',
  'currency',
  'currency_code',
  'from_currency',
  'to_currency',
  'fee_currency',
  'rail',
  'symbol',
  'current_page',
  'total_pages',
  'buy_rate',
  'sell_rate',
  'variation',
  'bid',
  'ask',
  'last',
  'price',
  'price_change_percent_24h',
  'maker',
  'taker',
]);
/** Keys holding account-specific amounts. */
const AMOUNT_KEY = /(amount|balance|value|fee|volume|qty|total)/i;
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
/** Keys holding dates: when the user did something is account data too. */
const DATE_KEYS = new Set(['created_at', 'updated_at', 'create_date', 'date', 'last_update', 'timestamp']);
const TIMESTAMP = /^(\d{4})-\d{2}-\d{2}(?:([ T])\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Makes a recorded Ripio response safe to publish. Amounts become random values with the same sign,
 * order of magnitude and decimals, so there is no factor to divide back; dates move to a random moment of the
 * same year; every other field that is not known to be safe is redacted (ids stay numeric so the schemas still apply).
 */
export function anonymize(value: unknown, random: () => number = Math.random): unknown {
  let redacted = 0;
  const walk = (node: unknown, key: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (typeof node === 'object' && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]));
    }
    if (node === null || node === undefined || typeof node === 'boolean' || KEEP_KEYS.has(key)) return node;
    if (DATE_KEYS.has(key) && typeof node === 'string') {
      const moved = randomTimestamp(node, random);
      if (moved !== undefined) return moved;
    }
    if (AMOUNT_KEY.test(key)) {
      if (typeof node === 'number' && Number.isFinite(node)) return Number(randomLike(new Big(node).toFixed(), random));
      if (typeof node === 'string' && PLAIN_DECIMAL.test(node)) return randomLike(node, random);
    }
    redacted += 1;
    return typeof node === 'number' ? 100000 + redacted : `redacted-${redacted}`;
  };
  return walk(value, '');
}

/** A random moment in the same year as `value`, written in exactly the same format (separator, precision, zone). */
function randomTimestamp(value: string, random: () => number): string | undefined {
  const match = TIMESTAMP.exec(value);
  if (!match) return undefined;
  const [, year, separator, seconds, fraction, zone] = match;
  const pad = (n: number) => String(n).padStart(2, '0');
  const pick = (max: number) => Math.floor(random() * max);
  let out = `${year}-${pad(1 + pick(12))}-${pad(1 + pick(28))}`;
  if (separator !== undefined) {
    out += `${separator}${pad(pick(24))}:${pad(pick(60))}`;
    if (seconds !== undefined) out += `:${pad(pick(60))}`;
    if (fraction !== undefined) out += `.${Array.from({ length: fraction.length - 1 }, () => pick(10)).join('')}`;
  }
  return out + (zone ?? '');
}

/** A random plain decimal with the same sign, order of magnitude and number of decimals as `plain`. */
function randomLike(plain: string, random: () => number): string {
  const size = new Big(plain).abs();
  if (size.eq(0)) return plain;
  const decimals = plain.includes('.') ? plain.length - plain.indexOf('.') - 1 : 0;
  const mantissa = 1 + Math.floor(random() * 9000) / 1000;
  const replaced = new Big(`${mantissa}e${size.e}`).toFixed(decimals);
  return plain.startsWith('-') ? `-${replaced}` : replaced;
}
