import { afterEach, describe, expect, it } from 'vitest';
import { RipioApiError } from '../../src/ripio/errors.js';
import { tradeFees, tradeTickers, walletRates } from '../fixtures/synthetic.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const text = (result: { content?: unknown }): string =>
  ((result.content as Array<{ text?: string }> | undefined) ?? []).map((part) => part.text ?? '').join(' ');
const down = (endpoint: string) => async (): Promise<never> => {
  throw new RipioApiError('upstream', 'down', { status: 503, endpoint });
};

describe('ripio_get_prices', () => {
  it('compares app and Trade prices for lowercase assets', async () => {
    harness = await connectTools(fakeClient({ walletRates: async () => walletRates, tradeTickers: async () => tradeTickers }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_prices', arguments: { assets: ['usdt', 'btc', 'doge'] } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      quote: 'ARS',
      not_found: ['DOGE'],
      prices: [
        { asset: 'USDT', app: { sell: '1590' }, exchange: { pair: 'USDT_ARS', last: '1599.5' } },
        { asset: 'BTC', app: { sell: '98000000' } },
      ],
    });
    expect(text(result)).toContain('USDT: app buy 1610 / sell 1590; Trade last 1599.5');
  });

  it('keeps answering when one price source fails', async () => {
    harness = await connectTools(fakeClient({ walletRates: async () => walletRates, tradeTickers: down('/trade/public/tickers') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_prices', arguments: { assets: ['USDT'] } });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { warnings: string[] }).warnings[0]).toContain('Ripio Trade prices unavailable');
  });

  it('fails when both sources fail', async () => {
    harness = await connectTools(fakeClient({ walletRates: down('/wallet/rates/'), tradeTickers: down('/trade/public/tickers') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_prices', arguments: { assets: ['USDT'] } });
    expect(result.isError).toBe(true);
  });
});

describe('ripio_estimate_trade', () => {
  it('uppercases the pair and returns the fee-inclusive total', async () => {
    const calls: unknown[][] = [];
    const feeCalls: unknown[][] = [];
    harness = await connectTools(
      fakeClient({
        tradeEstimatePrice: async (...args) => {
          calls.push(args);
          return { price: 1606.1 };
        },
        tradeFees: async (...args) => {
          feeCalls.push(args);
          return tradeFees;
        },
      }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_estimate_trade',
      arguments: { pair: 'usdt_ars', side: 'buy', amount: '100' },
    });
    expect(calls).toEqual([['USDT_ARS', '100', 'buy']]);
    expect(feeCalls).toEqual([['USDT_ARS']]);
    expect(result.structuredContent).toMatchObject({ estimated_total: '161091.83', estimated_fee: '481.83' });
    expect(text(result)).toContain('buy 100 USDT ≈ 161091.83 ARS');
  });

  it('tells the user when Ripio Trade has no price for a pair (Ripio answers price 0)', async () => {
    harness = await connectTools(
      fakeClient({ tradeEstimatePrice: async () => ({ price: 0 }), tradeFees: async () => tradeFees }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_estimate_trade',
      arguments: { pair: 'btc_ars', side: 'buy', amount: '1' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Ripio Trade has no price for BTC_ARS');
    expect(text(result)).not.toContain('changed its API');
  });

  it('surfaces Ripio’s "Invalid pair" instead of an outage', async () => {
    harness = await connectTools(
      fakeClient({
        tradeEstimatePrice: async () => {
          throw new RipioApiError('bad_request', 'Invalid pair', { status: 400, endpoint: '/trade/orders/estimate-price/BTC_ARS' });
        },
        tradeFees: async () => tradeFees,
      }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_estimate_trade',
      arguments: { pair: 'BTC_ARS', side: 'buy', amount: '1' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Ripio rejected the request: Invalid pair');
  });

  it('estimates without fees when they are unavailable', async () => {
    harness = await connectTools(
      fakeClient({ tradeEstimatePrice: async () => ({ price: '1606.1' }), tradeFees: down('/trade/user/trading-fees') }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_estimate_trade',
      arguments: { pair: 'USDT_ARS', side: 'sell', amount: '1' },
    });
    expect(result.structuredContent).toMatchObject({ estimated_total: '1606.1' });
    expect((result.structuredContent as { warnings: string[] }).warnings[0]).toContain('Trading fees unavailable');
  });

  it.each([['0'], ['-1'], ['abc']])('rejects amount %j before calling Ripio', async (amount) => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({
      name: 'ripio_estimate_trade',
      arguments: { pair: 'USDT_ARS', side: 'buy', amount },
    });
    expect(result.isError).toBe(true);
  });
});
