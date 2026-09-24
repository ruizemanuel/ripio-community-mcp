import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildTradeEstimate, TradeEstimateOutputSchema } from '../domain/market.js';
import { toDecimal } from '../domain/money.js';
import { run, type ToolContext } from './context.js';
import { PairInput, PositiveDecimalInput, SideInput } from './inputs.js';
import { ok, READ_ONLY_ANNOTATIONS, userMessage } from './result.js';

export function registerEstimateTrade(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_estimate_trade',
    {
      title: 'Estimate a Ripio Trade order',
      description:
        'Estimates what a market order on Ripio Trade would cost or return right now: unit price for that size, gross ' +
        'value, your taker fee and the total. Read-only: nothing is executed.',
      inputSchema: z.object({
        pair: PairInput,
        side: SideInput,
        amount: PositiveDecimalInput.describe('Amount in the base currency, e.g. "100" to buy 100 USDT on USDT_ARS.'),
      }),
      outputSchema: TradeEstimateOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ pair, side, amount }) =>
      run(ctx, async (client) => {
        const normalizedPair = pair.toUpperCase();
        const normalizedAmount = toDecimal(amount) ?? amount;
        const [estimate, fees] = await Promise.allSettled([
          client.tradeEstimatePrice(normalizedPair, normalizedAmount, side),
          client.tradeFees(),
        ]);
        if (estimate.status === 'rejected') throw estimate.reason;
        const warnings =
          fees.status === 'rejected' ? [`Trading fees unavailable, total excludes fees: ${userMessage(fees.reason)}`] : [];
        const result = buildTradeEstimate({
          pair: normalizedPair,
          side,
          amount: normalizedAmount,
          price: estimate.value.price,
          fees: fees.status === 'fulfilled' ? fees.value : undefined,
          warnings,
        });
        const [base, quote] = normalizedPair.split('_');
        const fee = result.estimated_fee === undefined ? '' : `, fee ${result.estimated_fee}`;
        return ok(
          result,
          `${side} ${result.amount} ${base} ≈ ${result.estimated_total} ${quote} (unit ${result.estimated_unit_price}${fee}). Estimate only.`,
        );
      }),
  );
}
