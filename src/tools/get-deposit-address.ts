import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildDepositAddress, DepositAddressSchema, summarizeDepositAddress } from '../domain/deposit-address.js';
import { canonicalAsset, currencyDepositState } from '../domain/networks.js';
import { RipioApiError } from '../ripio/errors.js';
import { run, type ToolContext } from './context.js';
import { NetworkInput, TickerInput } from './inputs.js';
import { failText, ok, READ_ONLY_ANNOTATIONS } from './result.js';

export function registerGetDepositAddress(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_get_deposit_address',
    {
      title: 'Ripio deposit address',
      description:
        'The Ripio app (Wallet) crypto deposit address for an asset on one network, with its memo/tag when the network needs one ' +
        'and the warnings to relay before anyone sends funds. Without a network, or with an ambiguous one, it returns no address ' +
        'and lists the networks that receive the asset. It never creates an address. Ripio Trade uses different addresses.',
      inputSchema: z.object({ asset: TickerInput, network: NetworkInput.optional() }),
      outputSchema: DepositAddressSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ asset, network }) =>
      run(ctx, async (client) => {
        // Ripio matches the ticker in the path case-insensitively, so all three calls can run at once.
        const [currencies, networks, addresses] = await Promise.allSettled([
          client.walletCurrencies(),
          client.walletCurrencyNetworks(asset),
          client.walletAddresses(),
        ]);
        const list = currencies.status === 'fulfilled' ? currencies.value : undefined;
        const ticker = canonicalAsset(asset, list);
        const warnings: string[] = [];
        if (currencies.status === 'rejected') {
          warnings.push(`Could not check whether Ripio accepts ${ticker} deposits app-wide.`);
          ctx.log(`deposit address: currencies unavailable: ${String(currencies.reason)}`);
        }
        const currency = list?.find((entry) => entry.ticker === ticker);
        const state = currencyDepositState(currency);
        if (state === 'fiat') {
          return failText(`${ticker} is deposited by bank transfer, not to a crypto address: use ripio_get_deposit_accounts.`);
        }
        if (networks.status === 'rejected') {
          if (networks.reason instanceof RipioApiError && networks.reason.kind === 'not_found') {
            return failText(`Ripio has no currency '${ticker}'.`);
          }
          throw networks.reason;
        }
        if (addresses.status === 'rejected') throw addresses.reason;
        const result = buildDepositAddress({
          asset: ticker,
          assetName: currency?.name ?? undefined,
          network,
          depositsDisabled: state === 'disabled',
          networks: networks.value,
          addresses: addresses.value,
          warnings,
        });
        return ok(result, summarizeDepositAddress(result));
      }),
  );
}
