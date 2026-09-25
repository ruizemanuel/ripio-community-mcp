import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDepositAddress, DepositAddressSchema } from '../../src/domain/deposit-address.js';
import { buildPortfolio } from '../../src/domain/portfolio.js';
import { verifyDepositAddress } from '../../src/domain/verify-address.js';
import {
  TradeBalancesSchema,
  TradeEstimateSchema,
  TradeFeesSchema,
  TradeOpenOrdersSchema,
  TradeStatementSchema,
  TradeTickersSchema,
  WalletAddressesSchema,
  WalletBalanceSchema,
  WalletCurrenciesSchema,
  WalletCurrencyNetworksSchema,
  WalletDepositAccountsSchema,
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
  ['wallet-addresses', WalletAddressesSchema],
  ['wallet-currency-networks-usdt', WalletCurrencyNetworksSchema],
  ['wallet-currency-networks-usdc', WalletCurrencyNetworksSchema],
  ['wallet-currencies', WalletCurrenciesSchema],
  ['wallet-deposit-accounts', WalletDepositAccountsSchema],
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

  it.skipIf(!existsSync(file('wallet-addresses')))('keeps recorded deposit addresses redacted', () => {
    for (const entry of WalletAddressesSchema.parse(read('wallet-addresses'))) {
      expect(entry.address).toMatch(/^redacted-\d+$/);
    }
  });

  it.skipIf(!existsSync(file('wallet-addresses')) || !existsSync(file('wallet-currency-networks-usdt')))(
    'builds USDT deposit answers from recorded data',
    () => {
      const addresses = WalletAddressesSchema.parse(read('wallet-addresses'));
      const networks = WalletCurrencyNetworksSchema.parse(read('wallet-currency-networks-usdt'));
      const input = { asset: 'USDT', depositsDisabled: false, networks, addresses };
      expect(buildDepositAddress(input).status).toBe('choose_network');
      const polygon = buildDepositAddress({ ...input, network: 'polygon' });
      expect(['ok', 'no_address']).toContain(polygon.status);
      expect(DepositAddressSchema.safeParse(polygon).success).toBe(true);
    },
  );

  it.skipIf(!existsSync(file('wallet-addresses')))('verifies a recorded address and rejects a changed copy', () => {
    const addresses = WalletAddressesSchema.parse(read('wallet-addresses'));
    const [first] = addresses;
    if (first === undefined) return;
    expect(verifyDepositAddress({ address: first.address, addresses }).status).toBe('verified');
    expect(verifyDepositAddress({ address: `${first.address}x`, addresses }).status).toBe('near_miss');
  });
});
