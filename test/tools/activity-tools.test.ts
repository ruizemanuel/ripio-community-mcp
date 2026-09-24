import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_DATE_FILTER_NOTE, TRADE_COVERAGE_NOTE, WALLET_COVERAGE_NOTE } from '../../src/domain/activity.js';
import { decodeCursor, encodeCursor } from '../../src/domain/cursor.js';
import type { TradeStatementQuery } from '../../src/ripio/trade.js';
import type { WalletTransactionsQuery } from '../../src/ripio/wallet.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { tradeStatement, walletTransactionPage, walletWithdrawal } from '../fixtures/synthetic.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const text = (result: { content?: unknown }): string =>
  ((result.content as Array<{ text?: string }> | undefined) ?? []).map((part) => part.text ?? '').join(' ');

describe('ripio_list_activity', () => {
  it('lists Wallet movements by default with coverage notes and an opaque cursor', async () => {
    const queries: WalletTransactionsQuery[] = [];
    harness = await connectTools(
      fakeClient({
        walletTransactions: async (query) => {
          queries.push(query);
          return walletTransactionPage;
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_list_activity', arguments: { currency: 'usdt' } });
    expect(result.isError).toBeFalsy();
    const page = result.structuredContent as { source: string; items: unknown[]; next_cursor: string; coverage_notes: string[] };
    expect(page.source).toBe('wallet');
    expect(page.items).toHaveLength(3);
    expect(page.coverage_notes).toEqual([WALLET_COVERAGE_NOTE]);
    expect(decodeCursor(page.next_cursor, 'wallet')).toBe('ripio-next-token');
    expect(queries[0]).toEqual({ rail: undefined, transaction_type: undefined, currency: 'USDT', cursor: undefined });
  });

  it('passes the cursor back and filters the page by date', async () => {
    const queries: WalletTransactionsQuery[] = [];
    harness = await connectTools(
      fakeClient({
        walletTransactions: async (query) => {
          queries.push(query);
          return walletTransactionPage;
        },
      }),
    );
    const cursor = encodeCursor('wallet', 'ripio-next-token');
    const result = await harness.mcp.callTool({
      name: 'ripio_list_activity',
      arguments: { cursor, from: '2025-06-01', to: '2025-06-30' },
    });
    const page = result.structuredContent as { items: Array<{ id: string }>; coverage_notes: string[] };
    expect(queries[0]?.cursor).toBe('ripio-next-token');
    expect(page.items.map((i) => i.id)).toEqual(['1001', '1002']);
    expect(page.coverage_notes).toEqual([WALLET_COVERAGE_NOTE, PAGE_DATE_FILTER_NOTE]);
  });

  it('reads the Ripio Trade statement with UTC ranges and page cursors', async () => {
    const queries: TradeStatementQuery[] = [];
    harness = await connectTools(
      fakeClient({
        tradeStatement: async (query) => {
          queries.push(query);
          return tradeStatement;
        },
      }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_list_activity',
      arguments: { source: 'trade', from: '2022-07-01', currency: 'btc', type: 'trade' },
    });
    const page = result.structuredContent as { items: Array<{ id: string }>; next_cursor: string; coverage_notes: string[] };
    expect(queries[0]).toEqual({ start_time: '2022-07-01T00:00:00.000Z', end_time: undefined, current_page: 1, page_size: 50 });
    expect(page.items.map((i) => i.id)).toEqual(['op-1']);
    expect(decodeCursor(page.next_cursor, 'trade')).toBe('2');
    expect(page.coverage_notes).toEqual([TRADE_COVERAGE_NOTE]);
  });

  it.each([
    [{ type: 'trade' }, 'only exists in source "trade"'],
    [{ source: 'trade', rail: 'bank' }, 'rail only applies to source "wallet"'],
    [{ source: 'trade', type: 'swap' }, 'only exists in source "wallet"'],
    [{ cursor: 'garbage' }, 'Invalid cursor'],
  ])('rejects %j with a clear message', async (args, message) => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_list_activity', arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(message);
  });
});

describe('ripio_get_transaction', () => {
  it('returns the detail view', async () => {
    const ids: number[] = [];
    harness = await connectTools(
      fakeClient({
        walletTransaction: async (id) => {
          ids.push(id);
          return walletWithdrawal;
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: 1002 } });
    expect(ids).toEqual([1002]);
    expect(result.structuredContent).toMatchObject({ id: '1002', raw_status: 'PEN', transaction_hash: '0xabc123' });
  });

  it('explains ids that do not exist', async () => {
    harness = await connectTools(
      fakeClient({
        walletTransaction: async () => {
          throw new RipioApiError('not_found', 'HTTP 404', { status: 404, endpoint: '/wallet/transactions/999/' });
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: 999 } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('No Wallet transaction with id 999');
  });

  it('rejects non-integer ids before calling Ripio', async () => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: '12' } });
    expect(result.isError).toBe(true);
  });
});
