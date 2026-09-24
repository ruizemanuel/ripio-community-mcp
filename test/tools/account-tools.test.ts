import { afterEach, describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/domain/cursor.js';
import type { OpenOrdersQuery } from '../../src/ripio/trade.js';
import type { RailQuery } from '../../src/ripio/wallet.js';
import { tradeOpenOrders, walletLimits, walletRails } from '../fixtures/synthetic.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('ripio_get_limits', () => {
  it('passes rail and type through and returns flattened limits', async () => {
    const queries: RailQuery[] = [];
    harness = await connectTools(
      fakeClient({
        walletLimits: async (query) => {
          queries.push(query);
          return walletLimits;
        },
        walletRails: async (query) => {
          queries.push(query);
          return walletRails;
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_limits', arguments: { rail: 'ripio', type: 'swap' } });
    expect(queries).toEqual([
      { rail: 'ripio', transaction_type: 'swap' },
      { rail: 'ripio', transaction_type: 'swap' },
    ]);
    expect(result.structuredContent).toMatchObject({ limits: [{ rail: 'account' }, { rail: 'ripio', min: '1' }] });
  });
});

describe('ripio_list_open_orders', () => {
  it('normalizes orders and round-trips the cursor', async () => {
    const queries: OpenOrdersQuery[] = [];
    harness = await connectTools(
      fakeClient({
        tradeOpenOrders: async (query) => {
          queries.push(query);
          return tradeOpenOrders;
        },
      }),
    );
    const first = await harness.mcp.callTool({ name: 'ripio_list_open_orders', arguments: { pair: 'usdt_ars' } });
    const page = first.structuredContent as { orders: Array<{ pair: string }>; next_cursor: string };
    expect(page.orders[0]?.pair).toBe('USDT_ARS');
    expect(decodeCursor(page.next_cursor, 'orders')).toBe('orders-next');
    await harness.mcp.callTool({ name: 'ripio_list_open_orders', arguments: { cursor: encodeCursor('orders', 'orders-next') } });
    expect(queries).toEqual([
      { pair: 'USDT_ARS', side: undefined, c: undefined },
      { pair: undefined, side: undefined, c: 'orders-next' },
    ]);
  });

  it('says so when there are no open orders', async () => {
    harness = await connectTools(fakeClient({ tradeOpenOrders: async () => ({ orders: [], nc: null }) }));
    const result = await harness.mcp.callTool({ name: 'ripio_list_open_orders', arguments: {} });
    expect(result.content).toEqual([{ type: 'text', text: 'No open orders.' }]);
  });
});
