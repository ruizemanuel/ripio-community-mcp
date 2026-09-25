import { describe, expect, it } from 'vitest';
import {
  buildDepositAddress,
  DepositAddressSchema,
  summarizeDepositAddress,
  type DepositAddressInput,
} from '../../src/domain/deposit-address.js';
import {
  addressOn,
  EVM_ADDRESS,
  network,
  receiving,
  usdtNetworks,
  walletAddresses,
  XRP_ADDRESS,
  XRP_MEMO,
  xrpAddress,
  xrpNetworks,
} from '../fixtures/deposits.js';

const usdt = (overrides: Partial<DepositAddressInput> = {}): DepositAddressInput => ({
  asset: 'USDT',
  assetName: 'Tether',
  depositsDisabled: false,
  networks: usdtNetworks,
  addresses: walletAddresses,
  ...overrides,
});
const xrp = (overrides: Partial<DepositAddressInput> = {}): DepositAddressInput => ({
  asset: 'XRP',
  depositsDisabled: false,
  networks: xrpNetworks,
  addresses: [xrpAddress],
  ...overrides,
});

const CREDITED = 'Ethereum (ERC-20), Polygon, BNB Chain (BEP-20), Tron (TRC-20), The Open Network';
const VENUE = 'This is a Ripio app (Wallet) address. Ripio Trade uses different deposit addresses.';

describe('buildDepositAddress', () => {
  it('returns the address exactly as Ripio sent it, with the rules to relay, in order', () => {
    const result = buildDepositAddress(usdt({ network: 'polygon' }));
    expect(result.status).toBe('ok');
    expect(result.deposit).toEqual({
      address: EVM_ADDRESS,
      memo: null,
      memo_required: false,
      network: { code: 'polygon', name: 'Polygon', label: 'Polygon', token_standard: null },
      address_version: 3,
    });
    expect(result.deposit?.address).toBe(walletAddresses[1]?.address);
    expect(result.warnings).toEqual([
      `Send only USDT over Polygon. Ripio credits USDT only via: ${CREDITED}. Sending over any other network can lose the funds.`,
      'This same address also exists on Base, Gnosis, where Ripio does not credit USDT.',
      'Ripio lists a minimum of 0.1 USDT on this network; smaller deposits may not be credited.',
      VENUE,
      'Ripio can rotate deposit addresses (this is version 3): get it again right before each deposit instead of reusing an old one.',
      'Copy the address exactly. Before sending, verify the address you will actually use with ripio_verify_deposit_address or against the Ripio app; for large amounts, send a small test deposit first.',
    ]);
    expect(DepositAddressSchema.safeParse(result).success).toBe(true);
  });

  it('asks for the network instead of guessing when several receive the asset', () => {
    const result = buildDepositAddress(usdt());
    expect(result.status).toBe('choose_network');
    expect(result.deposit).toBeUndefined();
    expect(result.next_step).toBe('Ask which network the sender will use: the address and the risk depend on it.');
    expect(result.networks).toHaveLength(5);
    expect(result.warnings).toEqual([VENUE]);
  });

  it('resolves the only network that receives the asset and relays its memo', () => {
    const result = buildDepositAddress(xrp());
    expect(result.status).toBe('ok');
    expect(result.deposit).toMatchObject({ address: XRP_ADDRESS, memo: XRP_MEMO, memo_required: true });
    expect(result.warnings).toContain(
      `This network requires a memo/tag: include ${XRP_MEMO} exactly as shown. Without it the deposit cannot be matched to the account and can be lost.`,
    );
  });

  it('never returns an address without the memo its network requires', () => {
    const result = buildDepositAddress(xrp({ addresses: [addressOn(xrpAddress.network, XRP_ADDRESS, 1, null)] }));
    expect(result.status).toBe('memo_missing');
    expect(result.deposit).toBeUndefined();
    expect(result.next_step).toBe(
      'Ripple needs a memo/tag but Ripio returned none. Do not send; check the deposit screen in the Ripio app.',
    );
  });

  it('says how to get an address Ripio has not assigned yet, and never makes one up', () => {
    const result = buildDepositAddress(usdt({ network: 'TRC20' }));
    expect(result.status).toBe('no_address');
    expect(result.deposit).toBeUndefined();
    expect(result.next_step).toBe(
      'Ripio has not assigned a Tron (TRC-20) address to this account yet. Open the Ripio app, start a USDT deposit and pick Tron (TRC-20) so Ripio assigns one, then ask again.',
    );
  });

  it('treats a blank address from Ripio as not assigned', () => {
    const blank = addressOn(network('polygon', 'Polygon'), '  ', 4);
    expect(buildDepositAddress(usdt({ network: 'polygon', addresses: [blank] })).status).toBe('no_address');
  });

  it('never falls back to an older address when the newest one is blank', () => {
    const polygon = network('polygon', 'Polygon');
    const addresses = [addressOn(polygon, EVM_ADDRESS, 2), addressOn(polygon, '', 3)];
    const result = buildDepositAddress(usdt({ network: 'polygon', addresses }));
    expect(result.status).toBe('no_address');
    expect(result.deposit).toBeUndefined();
  });

  it('answers no_address for an account without any address', () => {
    expect(buildDepositAddress(usdt({ network: 'polygon', addresses: [] })).status).toBe('no_address');
  });

  it('refuses a network that does not credit the asset, even where the account has an address', () => {
    const result = buildDepositAddress(usdt({ network: 'Base' }));
    expect(result.status).toBe('unsupported_network');
    expect(result.deposit).toBeUndefined();
    expect(result.warnings).toEqual([
      `Ripio lists no USDT network matching 'Base'. Ripio credits USDT only via: ${CREDITED}. Sending USDT over any other network can lose the funds.`,
      'You do have an address on Base, but Ripio does not credit USDT there.',
      VENUE,
    ]);
    expect(result.next_step).toBe('Ask the sender to use one of the networks that credit USDT, or do not send.');
  });

  it.each([[' '], ['-']])('returns no address for a network name %j that is only punctuation', (input) => {
    const result = buildDepositAddress(usdt({ network: input }));
    expect(result.status).toBe('unsupported_network');
    expect(result.deposit).toBeUndefined();
  });

  it('asks again when the network name matches several networks', () => {
    const twins = [
      receiving(network('ethereum', 'Ethereum'), 'Ethereum (ERC-20)', 0, { standard: 'ERC-20' }),
      receiving(network('arbitrum', 'Arbitrum'), 'Arbitrum', 1, { standard: 'ERC-20' }),
    ];
    const result = buildDepositAddress(usdt({ network: 'ERC20', networks: twins }));
    expect(result.status).toBe('choose_network');
    expect(result.next_step).toBe(
      "'ERC20' matches more than one USDT network (Ethereum (ERC-20), Arbitrum): ask which one the sender will use.",
    );
  });

  it('reports disabled deposits for one network, for the whole asset, or for every network', () => {
    const off = usdtNetworks.map((n) => (n.network.code === 'polygon' ? { ...n, receive: false } : n));
    expect(buildDepositAddress(usdt({ network: 'polygon', networks: off }))).toMatchObject({
      status: 'deposits_disabled',
      next_step: 'Ripio is not receiving USDT on Polygon right now.',
    });
    expect(buildDepositAddress(usdt({ depositsDisabled: true }))).toMatchObject({
      status: 'deposits_disabled',
      next_step: 'Ripio does not accept USDT deposits right now.',
    });
    expect(buildDepositAddress(usdt({ networks: [] }))).toMatchObject({
      status: 'deposits_disabled',
      next_step: 'Ripio lists no network that can receive USDT right now.',
    });
  });

  it('puts caller warnings and a partial outage first, and network notices right before the general warnings', () => {
    const shaky = usdtNetworks.map((n) =>
      n.network.code === 'polygon'
        ? { ...n, is_partial_disabled_receive: true, network: { ...n.network, status_tag: 'CONGESTED' } }
        : n,
    );
    const checkFailed = 'Could not check whether Ripio accepts USDT deposits app-wide.';
    const { warnings } = buildDepositAddress(usdt({ network: 'polygon', networks: shaky, warnings: [checkFailed] }));
    expect(warnings[0]).toBe(checkFailed);
    expect(warnings[1]).toBe('Ripio reports receiving on Polygon as partially disabled: confirm in the Ripio app before sending.');
    expect(warnings.indexOf('Ripio marks Polygon as "CONGESTED": deposits may take longer.')).toBe(warnings.indexOf(VENUE) - 1);
  });

  it('uses the newest address of a network', () => {
    const polygon = network('polygon', 'Polygon');
    const result = buildDepositAddress(usdt({ network: 'polygon', addresses: [addressOn(polygon, '0xOLD', 2), addressOn(polygon, '0xNEW', 3)] }));
    expect(result.deposit).toMatchObject({ address: '0xNEW', address_version: 3 });
  });

  it('asks for a memo when only the address entry says the network uses one', () => {
    const stellar = network('stellar', 'Stellar', { use_memo: null });
    const result = buildDepositAddress({
      asset: 'XLM',
      depositsDisabled: false,
      networks: [receiving(stellar, 'Stellar', 0)],
      addresses: [addressOn({ ...stellar, use_memo: true }, 'GSYNTHETIC', 1, null)],
    });
    expect(result.status).toBe('memo_missing');
    expect(result.deposit).toBeUndefined();
  });

  it('relays a memo Ripio sent even when no network flag asks for one', () => {
    const stellar = network('stellar', 'Stellar');
    const result = buildDepositAddress({
      asset: 'XLM',
      depositsDisabled: false,
      networks: [receiving(stellar, 'Stellar', 0)],
      addresses: [addressOn(stellar, 'GSYNTHETIC', 1, '999')],
    });
    expect(result.deposit).toMatchObject({ memo: '999', memo_required: true });
    expect(result.warnings).toContain(
      'This network requires a memo/tag: include 999 exactly as shown. Without it the deposit cannot be matched to the account and can be lost.',
    );
  });

  it('never hands out a numeric memo too large to have been read exactly', () => {
    const stellar = network('stellar', 'Stellar', { use_memo: true });
    const memo = JSON.parse('12345678901234567891') as number;
    const result = buildDepositAddress({
      asset: 'XLM',
      depositsDisabled: false,
      networks: [receiving(stellar, 'Stellar', 0)],
      addresses: [addressOn(stellar, 'GSYNTHETIC', 1, memo)],
    });
    expect(result.status).toBe('memo_missing');
    expect(result.deposit).toBeUndefined();
    expect(result.next_step).toBe(
      'Stellar needs a memo/tag but Ripio returned one that cannot be read exactly. Do not send; check the deposit screen in the Ripio app.',
    );
  });

  it('hands out no address when Ripio lists two at the newest version', () => {
    const polygon = network('polygon', 'Polygon');
    const addresses = [addressOn(polygon, EVM_ADDRESS, 3), addressOn(polygon, '0x0000000000000000000000000000000000000001', 3)];
    expect(buildDepositAddress(usdt({ network: 'polygon', addresses })).status).toBe('no_address');
  });

  it('mentions a maximum when Ripio lists one', () => {
    const capped = usdtNetworks.map((n) => (n.network.code === 'polygon' ? { ...n, max_amount: '6.00000000' } : n));
    expect(buildDepositAddress(usdt({ network: 'polygon', networks: capped })).warnings).toContain(
      'Ripio lists a maximum of 6 USDT on this network; larger deposits may not be credited.',
    );
  });
});

describe('summarizeDepositAddress', () => {
  it('puts the address, the network rule and the verification hint on three lines', () => {
    expect(summarizeDepositAddress(buildDepositAddress(usdt({ network: 'polygon' }))).split('\n')).toEqual([
      `USDT deposit address on Polygon: ${EVM_ADDRESS} (no memo)`,
      `Send only USDT over Polygon. Ripio credits USDT only via: ${CREDITED}. Sending over any other network can lose the funds.`,
      'Verify it before sending with ripio_verify_deposit_address.',
    ]);
  });

  it('includes the memo and its rule when there is one', () => {
    const summary = summarizeDepositAddress(buildDepositAddress(xrp()));
    expect(summary).toContain(`XRP deposit address on Ripple: ${XRP_ADDRESS} · memo/tag: ${XRP_MEMO}`);
    expect(summary).toContain(`This network requires a memo/tag: include ${XRP_MEMO} exactly as shown.`);
  });

  it('explains why there is no address', () => {
    expect(summarizeDepositAddress(buildDepositAddress(usdt()))).toBe(
      `No address returned: USDT can be received on 5 networks (${CREDITED}). Ask which network the sender will use: the address and the risk depend on it.`,
    );
    expect(summarizeDepositAddress(buildDepositAddress(usdt({ network: 'tron' })))).toMatch(
      /^No address returned: Ripio has not assigned a Tron \(TRC-20\) address/,
    );
    expect(summarizeDepositAddress(buildDepositAddress(usdt({ network: 'base' })))).toMatch(
      /^No address returned: Ripio lists no USDT network matching 'base'\./,
    );
  });
});
