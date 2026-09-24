import { describe, expect, it } from 'vitest';
import { createRipioClient } from '../../src/ripio/client.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { RipioHttp } from '../../src/ripio/http.js';
import { signRequest } from '../../src/ripio/signing.js';
import { fakeFetch, SERVER_TIME_MS, serverTimeReply, tradeOk, walletOk, type FakeReply } from '../helpers/fake-fetch.js';

function setup(routes: Record<string, () => FakeReply>, clock = { now: 1_700_000_000_000 }) {
  const { fetch, calls } = fakeFetch((url) => {
    if (url.pathname === '/trade/public/server-time') return serverTimeReply;
    const route = routes[url.pathname];
    if (!route) throw new Error(`unexpected request ${url.pathname}`);
    return route();
  });
  const http = new RipioHttp({
    apiKey: 'k',
    apiSecret: 's',
    fetch,
    now: () => clock.now,
    sleep: async () => {},
    maxRetries: 0,
  });
  return { client: createRipioClient(http, () => clock.now), calls, clock };
}

describe('Ripio client', () => {
  it('parses Wallet balances', async () => {
    const { client } = setup({
      '/wallet/balance/': () =>
        walletOk({ wallet: [{ currency: 'BTC', currency_internal_id: 14, amount: '0.00000002', locked_amount: '0.00' }], virals: [] }),
    });
    await expect(client.walletBalance()).resolves.toEqual({
      wallet: [{ currency: 'BTC', amount: '0.00000002', locked_amount: '0.00' }],
      virals: [],
    });
  });

  it('accepts Trade tickers that mix numbers and numeric strings, and fetches them unsigned', async () => {
    const { client, calls } = setup({
      '/trade/public/tickers': () =>
        tradeOk([{ pair: 'USDT_ARS', bid: 1599.5, ask: 1606.1, last: '1599.5', price_change_percent_24h: '0.42', volume: 12.5 }]),
    });
    const [ticker] = await client.tradeTickers();
    expect(ticker).toMatchObject({ pair: 'USDT_ARS', bid: 1599.5, last: '1599.5' });
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it('accepts exponent-notation Trade balances', async () => {
    const { client } = setup({
      '/trade/user/balances': () => tradeOk([{ currency_code: 'BTC', available_amount: 3e-7, locked_amount: 0, last_update: 'x' }]),
    });
    await expect(client.tradeBalances()).resolves.toEqual([{ currency_code: 'BTC', available_amount: 3e-7, locked_amount: 0 }]);
  });

  it('puts the pair in the path, amount and side in the query, and signs the path only', async () => {
    const { client, calls } = setup({ '/trade/orders/estimate-price/USDT_ARS': () => tradeOk({ price: 1606.1 }) });
    await expect(client.tradeEstimatePrice('USDT_ARS', '1', 'buy')).resolves.toEqual({ price: 1606.1 });
    const call = calls.find((c) => c.url.pathname === '/trade/orders/estimate-price/USDT_ARS');
    expect(call?.url.search).toBe('?amount=1&side=buy');
    expect(call?.headers.Signature).toBe(
      signRequest('s', String(SERVER_TIME_MS), 'GET', '/trade/orders/estimate-price/USDT_ARS'),
    );
  });

  it('gets a Wallet transaction by id', async () => {
    const tx = { id: 1234567, transaction_type: 'withdrawal', rail: 'bank', status: 'COM', created_at: '2025-06-18T14:20:10+00:00' };
    const { client } = setup({ '/wallet/transactions/1234567/': () => walletOk(tx) });
    await expect(client.walletTransaction(1234567)).resolves.toMatchObject({ id: 1234567, status: 'COM' });
  });

  it('reports a response that does not match the schema', async () => {
    const { client } = setup({ '/wallet/balance/': () => walletOk({ nope: true }) });
    const error = await client.walletBalance().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RipioApiError);
    expect(error).toMatchObject({ kind: 'schema', endpoint: '/wallet/balance/' });
    expect((error as RipioApiError).details).toContain('wallet');
  });

  it('asks for the trading fees of a pair (Ripio answers 400 "Invalid pair" without one) and caches them per pair', async () => {
    const { client, calls } = setup({
      '/trade/user/trading-fees': () => tradeOk([{ side: 'buy', maker: 0.25, taker: 0.5 }]),
    });
    await client.tradeFees('USDT_ARS');
    await client.tradeFees('USDT_ARS');
    await client.tradeFees('BTC_USDT');
    const feeCalls = calls.filter((c) => c.url.pathname === '/trade/user/trading-fees');
    expect(feeCalls.map((c) => c.url.search)).toEqual(['?pair=USDT_ARS', '?pair=BTC_USDT']);
  });

  it('caches rates for 10 seconds', async () => {
    const { client, calls, clock } = setup({ '/wallet/rates/': () => walletOk([{ ticker: 'BTC_ARS', buy_rate: '1', sell_rate: '1' }]) });
    await client.walletRates();
    await client.walletRates();
    clock.now += 10_001;
    await client.walletRates();
    expect(calls.filter((c) => c.url.pathname === '/wallet/rates/')).toHaveLength(2);
  });

  it('does not cache failures', async () => {
    let attempts = 0;
    const { client } = setup({
      '/wallet/rates/': () => {
        attempts += 1;
        return attempts === 1 ? { status: 503, body: 'down' } : walletOk([]);
      },
    });
    await expect(client.walletRates()).rejects.toBeInstanceOf(RipioApiError);
    await expect(client.walletRates()).resolves.toEqual([]);
  });
});
