import { TtlCache } from './cache.js';
import type { RipioHttp } from './http.js';
import type {
  TradeBalance,
  TradeFee,
  TradeOpenOrders,
  TradePriceEstimate,
  TradeStatement,
  TradeTicker,
  WalletAddress,
  WalletBalance,
  WalletCurrency,
  WalletCurrencyNetwork,
  WalletDepositAccount,
  WalletLimit,
  WalletRail,
  WalletRate,
  WalletTransaction,
  WalletTransactionPage,
} from './schemas.js';
import {
  estimateTradePrice,
  getTradeBalances,
  getTradeFees,
  getTradeStatement,
  getTradeTickers,
  listTradeOpenOrders,
  type OpenOrdersQuery,
  type TradeStatementQuery,
} from './trade.js';
import {
  getCurrencyNetworks,
  getDepositAccounts,
  getWalletAddresses,
  getWalletBalance,
  getWalletCurrencies,
  getWalletLimits,
  getWalletRails,
  getWalletRates,
  getWalletTransaction,
  listWalletTransactions,
  type RailQuery,
  type WalletTransactionsQuery,
} from './wallet.js';

export interface RipioClient {
  walletBalance(): Promise<WalletBalance>;
  walletRates(): Promise<WalletRate[]>;
  walletTransactions(query: WalletTransactionsQuery): Promise<WalletTransactionPage>;
  walletTransaction(id: number): Promise<WalletTransaction>;
  walletLimits(query: RailQuery): Promise<WalletLimit[]>;
  walletRails(query: RailQuery): Promise<WalletRail[]>;
  walletAddresses(): Promise<WalletAddress[]>;
  walletCurrencyNetworks(currency: string): Promise<WalletCurrencyNetwork[]>;
  walletCurrencies(): Promise<WalletCurrency[]>;
  walletDepositAccounts(): Promise<WalletDepositAccount[]>;
  tradeBalances(): Promise<TradeBalance[]>;
  tradeTickers(): Promise<TradeTicker[]>;
  tradeStatement(query: TradeStatementQuery): Promise<TradeStatement>;
  tradeFees(pair: string): Promise<TradeFee[]>;
  tradeEstimatePrice(pair: string, amount: string, side: 'buy' | 'sell'): Promise<TradePriceEstimate>;
  tradeOpenOrders(query: OpenOrdersQuery): Promise<TradeOpenOrders>;
}

export const CACHE_TTL_MS = { rates: 10_000, tickers: 10_000, fees: 300_000, currencies: 300_000 } as const;

export function createRipioClient(http: RipioHttp, now: () => number = Date.now): RipioClient {
  const cache = new TtlCache(now);
  return {
    walletBalance: () => getWalletBalance(http),
    walletRates: () => cache.getOrLoad('wallet-rates', CACHE_TTL_MS.rates, () => getWalletRates(http)),
    walletTransactions: (query) => listWalletTransactions(http, query),
    walletTransaction: (id) => getWalletTransaction(http, id),
    walletLimits: (query) => getWalletLimits(http, query),
    walletRails: (query) => getWalletRails(http, query),
    // Addresses can rotate and network status can change, so neither is cached.
    walletAddresses: () => getWalletAddresses(http),
    walletCurrencyNetworks: (currency) => getCurrencyNetworks(http, currency),
    walletCurrencies: () => cache.getOrLoad('wallet-currencies', CACHE_TTL_MS.currencies, () => getWalletCurrencies(http)),
    walletDepositAccounts: () => getDepositAccounts(http),
    tradeBalances: () => getTradeBalances(http),
    tradeTickers: () => cache.getOrLoad('trade-tickers', CACHE_TTL_MS.tickers, () => getTradeTickers(http)),
    tradeStatement: (query) => getTradeStatement(http, query),
    tradeFees: (pair) => cache.getOrLoad(`trade-fees:${pair}`, CACHE_TTL_MS.fees, () => getTradeFees(http, pair)),
    tradeEstimatePrice: (pair, amount, side) => estimateTradePrice(http, pair, amount, side),
    tradeOpenOrders: (query) => listTradeOpenOrders(http, query),
  };
}
