import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { decodeCursor, encodeCursor } from '../domain/cursor.js';
import { normalizeOpenOrder, OpenOrdersOutputSchema, type OpenOrdersOutput } from '../domain/orders.js';
import { run, type ToolContext } from './context.js';
import { PairInput, SideInput } from './inputs.js';
import { ok, READ_ONLY_ANNOTATIONS } from './result.js';

export function registerListOpenOrders(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_list_open_orders',
    {
      title: 'Ripio Trade open orders',
      description:
        'Open orders on Ripio Trade, optionally for one pair or side, with price and requested, executed and remaining amounts.',
      inputSchema: z.object({
        pair: PairInput.optional(),
        side: SideInput.optional(),
        cursor: z.string().optional().describe('next_cursor from a previous call.'),
      }),
      outputSchema: OpenOrdersOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ pair, side, cursor }) =>
      run(ctx, async (client) => {
        const page = await client.tradeOpenOrders({
          pair: pair?.toUpperCase(),
          side,
          c: cursor === undefined ? undefined : decodeCursor(cursor, 'orders'),
        });
        const result: OpenOrdersOutput = {
          orders: page.orders.map(normalizeOpenOrder),
          next_cursor: page.nc ? encodeCursor('orders', page.nc) : undefined,
        };
        return ok(result, result.orders.length === 0 ? 'No open orders.' : `${result.orders.length} open orders.`);
      }),
  );
}
