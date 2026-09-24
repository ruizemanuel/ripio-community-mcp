import { describe, expect, it } from 'vitest';
import { buildPrices, buildTradeEstimate, ESTIMATE_NOTE } from '../../src/domain/market.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { tradeFees, tradeTickers, walletRates } from '../fixtures/synthetic.js';

const asOf = new Date('2026-09-24T12:00:00.000Z');

describe('buildPrices', () => {
  it('combines app rates and the Trade book, uppercasing and de-duplicating assets', () => {
    const prices = buildPrices({
      assets: ['usdt', 'btc', 'doge', 'USDT'],
      quote: 'ARS',
      rates: walletRates,
      tickers: tradeTickers,
      asOf,
    });
    expect(prices.prices).toEqual([
      {
        asset: 'USDT',
        app: { ticker: 'USDT_ARS', buy: '1610', sell: '1590', spread_pct: '1.26' },
        exchange: { pair: 'USDT_ARS', bid: '1599.5', ask: '1606.1', last: '1599.5', change_24h_pct: '0.42', volume_24h: '1234.5' },
      },
      { asset: 'BTC', app: { ticker: 'BTC_ARS', buy: '99000000', sell: '98000000', spread_pct: '1.02' } },
    ]);
    expect(prices.not_found).toEqual(['DOGE']);
    expect(prices).toMatchObject({ as_of: '2026-09-24T12:00:00.000Z', quote: 'ARS', warnings: [] });
  });

  it('falls back to USDT and USDC pairs for a USD quote', () => {
    const prices = buildPrices({ assets: ['btc'], quote: 'USD', rates: walletRates, tickers: tradeTickers, asOf });
    expect(prices.prices).toEqual([
      { asset: 'BTC', exchange: { pair: 'BTC_USDT', bid: '64000', ask: '64100', last: '64050', change_24h_pct: '-1.2', volume_24h: '3.5' } },
    ]);
  });

  it('works with only one source and keeps warnings', () => {
    const prices = buildPrices({ assets: ['USDT'], quote: 'ARS', tickers: tradeTickers, asOf, warnings: ['rates down'] });
    expect(prices.prices[0]?.app).toBeUndefined();
    expect(prices.warnings).toEqual(['rates down']);
  });
});

describe('buildTradeEstimate', () => {
  it('adds the taker fee on buys', () => {
    expect(buildTradeEstimate({ pair: 'USDT_ARS', side: 'buy', amount: '100', price: 1606.1, fees: tradeFees })).toEqual({
      pair: 'USDT_ARS',
      side: 'buy',
      amount: '100',
      estimated_unit_price: '1606.1',
      gross_value: '160610',
      taker_fee_pct: '0.3',
      estimated_fee: '481.83',
      estimated_total: '161091.83',
      note: ESTIMATE_NOTE,
      warnings: [],
    });
  });

  it('subtracts the taker fee on sells', () => {
    const estimate = buildTradeEstimate({ pair: 'USDT_ARS', side: 'sell', amount: '100', price: '1606.1', fees: tradeFees });
    expect(estimate.estimated_total).toBe('160128.17');
  });

  it('reports the gross value when fees are unavailable', () => {
    const estimate = buildTradeEstimate({ pair: 'USDT_ARS', side: 'buy', amount: '1', price: 1606.1, warnings: ['fees down'] });
    expect(estimate).toMatchObject({ estimated_total: '1606.1', warnings: ['fees down'] });
    expect(estimate.estimated_fee).toBeUndefined();
  });

  it('rejects a missing price', () => {
    expect(() => buildTradeEstimate({ pair: 'USDT_ARS', side: 'buy', amount: '1', price: 'n/a' })).toThrow(RipioApiError);
  });

  it('explains a zero price as a pair Ripio Trade does not quote, not as an API change', () => {
    // Ripio answers 200 {"price": 0} for pairs such as BTC_ARS that exist as tickers elsewhere but don't trade here.
    let error: unknown;
    try {
      buildTradeEstimate({ pair: 'BTC_ARS', side: 'buy', amount: '1', price: 0 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RipioApiError);
    expect(error).toMatchObject({ kind: 'bad_request', status: undefined });
    expect((error as RipioApiError).message).toContain('Ripio Trade has no price for BTC_ARS');
  });
});
