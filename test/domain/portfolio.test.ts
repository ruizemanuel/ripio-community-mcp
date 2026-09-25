import { describe, expect, it } from 'vitest';
import { buildPortfolio, VALUATION_NOTE } from '../../src/domain/portfolio.js';
import { tradeBalances, walletBalance, walletRates } from '../fixtures/synthetic.js';

const asOf = new Date('2026-09-24T12:00:00.000Z');

describe('buildPortfolio', () => {
  it('merges Wallet and Trade, values at sell rates in ARS and USD, and sorts by value', () => {
    const portfolio = buildPortfolio({ wallet: walletBalance, trade: tradeBalances, rates: walletRates, asOf, includeZero: false });
    expect(portfolio.holdings).toEqual([
      { asset: 'ARS', venue: 'wallet', available: '2500.5', locked: '0', total: '2500.5', value_ars: '2500.50', value_usd: '1.56' },
      { asset: 'USDT', venue: 'trade', available: '0.05', locked: '0', total: '0.05', value_ars: '79.50', value_usd: '0.05' },
      { asset: 'BTC', venue: 'trade', available: '0.0000003', locked: '0', total: '0.0000003', value_ars: '29.40', value_usd: '0.02' },
      { asset: 'BTC', venue: 'wallet', available: '0.00000002', locked: '0', total: '0.00000002', value_ars: '1.96', value_usd: '0.00' },
      { asset: 'USDC', venue: 'wallet', available: '0.00005', locked: '0', total: '0.00005', value_ars: '0.08', value_usd: '0.00' },
      { asset: 'RPC', venue: 'wallet', available: '250.5', locked: '0', total: '250.5' },
    ]);
    expect(portfolio.totals).toEqual({ value_ars: '2611.44', value_usd: '1.63', unvalued_assets: ['RPC'] });
    expect(portfolio.valuation).toEqual({ method: 'wallet_sell_rate', usd_reference: 'USD_ARS', note: VALUATION_NOTE });
    expect(portfolio.as_of).toBe('2026-09-24T12:00:00.000Z');
    expect(portfolio.warnings).toEqual([]);
  });

  it('includes zero balances only when asked', () => {
    const portfolio = buildPortfolio({ wallet: walletBalance, rates: walletRates, asOf, includeZero: true });
    expect(portfolio.holdings.map((h) => h.asset)).toContain('ETH');
    expect(portfolio.totals.unvalued_assets).not.toContain('ETH');
  });

  it('values only ARS when prices are unavailable', () => {
    const portfolio = buildPortfolio({ wallet: walletBalance, trade: tradeBalances, asOf, includeZero: false });
    expect(portfolio.totals).toEqual({ value_ars: '2500.50', value_usd: undefined, unvalued_assets: ['BTC', 'RPC', 'USDC', 'USDT'] });
    expect(portfolio.valuation.usd_reference).toBeUndefined();
  });

  it('reads memecoins by currency or symbol and warns about unreadable ones', () => {
    const portfolio = buildPortfolio({
      wallet: { wallet: [], virals: [{ symbol: 'pepe', balance: '1000' }, { amount: '5' }] },
      asOf,
      includeZero: false,
      warnings: ['upstream warning'],
    });
    expect(portfolio.holdings).toEqual([{ asset: 'PEPE', venue: 'memecoin', available: '1000', locked: '0', total: '1000' }]);
    expect(portfolio.warnings).toEqual(['upstream warning', '1 memecoin balance(s) could not be read.']);
  });

  it('warns about each balance it cannot read instead of counting it as 0 in silence', () => {
    const portfolio = buildPortfolio({
      wallet: {
        wallet: [
          { currency: 'btc', amount: 'N/A', locked_amount: null },
          { currency: 'ars', amount: '100', locked_amount: '1,5' },
        ],
      },
      trade: [{ currency_code: 'USDT', available_amount: '', locked_amount: '0' }],
      rates: walletRates,
      asOf,
      includeZero: false,
    });
    expect(portfolio.warnings).toEqual([
      'Ripio sent an unreadable available balance for BTC (wallet); it is counted as 0, so the totals may be low.',
      'Ripio sent an unreadable locked balance for ARS (wallet); it is counted as 0, so the totals may be low.',
      'Ripio sent an unreadable available balance for USDT (trade); it is counted as 0, so the totals may be low.',
    ]);
  });
});
