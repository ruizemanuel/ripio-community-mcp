import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildLimits, LIMITS_NOTE, LimitsOutputSchema } from '../domain/limits.js';
import { run, type ToolContext } from './context.js';
import { RailInput } from './inputs.js';
import { ok, READ_ONLY_ANNOTATIONS } from './result.js';

export function registerGetLimits(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_limits',
    {
      title: 'Ripio limits and rails',
      description:
        'How much the account can still deposit, withdraw or swap: Ripio limits per rail (bank, pix, crypto, ripio and ' +
        'the account-wide limit) with daily, monthly and annual caps and what remains, plus the operations and fees of each rail.',
      inputSchema: z.object({
        rail: RailInput.optional(),
        type: z.enum(['deposit', 'withdrawal', 'swap']).optional(),
      }),
      outputSchema: LimitsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ rail, type }) =>
      run(ctx, async (client) => {
        const [limits, rails] = await Promise.all([
          client.walletLimits({ rail, transaction_type: type }),
          client.walletRails({ rail, transaction_type: type }),
        ]);
        const result = buildLimits(limits, rails);
        const railCount = new Set(result.limits.map((limit) => limit.rail)).size;
        return ok(result, `${result.limits.length} limits across ${railCount} rails. ${LIMITS_NOTE}`);
      }),
  );
}
