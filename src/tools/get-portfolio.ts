import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildPortfolio, PortfolioSchema } from '../domain/portfolio.js';
import { run, type ToolContext } from './context.js';
import { ok, READ_ONLY_ANNOTATIONS, userMessage } from './result.js';

export function registerGetPortfolio(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_portfolio',
    {
      title: 'Ripio portfolio',
      description:
        'What the user holds on Ripio right now: Wallet (fiat and crypto), memecoins and Ripio Trade balances in one list, ' +
        'with available and locked amounts and an estimated value in ARS and USD at Ripio app sell rates. ' +
        'Zero balances are hidden unless include_zero is true.',
      inputSchema: z.object({
        include_zero: z.boolean().optional().describe('Include assets with a zero balance. Default false.'),
      }),
      outputSchema: PortfolioSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ include_zero }) =>
      run(ctx, async (client) => {
        const [wallet, trade, rates] = await Promise.allSettled([
          client.walletBalance(),
          client.tradeBalances(),
          client.walletRates(),
        ]);
        if (wallet.status === 'rejected') throw wallet.reason;
        const warnings: string[] = [];
        if (trade.status === 'rejected') {
          warnings.push(`Ripio Trade balances unavailable: ${userMessage(trade.reason)}`);
          ctx.log(`partial portfolio: trade balances failed: ${String(trade.reason)}`);
        }
        if (rates.status === 'rejected') {
          warnings.push(`Prices unavailable, holdings are not valued: ${userMessage(rates.reason)}`);
          ctx.log(`partial portfolio: rates failed: ${String(rates.reason)}`);
        }
        const portfolio = buildPortfolio({
          wallet: wallet.value,
          trade: trade.status === 'fulfilled' ? trade.value : undefined,
          rates: rates.status === 'fulfilled' ? rates.value : undefined,
          asOf: ctx.now(),
          includeZero: include_zero ?? false,
          warnings,
        });
        const usd = portfolio.totals.value_usd === undefined ? '' : ` (≈ ${portfolio.totals.value_usd} USD)`;
        const warned = warnings.length === 0 ? '' : ` Warnings: ${warnings.length}.`;
        return ok(portfolio, `${portfolio.holdings.length} holdings, estimated total ${portfolio.totals.value_ars} ARS${usd}.${warned}`);
      }),
  );
}
