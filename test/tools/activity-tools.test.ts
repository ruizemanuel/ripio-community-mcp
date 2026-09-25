import { afterEach, describe, expect, it } from 'vitest';
import {
  PAGE_DATE_FILTER_NOTE,
  PAGE_REACHED_FROM_NOTE,
  TRADE_COVERAGE_NOTE,
  UNREADABLE_NOTE,
  WALLET_COVERAGE_NOTE,
} from '../../src/domain/activity.js';
import { decodeCursor, encodeCursor } from '../../src/domain/cursor.js';
import type { TradeStatementQuery } from '../../src/ripio/trade.js';
import type { WalletTransactionsQuery } from '../../src/ripio/wallet.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { tradeStatement, walletDeposit, walletSwap, walletTransactionPage, walletWithdrawal } from '../fixtures/synthetic.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const text = (result: { content?: unknown }): string =>
  ((result.content as Array<{ text?: string }> | undefined) ?? []).map((part) => part.text ?? '').join('\n');

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
    expect(page.coverage_notes).toEqual([WALLET_COVERAGE_NOTE, PAGE_REACHED_FROM_NOTE]);
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
      arguments: { source: 'trade', from: '2022-03-01', to: '2022-03-31', currency: 'btc', type: 'trade' },
    });
    const page = result.structuredContent as { items: Array<{ id: string }>; next_cursor: string; coverage_notes: string[] };
    expect(queries[0]).toEqual({
      start_time: '2022-03-01T00:00:00.000Z',
      end_time: '2022-03-31T23:59:59.999Z',
      current_page: 1,
      page_size: 50,
    });
    expect(page.items.map((i) => i.id)).toEqual(['op-1']);
    expect(decodeCursor(page.next_cursor, 'trade')).toBe('2');
    expect(page.coverage_notes).toEqual([TRADE_COVERAGE_NOTE]);
  });

  it.each([
    [{ type: 'trade' }, 'only exists in source "trade"'],
    [{ source: 'trade', rail: 'bank' }, 'rail only applies to source "wallet"'],
    [{ source: 'trade', type: 'swap' }, 'only exists in source "wallet"'],
    [{ cursor: 'garbage' }, 'Invalid cursor'],
    [{ source: 'trade', from: '2024-01-01', to: '2024-12-31' }, 'up to 182 days'],
    [{ source: 'trade', from: '2024-01-01' }, 'up to 182 days'],
  ])('rejects %j with a clear message', async (args, message) => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_list_activity', arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain(message);
  });

  it('says how many movements came with missing or unreadable data', async () => {
    const broken = { ...walletWithdrawal, amount_from: 'N/A', amount_to: null };
    harness = await connectTools(fakeClient({ walletTransactions: async () => ({ results: [broken, walletWithdrawal], nc: null, pc: null }) }));
    const result = await harness.mcp.callTool({ name: 'ripio_list_activity', arguments: {} });
    expect((result.structuredContent as { coverage_notes: string[] }).coverage_notes).toContain(UNREADABLE_NOTE);
    expect(text(result).split('\n')[0]).toBe('2 Wallet movements, 1 with missing or unreadable data (see "unreadable").');
  });

  it('notes Ripio Trade entries that came with missing or unreadable data', async () => {
    const [sell] = tradeStatement.statement;
    if (sell === undefined) throw new Error('fixture');
    harness = await connectTools(fakeClient({ tradeStatement: async () => ({ ...tradeStatement, statement: [{ ...sell, amount: 'N/A' }] }) }));
    const result = await harness.mcp.callTool({ name: 'ripio_list_activity', arguments: { source: 'trade' } });
    expect((result.structuredContent as { coverage_notes: string[] }).coverage_notes).toEqual([TRADE_COVERAGE_NOTE, UNREADABLE_NOTE]);
    expect(text(result).split('\n')[0]).toMatch(/^1 Ripio Trade movements, 1 with missing or unreadable data \(see "unreadable"\)\./);
  });

  it('offers no next Wallet page once the page reaches back past from', async () => {
    let reply = walletTransactionPage;
    harness = await connectTools(fakeClient({ walletTransactions: async () => reply }));
    const { mcp } = harness;
    const list = async (from: string) =>
      (await mcp.callTool({ name: 'ripio_list_activity', arguments: { from } })).structuredContent as {
        next_cursor?: string;
        coverage_notes: string[];
      };
    const reached = await list('2025-06-01');
    expect(reached.next_cursor).toBeUndefined();
    expect(reached.coverage_notes).toEqual([WALLET_COVERAGE_NOTE, PAGE_REACHED_FROM_NOTE]);
    for (const from of ['2025-01-01', '2025-03-10']) {
      const open = await list(from);
      expect(open.next_cursor, from).toBeDefined();
      expect(open.coverage_notes, from).toEqual([WALLET_COVERAGE_NOTE, PAGE_DATE_FILTER_NOTE]);
    }
    reply = { ...walletTransactionPage, results: [{ ...walletSwap, created_at: 'not a date' }] };
    expect((await list('2025-06-01')).next_cursor).toBeDefined();
  });

  it('judges the Wallet cut-off by the oldest movement on the page, and never by to', async () => {
    let reply = walletTransactionPage;
    harness = await connectTools(fakeClient({ walletTransactions: async () => reply }));
    const { mcp } = harness;
    const list = async (args: Record<string, string>) =>
      (await mcp.callTool({ name: 'ripio_list_activity', arguments: args })).structuredContent as {
        next_cursor?: string;
        coverage_notes: string[];
      };
    const beforeTo = await list({ from: '2025-01-01', to: '2025-02-28' });
    expect(beforeTo.next_cursor).toBeDefined();
    expect(beforeTo.coverage_notes).toEqual([WALLET_COVERAGE_NOTE, PAGE_DATE_FILTER_NOTE]);
    reply = { ...walletTransactionPage, results: [walletSwap, walletDeposit, walletWithdrawal] };
    expect((await list({ from: '2025-06-01' })).next_cursor).toBeDefined();
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

  it('accepts the id as the string ripio_list_activity returns', async () => {
    const ids: number[] = [];
    harness = await connectTools(
      fakeClient({
        walletTransaction: async (id) => {
          ids.push(id);
          return walletWithdrawal;
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: '1002' } });
    expect(result.isError).toBeFalsy();
    expect(ids).toEqual([1002]);
  });

  it.each([['12.5'], ['abc'], [-3], [0]])('rejects the id %j before calling Ripio', async (id) => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id } });
    expect(result.isError).toBe(true);
  });

  it('says when Ripio sent the amount missing or unreadable', async () => {
    harness = await connectTools(fakeClient({ walletTransaction: async () => ({ ...walletWithdrawal, amount_from: 'N/A', amount_to: null }) }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: 1002 } });
    expect(text(result).split('\n')[0]).toMatch(/ Ripio sent the amount missing or unreadable; it shows as 0\.$/);
  });

  it('says what each field shows as when Ripio sent both the amount and the asset unreadable', async () => {
    const broken = { ...walletWithdrawal, amount_from: 'N/A', amount_to: null, from_currency: null, to_currency: ' ' };
    harness = await connectTools(fakeClient({ walletTransaction: async () => broken }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_transaction', arguments: { id: 1002 } });
    expect(text(result).split('\n')[0]).toMatch(/ Ripio sent the amount and asset missing or unreadable; they show as 0 and UNKNOWN\.$/);
  });
});
