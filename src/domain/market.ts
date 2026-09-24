import * as z from 'zod/v4';
import { RipioApiError } from '../ripio/errors.js';
import type { TradeFee, TradeTicker, WalletRate } from '../ripio/schemas.js';
import { add, divide, isZero, mul, round, sub, toDecimal, type Decimal } from './money.js';

export const QuoteSchema = z.enum(['ARS', 'USD']);
export type Quote = z.infer<typeof QuoteSchema>;

export const PriceEntrySchema = z.object({
  asset: z.string(),
  app: z
    .object({ ticker: z.string(), buy: z.string(), sell: z.string(), spread_pct: z.string().optional() })
    .optional(),
  exchange: z
    .object({
      pair: z.string(),
      bid: z.string().optional(),
      ask: z.string().optional(),
      last: z.string().optional(),
      change_24h_pct: z.string().optional(),
      volume_24h: z.string().optional(),
    })
    .optional(),
});

export const PricesSchema = z.object({
  as_of: z.string(),
  quote: QuoteSchema,
  prices: z.array(PriceEntrySchema),
  not_found: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type PriceEntry = z.infer<typeof PriceEntrySchema>;
export type Prices = z.infer<typeof PricesSchema>;

function candidateTickers(asset: string, quote: Quote): string[] {
  return quote === 'USD' ? [`${asset}_USD`, `${asset}_USDT`, `${asset}_USDC`] : [`${asset}_${quote}`];
}

function spreadPct(buy: Decimal, sell: Decimal): Decimal | undefined {
  const ratio = divide(sub(buy, sell), sell, 10);
  return ratio === undefined ? undefined : round(mul(ratio, '100'), 2);
}

export interface PricesInput {
  assets: string[];
  quote: Quote;
  rates?: WalletRate[];
  tickers?: TradeTicker[];
  asOf: Date;
  warnings?: string[];
}

export function buildPrices(input: PricesInput): Prices {
  const rates = new Map((input.rates ?? []).map((rate) => [rate.ticker.toUpperCase(), rate] as const));
  const tickers = new Map((input.tickers ?? []).map((ticker) => [ticker.pair.toUpperCase(), ticker] as const));
  const assets = [...new Set(input.assets.map((asset) => asset.trim().toUpperCase()).filter((asset) => asset !== ''))];
  const prices: PriceEntry[] = [];
  const notFound: string[] = [];
  for (const asset of assets) {
    const candidates = candidateTickers(asset, input.quote);
    const entry: PriceEntry = { asset };
    const rateTicker = candidates.find((ticker) => rates.has(ticker));
    const rate = rateTicker === undefined ? undefined : rates.get(rateTicker);
    const buy = toDecimal(rate?.buy_rate);
    const sell = toDecimal(rate?.sell_rate);
    if (rateTicker !== undefined && buy !== undefined && sell !== undefined) {
      entry.app = { ticker: rateTicker, buy, sell, spread_pct: spreadPct(buy, sell) };
    }
    const pair = candidates.find((ticker) => tickers.has(ticker));
    const ticker = pair === undefined ? undefined : tickers.get(pair);
    if (pair !== undefined && ticker !== undefined) {
      entry.exchange = {
        pair,
        bid: toDecimal(ticker.bid),
        ask: toDecimal(ticker.ask),
        last: toDecimal(ticker.last),
        change_24h_pct: toDecimal(ticker.price_change_percent_24h),
        volume_24h: toDecimal(ticker.volume),
      };
    }
    if (entry.app === undefined && entry.exchange === undefined) notFound.push(asset);
    else prices.push(entry);
  }
  return {
    as_of: input.asOf.toISOString(),
    quote: input.quote,
    prices,
    not_found: notFound,
    warnings: [...(input.warnings ?? [])],
  };
}

export const TradeEstimateOutputSchema = z.object({
  pair: z.string(),
  side: z.enum(['buy', 'sell']),
  amount: z.string(),
  estimated_unit_price: z.string(),
  gross_value: z.string(),
  taker_fee_pct: z.string().optional(),
  estimated_fee: z.string().optional(),
  estimated_total: z.string(),
  note: z.string(),
  warnings: z.array(z.string()),
});
export type TradeEstimateOutput = z.infer<typeof TradeEstimateOutputSchema>;

export const ESTIMATE_NOTE =
  'Market-order estimate with your taker fee, in the quote currency. Not a firm quote; nothing was executed.';

export interface TradeEstimateInput {
  pair: string;
  side: 'buy' | 'sell';
  amount: Decimal;
  price: number | string;
  fees?: TradeFee[];
  warnings?: string[];
}

export function buildTradeEstimate(input: TradeEstimateInput): TradeEstimateOutput {
  const unitPrice = toDecimal(input.price);
  if (unitPrice === undefined || isZero(unitPrice)) {
    throw new RipioApiError('schema', `Ripio returned no usable price estimate for ${input.pair}`, {
      endpoint: `/trade/orders/estimate-price/${input.pair}`,
    });
  }
  const gross = round(mul(input.amount, unitPrice), 8);
  const takerPct = toDecimal(input.fees?.find((fee) => fee.side.toLowerCase() === input.side)?.taker);
  const output: TradeEstimateOutput = {
    pair: input.pair,
    side: input.side,
    amount: input.amount,
    estimated_unit_price: unitPrice,
    gross_value: gross,
    estimated_total: gross,
    note: ESTIMATE_NOTE,
    warnings: [...(input.warnings ?? [])],
  };
  if (takerPct !== undefined) {
    const fee = divide(mul(gross, takerPct), '100', 8) ?? '0';
    output.taker_fee_pct = takerPct;
    output.estimated_fee = fee;
    output.estimated_total = input.side === 'buy' ? add(gross, fee) : sub(gross, fee);
  }
  return output;
}
