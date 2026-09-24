import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  ActivityPageSchema,
  normalizeTradeStatementEntry,
  normalizeWalletTransaction,
  PAGE_DATE_FILTER_NOTE,
  TRADE_COVERAGE_NOTE,
  WALLET_COVERAGE_NOTE,
  type ActivityPage,
} from '../domain/activity.js';
import { decodeCursor, encodeCursor } from '../domain/cursor.js';
import { isWithin, rangeEnd, rangeStart } from '../domain/dates.js';
import { RipioApiError } from '../ripio/errors.js';
import { run, type ToolContext } from './context.js';
import { AssetInput, DateInput, RailInput } from './inputs.js';
import { ok, READ_ONLY_ANNOTATIONS } from './result.js';

const TRADE_PAGE_SIZE = 50;

function summarize(page: ActivityPage): string {
  const venue = page.source === 'wallet' ? 'Wallet' : 'Ripio Trade';
  const more = page.next_cursor === undefined ? '' : ' More available: pass next_cursor as cursor.';
  return `${page.items.length} ${venue} movements.${more}`;
}

export function registerListActivity(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_list_activity',
    {
      title: 'Ripio activity',
      description:
        'Deposits, withdrawals and swaps (source "wallet", default) or Ripio Trade statement entries (source "trade"), ' +
        'newest first, in one normalized shape. Card transactions, in-app buys/sells and bill payments are not available ' +
        "from Ripio's API. Pass next_cursor back as cursor for older items. Dates are UTC; on Wallet, from/to filter the returned page only.",
      inputSchema: z.object({
        source: z.enum(['wallet', 'trade']).optional().describe('Default "wallet".'),
        currency: AssetInput.optional().describe('Only this asset, e.g. "USDT".'),
        type: z
          .enum(['deposit', 'withdrawal', 'swap', 'trade'])
          .optional()
          .describe('"trade" exists only in source "trade"; "swap" only in "wallet".'),
        rail: RailInput.optional().describe('Wallet only.'),
        from: DateInput.optional(),
        to: DateInput.optional(),
        cursor: z.string().optional().describe('next_cursor from a previous call.'),
      }),
      outputSchema: ActivityPageSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) =>
      run(ctx, async (client) => {
        const source = args.source ?? 'wallet';
        const currency = args.currency?.toUpperCase();
        if (source === 'wallet') {
          if (args.type === 'trade') throw new RipioApiError('bad_request', 'type "trade" only exists in source "trade".');
          const page = await client.walletTransactions({
            rail: args.rail,
            transaction_type: args.type,
            currency,
            cursor: args.cursor === undefined ? undefined : decodeCursor(args.cursor, 'wallet'),
          });
          const items = page.results
            .map(normalizeWalletTransaction)
            .filter((item) => isWithin(item.date, args.from, args.to));
          const notes = [WALLET_COVERAGE_NOTE];
          if (args.from !== undefined || args.to !== undefined) notes.push(PAGE_DATE_FILTER_NOTE);
          const result: ActivityPage = {
            source,
            items,
            next_cursor: page.nc ? encodeCursor('wallet', page.nc) : undefined,
            coverage_notes: notes,
          };
          return ok(result, summarize(result));
        }
        if (args.rail !== undefined) throw new RipioApiError('bad_request', 'rail only applies to source "wallet".');
        if (args.type === 'swap') throw new RipioApiError('bad_request', 'type "swap" only exists in source "wallet".');
        const currentPage = args.cursor === undefined ? 1 : Number(decodeCursor(args.cursor, 'trade'));
        if (!Number.isInteger(currentPage) || currentPage < 1) {
          throw new RipioApiError(
            'bad_request',
            'Invalid cursor for trade. Use next_cursor exactly as returned by the previous call.',
          );
        }
        const statement = await client.tradeStatement({
          start_time: args.from === undefined ? undefined : rangeStart(args.from),
          end_time: args.to === undefined ? undefined : rangeEnd(args.to),
          current_page: currentPage,
          page_size: TRADE_PAGE_SIZE,
        });
        const items = statement.statement
          .map(normalizeTradeStatementEntry)
          .filter((item) => (currency === undefined || item.asset === currency) && (args.type === undefined || item.type === args.type));
        const totalPages = statement.pagination?.total_pages ?? currentPage;
        const result: ActivityPage = {
          source,
          items,
          next_cursor: currentPage < totalPages ? encodeCursor('trade', String(currentPage + 1)) : undefined,
          coverage_notes: [TRADE_COVERAGE_NOTE],
        };
        return ok(result, summarize(result));
      }),
  );
}
