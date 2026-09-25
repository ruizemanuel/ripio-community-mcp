import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildDepositAccounts, DepositAccountsSchema, summarizeDepositAccounts } from '../domain/deposit-accounts.js';
import { RipioApiError } from '../ripio/errors.js';
import { run, type ToolContext } from './context.js';
import { failText, ok, READ_ONLY_ANNOTATIONS } from './result.js';

const NO_DEPOSIT_ACCOUNT =
  "Ripio has no deposit account provisioned for this user; Ripio's documentation says to contact Ripio support.";

export function registerGetDepositAccounts(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_deposit_accounts',
    {
      title: 'Ripio deposit accounts (CVU)',
      description:
        "The account's Ripio bank-deposit accounts for fiat: the CVU and alias in Argentina (PIX in Brazil), with the rules to relay " +
        'before anyone transfers. Crypto deposits use ripio_get_deposit_address instead.',
      inputSchema: z.object({}),
      outputSchema: DepositAccountsSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () =>
      run(ctx, async (client) => {
        try {
          const result = buildDepositAccounts(await client.walletDepositAccounts());
          return ok(result, summarizeDepositAccounts(result));
        } catch (error) {
          if (error instanceof RipioApiError && error.kind === 'not_found') return failText(NO_DEPOSIT_ACCOUNT);
          throw error;
        }
      }),
  );
}
