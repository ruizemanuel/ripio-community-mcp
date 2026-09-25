import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { TransactionDetailSchema, walletTransactionDetail } from '../domain/activity.js';
import { RipioApiError } from '../ripio/errors.js';
import { run, type ToolContext } from './context.js';
import { failText, ok, READ_ONLY_ANNOTATIONS } from './result.js';

export function registerGetTransaction(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_transaction',
    {
      title: 'Ripio Wallet transaction',
      description:
        'Full detail of one Wallet movement by its id (from ripio_list_activity with source "wallet"): amounts, fee, ' +
        'rail, counterparty, status and the on-chain hash when there is one.',
      inputSchema: z.object({
        id: z
          .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
          .describe('Wallet transaction id, as a number or as the string ripio_list_activity returns.'),
      }),
      outputSchema: TransactionDetailSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) =>
      run(ctx, async (client) => {
        try {
          const detail = walletTransactionDetail(await client.walletTransaction(Number(id)));
          const unreadable = detail.unreadable ?? [];
          const shown = unreadable.includes('amount') ? '0' : 'UNKNOWN';
          const unread =
            unreadable.length === 0 ? '' : ` Ripio sent the ${unreadable.join(' and ')} missing or unreadable; it shows as ${shown}.`;
          return ok(detail, `${detail.type} of ${detail.amount} ${detail.asset} on ${detail.date} (${detail.status}).${unread}`);
        } catch (error) {
          if (error instanceof RipioApiError && error.kind === 'not_found') {
            return failText(
              `No Wallet transaction with id ${id}. Ripio Trade operations and in-app buys/sells have no Wallet id; use ripio_list_activity.`,
            );
          }
          throw error;
        }
      }),
  );
}
