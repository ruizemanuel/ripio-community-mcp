import { afterEach, describe, expect, it } from 'vitest';
import type { RipioClient } from '../../src/ripio/client.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { cvuAccount, EVM_ADDRESS, usdtNetworks, walletAddresses, walletCurrencies } from '../fixtures/deposits.js';
import { connectTools, fakeClient, type Harness } from '../helpers/harness.js';

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

const text = (result: { content?: unknown }): string =>
  ((result.content as Array<{ text?: string }> | undefined) ?? []).map((part) => part.text ?? '').join('\n');

const depositClient = (overrides: Partial<RipioClient> = {}): RipioClient =>
  fakeClient({
    walletCurrencies: async () => walletCurrencies,
    walletCurrencyNetworks: async () => usdtNetworks,
    walletAddresses: async () => walletAddresses,
    ...overrides,
  });

const reject = (kind: 'not_found' | 'upstream' | 'forbidden', endpoint: string) => async (): Promise<never> => {
  const status = { not_found: 404, upstream: 503, forbidden: 403 }[kind];
  throw new RipioApiError(kind, kind === 'not_found' ? 'Invalid currency' : 'down', { status, endpoint });
};

describe('ripio_get_deposit_address', () => {
  it('returns the exact address with its rules, and the address in the text too', async () => {
    const asked: string[] = [];
    harness = await connectTools(
      depositClient({
        walletCurrencyNetworks: async (asset) => {
          asked.push(asset);
          return usdtNetworks;
        },
      }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'usdt', network: 'Polygon' } });
    expect(result.isError).toBeFalsy();
    expect(asked).toEqual(['usdt']);
    expect(result.structuredContent).toMatchObject({ asset: 'USDT', asset_name: 'Tether', status: 'ok', deposit: { address: EVM_ADDRESS } });
    expect(text(result).split('\n')[0]).toBe(`USDT deposit address on Polygon: ${EVM_ADDRESS} (no memo)`);
  });

  it('lists the networks instead of guessing when none is given', async () => {
    harness = await connectTools(depositClient());
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'USDT' } });
    expect(result.structuredContent).toMatchObject({ status: 'choose_network' });
    expect(result.structuredContent).not.toHaveProperty('deposit');
    expect(text(result)).not.toContain(EVM_ADDRESS);
  });

  it('sends fiat to the deposit accounts tool', async () => {
    harness = await connectTools(depositClient({ walletCurrencyNetworks: async () => [] }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'ars' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('ARS is deposited by bank transfer, not to a crypto address: use ripio_get_deposit_accounts.');
  });

  it('names an unknown currency instead of a bare 404', async () => {
    harness = await connectTools(
      depositClient({ walletCurrencyNetworks: reject('not_found', '/wallet/network/currency-networks/nope/') }),
    );
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'nope' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Ripio has no currency 'NOPE'.");
  });

  it('reports deposits disabled for the whole asset', async () => {
    harness = await connectTools(depositClient());
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'TON', network: 'ton' } });
    expect(result.structuredContent).toMatchObject({ asset: 'TON', status: 'deposits_disabled' });
  });

  it('keeps answering without the currency list, and says what it could not check', async () => {
    harness = await connectTools(depositClient({ walletCurrencies: reject('upstream', '/wallet/currencies/') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'usdt', network: 'polygon' } });
    expect(result.structuredContent).toMatchObject({ asset: 'USDT', status: 'ok' });
    expect((result.structuredContent as { warnings: string[] }).warnings[0]).toBe(
      'Could not check whether Ripio accepts USDT deposits app-wide.',
    );
    expect(harness.logs.join('\n')).toContain('currencies unavailable');
  });

  it('fails when the addresses cannot be read', async () => {
    harness = await connectTools(depositClient({ walletAddresses: reject('forbidden', '/wallet/addresses/') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset: 'USDT', network: 'polygon' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Ripio denied access to /wallet/addresses/');
  });

  it.each([['US DT'], ['USDT!'], [''], ['A'.repeat(16)]])('rejects asset %j before calling Ripio', async (asset) => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_address', arguments: { asset } });
    expect(result.isError).toBe(true);
  });
});

describe('ripio_verify_deposit_address', () => {
  it('verifies a pasted address by code', async () => {
    harness = await connectTools(depositClient());
    const result = await harness.mcp.callTool({
      name: 'ripio_verify_deposit_address',
      arguments: { address: ` ${EVM_ADDRESS} `, asset: 'usdt', network: 'polygon' },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: 'verified', asset: 'USDT' });
    expect(text(result).split('\n')[0]).toBe(
      'This is exactly one of your Ripio Wallet deposit addresses and Ripio credits USDT to it via Ethereum (ERC-20), Polygon, BNB Chain (BEP-20).',
    );
  });

  it('only reads the addresses when no asset is given', async () => {
    harness = await connectTools(fakeClient({ walletAddresses: async () => walletAddresses }));
    const result = await harness.mcp.callTool({
      name: 'ripio_verify_deposit_address',
      arguments: { address: `${EVM_ADDRESS.slice(0, -1)}0` },
    });
    expect(result.structuredContent).toMatchObject({ status: 'near_miss' });
  });

  it('names an unknown currency', async () => {
    harness = await connectTools(
      depositClient({ walletCurrencyNetworks: reject('not_found', '/wallet/network/currency-networks/nope/') }),
    );
    const result = await harness.mcp.callTool({
      name: 'ripio_verify_deposit_address',
      arguments: { address: EVM_ADDRESS, asset: 'nope' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Ripio has no currency 'NOPE'.");
  });

  it('rejects an empty address before calling Ripio', async () => {
    harness = await connectTools(fakeClient({}));
    const result = await harness.mcp.callTool({ name: 'ripio_verify_deposit_address', arguments: { address: '' } });
    expect(result.isError).toBe(true);
  });
});

describe('ripio_get_deposit_accounts', () => {
  it('returns the CVU and alias with the transfer rule', async () => {
    harness = await connectTools(fakeClient({ walletDepositAccounts: async () => [cvuAccount] }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_accounts', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ accounts: [{ type: 'cvu', account_number: 'CVU-SYNTHETIC-0001' }] });
    expect(text(result).split('\n')[0]).toBe('CVU (ARS): CVU-SYNTHETIC-0001, alias synthetic.alias.ripio');
  });

  it('explains a missing deposit account instead of a bare 404', async () => {
    harness = await connectTools(fakeClient({ walletDepositAccounts: reject('not_found', '/wallet/banking/deposit-accounts/') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_accounts', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      "Ripio has no deposit account provisioned for this user; Ripio's documentation says to contact Ripio support.",
    );
  });

  it('adds the country rule to a 403', async () => {
    harness = await connectTools(fakeClient({ walletDepositAccounts: reject('forbidden', '/wallet/banking/deposit-accounts/') }));
    const result = await harness.mcp.callTool({ name: 'ripio_get_deposit_accounts', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('users in Argentina and Brazil');
  });
});
