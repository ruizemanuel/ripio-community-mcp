import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildPrices, PricesSchema, QuoteSchema, type Prices } from '../domain/market.js';
import { run, type ToolContext } from './context.js';
import { AssetInput } from './inputs.js';
import { ok, READ_ONLY_ANNOTATIONS, userMessage } from './result.js';

function summarize(prices: Prices): string {
  const parts = prices.prices.map((entry) => {
    const app = entry.app ? `app buy ${entry.app.buy} / sell ${entry.app.sell}` : 'no app rate';
    const exchange = entry.exchange?.last ? `Trade last ${entry.exchange.last}` : 'no Trade pair';
    return `${entry.asset}: ${app}; ${exchange}`;
  });
  if (prices.not_found.length > 0) parts.push(`not found: ${prices.not_found.join(', ')}`);
  return `${parts.join('. ')} (${prices.quote}).`;
}

export function registerGetPrices(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_prices',
    {
      title: 'Ripio prices',
      description:
        'Current prices for one or more assets: the Ripio app buy/sell rates (with spread) and, when the pair exists, ' +
        'the Ripio Trade book (bid, ask, last, 24h change and volume), so app and exchange prices can be compared.',
      inputSchema: z.object({
        assets: z.array(AssetInput).min(1).max(20).describe('Tickers, e.g. ["USDT", "BTC"].'),
        quote: QuoteSchema.optional().describe('Default "ARS".'),
      }),
      outputSchema: PricesSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ assets, quote }) =>
      run(ctx, async (client) => {
        const [rates, tickers] = await Promise.allSettled([client.walletRates(), client.tradeTickers()]);
        if (rates.status === 'rejected' && tickers.status === 'rejected') throw rates.reason;
        const warnings: string[] = [];
        if (rates.status === 'rejected') warnings.push(`Ripio app rates unavailable: ${userMessage(rates.reason)}`);
        if (tickers.status === 'rejected') warnings.push(`Ripio Trade prices unavailable: ${userMessage(tickers.reason)}`);
        const prices = buildPrices({
          assets,
          quote: quote ?? 'ARS',
          rates: rates.status === 'fulfilled' ? rates.value : undefined,
          tickers: tickers.status === 'fulfilled' ? tickers.value : undefined,
          asOf: ctx.now(),
          warnings,
        });
        return ok(prices, summarize(prices));
      }),
  );
}
