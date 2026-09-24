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
      inputSchema: z.object({ id: z.number().int().positive().describe('Wallet transaction id.') }),
      outputSchema: TransactionDetailSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ id }) =>
      run(ctx, async (client) => {
        try {
          const detail = walletTransactionDetail(await client.walletTransaction(id));
          return ok(detail, `${detail.type} of ${detail.amount} ${detail.asset} on ${detail.date} (${detail.status}).`);
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
