import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { canonicalAsset, currencyDepositState } from '../domain/networks.js';
import { verifyDepositAddress, VerifyAddressSchema, type VerifyAddressInput } from '../domain/verify-address.js';
import { RipioApiError } from '../ripio/errors.js';
import { run, type ToolContext } from './context.js';
import { NetworkInput, TickerInput } from './inputs.js';
import { failText, ok, READ_ONLY_ANNOTATIONS } from './result.js';

export function registerVerifyDepositAddress(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ripio_verify_deposit_address',
    {
      title: 'Verify a Ripio deposit address',
      description:
        "Checks with code, character by character, that an address (and memo/tag) someone is about to send to is exactly one of the account's " +
        'Ripio app (Wallet) deposit addresses, on a network that credits the asset, and flags mistyped copies. Pass the address as pasted ' +
        'from where it will actually be used. Ripio Trade addresses are not checked.',
      inputSchema: z.object({
        address: z.string().min(1).max(200).describe('The address exactly as pasted.'),
        asset: TickerInput.optional(),
        network: NetworkInput.optional(),
        memo: z.string().max(100).optional().describe('Memo/tag as pasted, for networks that use one (XRP, Stellar, TON).'),
      }),
      outputSchema: VerifyAddressSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ address, asset, network, memo }) =>
      run(ctx, async (client) => {
        const [addresses, currencies, networks] = await Promise.allSettled([
          client.walletAddresses(),
          asset === undefined ? Promise.resolve(undefined) : client.walletCurrencies(),
          asset === undefined ? Promise.resolve(undefined) : client.walletCurrencyNetworks(asset),
        ]);
        if (addresses.status === 'rejected') throw addresses.reason;
        const warnings: string[] = [];
        let assetInfo: VerifyAddressInput['asset'];
        if (asset !== undefined) {
          const list = currencies.status === 'fulfilled' ? currencies.value : undefined;
          const ticker = canonicalAsset(asset, list);
          if (currencies.status === 'rejected') {
            warnings.push(`Could not check whether Ripio accepts ${ticker} deposits app-wide.`);
            ctx.log(`verify address: currencies unavailable: ${String(currencies.reason)}`);
          }
          if (networks.status === 'rejected') {
            if (networks.reason instanceof RipioApiError && networks.reason.kind === 'not_found') {
              return failText(`Ripio has no currency '${ticker}'.`);
            }
            throw networks.reason;
          }
          const state = currencyDepositState(list?.find((entry) => entry.ticker === ticker));
          assetInfo = { ticker, networks: networks.value ?? [], depositsDisabled: state === 'disabled' };
        }
        const result = verifyDepositAddress({ address, memo, network, asset: assetInfo, addresses: addresses.value, warnings });
        return ok(result, result.verdict);
      }),
  );
}
