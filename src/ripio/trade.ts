import type { RipioHttp } from './http.js';
import {
  parseResponse,
  TradeBalancesSchema,
  TradeEstimateSchema,
  TradeFeesSchema,
  TradeOpenOrdersSchema,
  TradeStatementSchema,
  TradeTickersSchema,
  type TradeBalance,
  type TradeFee,
  type TradeOpenOrders,
  type TradePriceEstimate,
  type TradeStatement,
  type TradeTicker,
} from './schemas.js';

export type TradeStatementQuery = { start_time?: string; end_time?: string; current_page?: number; page_size?: number };
export type OpenOrdersQuery = { pair?: string; side?: string; c?: string };

const BALANCES = '/trade/user/balances';
const TICKERS = '/trade/public/tickers';
const STATEMENT = '/trade/user/statement';
const FEES = '/trade/user/trading-fees';
const OPEN_ORDERS = '/trade/orders/open';

export async function getTradeBalances(http: RipioHttp): Promise<TradeBalance[]> {
  return parseResponse(TradeBalancesSchema, await http.get(BALANCES), BALANCES);
}

export async function getTradeTickers(http: RipioHttp): Promise<TradeTicker[]> {
  return parseResponse(TradeTickersSchema, await http.get(TICKERS, { signed: false }), TICKERS);
}

export async function getTradeStatement(http: RipioHttp, query: TradeStatementQuery): Promise<TradeStatement> {
  return parseResponse(TradeStatementSchema, await http.get(STATEMENT, { query }), STATEMENT);
}

/** Ripio requires `pair` here (it answers 400 "Invalid pair" without it), although its docs list no parameters. */
export async function getTradeFees(http: RipioHttp, pair: string): Promise<TradeFee[]> {
  return parseResponse(TradeFeesSchema, await http.get(FEES, { query: { pair } }), FEES);
}

export async function estimateTradePrice(
  http: RipioHttp,
  pair: string,
  amount: string,
  side: 'buy' | 'sell',
): Promise<TradePriceEstimate> {
  const path = `/trade/orders/estimate-price/${encodeURIComponent(pair)}`;
  return parseResponse(TradeEstimateSchema, await http.get(path, { query: { amount, side } }), path);
}

export async function listTradeOpenOrders(http: RipioHttp, query: OpenOrdersQuery): Promise<TradeOpenOrders> {
  return parseResponse(TradeOpenOrdersSchema, await http.get(OPEN_ORDERS, { query }), OPEN_ORDERS);
}
