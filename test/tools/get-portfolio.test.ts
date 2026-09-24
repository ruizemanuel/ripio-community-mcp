import { afterEach, describe, expect, it } from 'vitest';
import { RipioApiError } from '../../src/ripio/errors.js';
import { tradeBalances, walletBalance, walletRates } from '../fixtures/synthetic.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const text = (result: { content?: unknown }): string =>
  ((result.content as Array<{ text?: string }> | undefined) ?? []).map((part) => part.text ?? '').join(' ');

describe('ripio_get_portfolio', () => {
  it('is advertised as read-only with an output schema', async () => {
    harness = await connectTools(fakeClient({}));
    const { tools } = await harness.mcp.listTools();
    const tool = tools.find((t) => t.name === 'ripio_get_portfolio');
    expect(tool?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    expect(tool?.outputSchema?.type).toBe('object');
  });

  it('returns the unified portfolio with a short summary', async () => {
    harness = await connectTools(
      fakeClient({
        walletBalance: async () => walletBalance,
        tradeBalances: async () => tradeBalances,
        walletRates: async () => walletRates,
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_portfolio', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      totals: { value_ars: '2611.44', value_usd: '1.63', unvalued_assets: ['RPC'] },
      warnings: [],
    });
    expect(result.content).toEqual([{ type: 'text', text: '6 holdings, estimated total 2611.44 ARS (≈ 1.63 USD).' }]);
  });

  it('still answers when Ripio Trade fails, with a warning naming the permission', async () => {
    harness = await connectTools(
      fakeClient({
        walletBalance: async () => walletBalance,
        tradeBalances: async () => {
          throw new RipioApiError('forbidden', 'Forbidden', { status: 403, endpoint: '/trade/user/balances' });
        },
        walletRates: async () => walletRates,
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_portfolio', arguments: {} });
    expect(result.isError).toBeFalsy();
    const { warnings } = result.structuredContent as { warnings: string[] };
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Ripio Trade balances unavailable');
    expect(warnings[0]).toContain('"Balance" permission');
  });

  it('fails with an actionable message when the Wallet cannot be read', async () => {
    harness = await connectTools(
      fakeClient({
        walletBalance: async () => {
          throw new RipioApiError('auth_token', 'Invalid token', { status: 401, endpoint: '/wallet/balance/' });
        },
        tradeBalances: async () => tradeBalances,
        walletRates: async () => walletRates,
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_portfolio', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('invalid or revoked');
    expect(harness.logs.join('\n')).toContain('auth_token');
  });

  it('explains missing credentials instead of calling Ripio', async () => {
    harness = await connectTools(new RipioApiError('config', 'RIPIO_API_KEY and RIPIO_API_SECRET not set. See README → Setup.'));
    const result = await harness.mcp.callTool({ name: 'ripio_get_portfolio', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('RIPIO_API_KEY and RIPIO_API_SECRET not set');
  });
});
