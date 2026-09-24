import type { RipioHttp } from './http.js';
import {
  parseResponse,
  WalletBalanceSchema,
  WalletLimitsSchema,
  WalletRailsSchema,
  WalletRatesSchema,
  WalletTransactionPageSchema,
  WalletTransactionSchema,
  type WalletBalance,
  type WalletLimit,
  type WalletRail,
  type WalletRate,
  type WalletTransaction,
  type WalletTransactionPage,
} from './schemas.js';

export type WalletTransactionsQuery = { rail?: string; transaction_type?: string; currency?: string; cursor?: string };
export type RailQuery = { rail?: string; transaction_type?: string };

const BALANCE = '/wallet/balance/';
const RATES = '/wallet/rates/';
const TRANSACTIONS = '/wallet/transactions/';
const LIMITS = '/wallet/transactions/limits/';
const RAILS = '/wallet/transactions/rails/';

export async function getWalletBalance(http: RipioHttp): Promise<WalletBalance> {
  return parseResponse(WalletBalanceSchema, await http.get(BALANCE), BALANCE);
}

export async function getWalletRates(http: RipioHttp): Promise<WalletRate[]> {
  return parseResponse(WalletRatesSchema, await http.get(RATES), RATES);
}

export async function listWalletTransactions(
  http: RipioHttp,
  query: WalletTransactionsQuery,
): Promise<WalletTransactionPage> {
  return parseResponse(WalletTransactionPageSchema, await http.get(TRANSACTIONS, { query }), TRANSACTIONS);
}

export async function getWalletTransaction(http: RipioHttp, id: number): Promise<WalletTransaction> {
  const path = `${TRANSACTIONS}${id}/`;
  return parseResponse(WalletTransactionSchema, await http.get(path), path);
}

export async function getWalletLimits(http: RipioHttp, query: RailQuery): Promise<WalletLimit[]> {
  return parseResponse(WalletLimitsSchema, await http.get(LIMITS, { query }), LIMITS);
}

export async function getWalletRails(http: RipioHttp, query: RailQuery): Promise<WalletRail[]> {
  return parseResponse(WalletRailsSchema, await http.get(RAILS, { query }), RAILS);
}
