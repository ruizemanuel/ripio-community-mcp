import * as z from 'zod/v4';
import type { TradeBalance, WalletBalance, WalletRate } from '../ripio/schemas.js';
import { add, compare, divide, fixed, isZero, mul, sum, toDecimal, type Decimal } from './money.js';

export const HoldingSchema = z.object({
  asset: z.string(),
  venue: z.enum(['wallet', 'memecoin', 'trade']),
  available: z.string(),
  locked: z.string(),
  total: z.string(),
  value_ars: z.string().optional(),
  value_usd: z.string().optional(),
});

export const PortfolioSchema = z.object({
  as_of: z.string(),
  valuation: z.object({
    method: z.literal('wallet_sell_rate'),
    usd_reference: z.string().optional(),
    note: z.string(),
  }),
  holdings: z.array(HoldingSchema),
  totals: z.object({
    value_ars: z.string(),
    value_usd: z.string().optional(),
    unvalued_assets: z.array(z.string()),
  }),
  warnings: z.array(z.string()),
});

export type Holding = z.infer<typeof HoldingSchema>;
export type Portfolio = z.infer<typeof PortfolioSchema>;

/** Rates tried, in order, to convert ARS values to USD. */
const USD_REFERENCES = ['USD_ARS', 'USDT_ARS', 'USDC_ARS'];

export const VALUATION_NOTE =
  'Estimated at Ripio app sell rates (what you would receive selling now). Not a firm quote.';

export interface PortfolioInput {
  wallet: WalletBalance;
  trade?: TradeBalance[];
  rates?: WalletRate[];
  asOf: Date;
  includeZero: boolean;
  warnings?: string[];
}

type RawAmount = number | string | null | undefined;

export function buildPortfolio(input: PortfolioInput): Portfolio {
  const warnings = [...(input.warnings ?? [])];
  const sellRates = new Map<string, Decimal>();
  for (const rate of input.rates ?? []) {
    const sell = toDecimal(rate.sell_rate);
    if (sell !== undefined && !isZero(sell)) sellRates.set(rate.ticker.toUpperCase(), sell);
  }
  const usdReference = USD_REFERENCES.find((ticker) => sellRates.has(ticker));
  const usdArs = usdReference === undefined ? undefined : sellRates.get(usdReference);
  const arsPrice = (asset: string): Decimal | undefined => (asset === 'ARS' ? '1' : sellRates.get(`${asset}_ARS`));

  const holdings: Holding[] = [];
  const addHolding = (asset: string, venue: Holding['venue'], availableRaw: RawAmount, lockedRaw: RawAmount): void => {
    const available = toDecimal(availableRaw) ?? '0';
    const locked = toDecimal(lockedRaw) ?? '0';
    const total = add(available, locked);
    if (!input.includeZero && isZero(total)) return;
    const holding: Holding = { asset, venue, available, locked, total };
    const price = arsPrice(asset);
    if (price !== undefined) {
      holding.value_ars = fixed(mul(total, price), 2);
      const usd = usdArs === undefined ? undefined : divide(holding.value_ars, usdArs, 2);
      if (usd !== undefined) holding.value_usd = fixed(usd, 2);
    }
    holdings.push(holding);
  };

  for (const entry of input.wallet.wallet) {
    addHolding(entry.currency.toUpperCase(), 'wallet', entry.amount, entry.locked_amount);
  }
  let unreadable = 0;
  for (const entry of input.wallet.virals ?? []) {
    const asset = (entry.currency ?? entry.symbol)?.toUpperCase();
    const amount = entry.amount ?? entry.balance;
    if (asset === undefined || amount === null || amount === undefined) {
      unreadable += 1;
      continue;
    }
    addHolding(asset, 'memecoin', amount, entry.locked_amount);
  }
  if (unreadable > 0) warnings.push(`${unreadable} memecoin balance(s) could not be read.`);
  for (const entry of input.trade ?? []) {
    addHolding(entry.currency_code.toUpperCase(), 'trade', entry.available_amount, entry.locked_amount);
  }

  holdings.sort((a, b) => {
    if (a.value_ars !== undefined && b.value_ars !== undefined) return compare(b.value_ars, a.value_ars);
    if (a.value_ars !== undefined) return -1;
    if (b.value_ars !== undefined) return 1;
    return a.asset.localeCompare(b.asset);
  });

  const valueArs = fixed(sum(holdings.flatMap((h) => (h.value_ars === undefined ? [] : [h.value_ars]))), 2);
  const usdTotal = usdArs === undefined ? undefined : divide(valueArs, usdArs, 2);
  const unvalued = [
    ...new Set(holdings.filter((h) => h.value_ars === undefined && !isZero(h.total)).map((h) => h.asset)),
  ];

  return {
    as_of: input.asOf.toISOString(),
    valuation: { method: 'wallet_sell_rate', usd_reference: usdReference, note: VALUATION_NOTE },
    holdings,
    totals: {
      value_ars: valueArs,
      value_usd: usdTotal === undefined ? undefined : fixed(usdTotal, 2),
      unvalued_assets: unvalued,
    },
    warnings,
  };
}
