import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPortfolio } from '../../src/domain/portfolio.js';
import {
  TradeBalancesSchema,
  TradeEstimateSchema,
  TradeFeesSchema,
  TradeOpenOrdersSchema,
  TradeStatementSchema,
  TradeTickersSchema,
  WalletBalanceSchema,
  WalletLimitsSchema,
  WalletRailsSchema,
  WalletRatesSchema,
  WalletTransactionPageSchema,
} from '../../src/ripio/schemas.js';

const dir = 'test/fixtures/recorded';
const file = (name: string) => `${dir}/${name}.json`;
const read = (name: string): unknown => JSON.parse(readFileSync(file(name), 'utf8'));

const cases = [
  ['wallet-balance', WalletBalanceSchema],
  ['wallet-rates', WalletRatesSchema],
  ['wallet-transactions', WalletTransactionPageSchema],
  ['wallet-limits', WalletLimitsSchema],
  ['wallet-rails', WalletRailsSchema],
  ['trade-balances', TradeBalancesSchema],
  ['trade-tickers', TradeTickersSchema],
  ['trade-statement', TradeStatementSchema],
  ['trade-fees', TradeFeesSchema],
  ['trade-open-orders', TradeOpenOrdersSchema],
  ['trade-estimate-usdt-ars', TradeEstimateSchema],
] as const;
const present = cases.filter(([name]) => existsSync(file(name)));

describe.skipIf(present.length === 0)('recorded Ripio responses (anonymized)', () => {
  it.each(present)('%s matches its schema', (name, schema) => {
    const result = schema.safeParse(read(name));
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it.skipIf(!existsSync(file('wallet-balance')))('builds a portfolio from recorded data', () => {
    const wallet = WalletBalanceSchema.parse(read('wallet-balance'));
    const trade = existsSync(file('trade-balances')) ? TradeBalancesSchema.parse(read('trade-balances')) : undefined;
    const rates = existsSync(file('wallet-rates')) ? WalletRatesSchema.parse(read('wallet-rates')) : undefined;
    expect(() => buildPortfolio({ wallet, trade, rates, asOf: new Date(), includeZero: false })).not.toThrow();
  });
});
