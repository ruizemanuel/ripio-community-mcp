const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** ISO 8601 UTC. Timestamps without a zone (Ripio Trade sends some) are assumed to be UTC. */
export function toIsoDate(value: string): string {
  const candidate = NAIVE_DATETIME.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const ms = Date.parse(candidate);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/** Start of a filter range: a bare date means 00:00:00.000 UTC that day. */
export function rangeStart(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : toIsoDate(value);
}

/** End of a filter range: a bare date means 23:59:59.999 UTC that day. */
export function rangeEnd(value: string): string {
  return DATE_ONLY.test(value) ? `${value}T23:59:59.999Z` : toIsoDate(value);
}

export function isWithin(isoDate: string, from?: string, to?: string): boolean {
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return true;
  if (from !== undefined && time < Date.parse(rangeStart(from))) return false;
  if (to !== undefined && time > Date.parse(rangeEnd(to))) return false;
  return true;
}
