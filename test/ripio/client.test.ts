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

  it('returns deposit addresses exactly as Ripio sends them, unfiltered and never cached', async () => {
    const entry = {
      address: '0x52908400098527886E0F7030069857D2E4169EE7',
      memo_id: null,
      version: 3,
      network: { id: 7, code: 'polygon', name: 'Polygon', status_tag: 'NORMAL', deliver_time: 1, enabled: true, use_memo: false },
    };
    const { client, calls } = setup({ '/wallet/addresses/': () => walletOk([entry]) });
    const [first] = await client.walletAddresses();
    expect(first?.address).toBe('0x52908400098527886E0F7030069857D2E4169EE7');
    expect(first?.network).toEqual({
      code: 'polygon',
      name: 'Polygon',
      status_tag: 'NORMAL',
      deliver_time: 1,
      enabled: true,
      use_memo: false,
    });
    await client.walletAddresses();
    const addressCalls = calls.filter((c) => c.url.pathname === '/wallet/addresses/');
    expect(addressCalls.map((c) => c.url.search)).toEqual(['', '']);
  });

  it('keeps a numeric memo as Ripio sends it', async () => {
    const entry = { address: 'rAddr', memo_id: 123456789, version: 1, network: { code: 'ripple', name: 'Ripple', use_memo: true } };
    const { client } = setup({ '/wallet/addresses/': () => walletOk([entry]) });
    await expect(client.walletAddresses()).resolves.toMatchObject([{ memo_id: 123456789 }]);
  });

  it('asks for the networks of a currency with the ticker in the path and never caches them', async () => {
    const network = {
      currency: 'AAPLx',
      currency_balance_id: 1,
      network: { id: 3, code: 'ethereum', name: 'Ethereum', status_tag: 'NORMAL', deliver_time: '~15 min', enabled: true, use_memo: false },
      native_network: true,
      standard: 'ERC-20',
      network_standard: 'Ethereum (ERC-20)',
      fee: '0.50',
      send: true,
      receive: true,
      order: 0,
      enabled: true,
      min_amount: null,
      max_amount: null,
      is_partial_disabled_send: false,
      is_partial_disabled_receive: false,
      messages: [{ level: 'warning', title: 'currency_network_bridge_alert', values: { currency: 'USDC.e' }, location: ['receive'] }],
    };
    const path = '/wallet/network/currency-networks/AAPLx/';
    const { client, calls } = setup({ [path]: () => walletOk([network]) });
    const [first] = await client.walletCurrencyNetworks('AAPLx');
    expect(first).toMatchObject({ standard: 'ERC-20', receive: true, network: { code: 'ethereum', deliver_time: '~15 min' } });
    expect(first?.messages?.[0]).toEqual({
      level: 'warning',
      title: 'currency_network_bridge_alert',
      values: { currency: 'USDC.e' },
      location: ['receive'],
    });
    await client.walletCurrencyNetworks('AAPLx');
    expect(calls.filter((c) => c.url.pathname === path)).toHaveLength(2);
  });

  it('caches the currency list for 5 minutes', async () => {
    const actions = [{ transaction_type: 'deposit', enabled: true, rails: ['crypto', 'ripio'] }];
    const usdt = { ticker: 'USDT', name: 'Tether', type: 'ERC20_TOKEN', decimals: 6, actions };
    const { client, calls, clock } = setup({ '/wallet/currencies/': () => walletOk([usdt]) });
    await expect(client.walletCurrencies()).resolves.toEqual([{ ticker: 'USDT', name: 'Tether', type: 'ERC20_TOKEN', actions }]);
    await client.walletCurrencies();
    clock.now += 300_001;
    await client.walletCurrencies();
    expect(calls.filter((c) => c.url.pathname === '/wallet/currencies/')).toHaveLength(2);
  });

  it('parses Ripio deposit accounts', async () => {
    const account = {
      type: 'cvu',
      account_number: 'CVU-SYNTHETIC-0001',
      account_label: 'synthetic.alias',
      currency: 'ARS',
      deposit_constraint: null,
    };
    const { client } = setup({ '/wallet/banking/deposit-accounts/': () => walletOk([account]) });
    await expect(client.walletDepositAccounts()).resolves.toEqual([account]);
  });
});
