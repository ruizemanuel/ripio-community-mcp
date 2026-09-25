import { describe, expect, it } from 'vitest';
import { levenshtein, verifyDepositAddress, VerifyAddressSchema, type VerifyAddressInput } from '../../src/domain/verify-address.js';
import {
  addressOn,
  EVM_ADDRESS,
  network,
  receiving,
  TRON_ADDRESS,
  usdtNetworks,
  walletAddresses,
  XRP_ADDRESS,
  XRP_MEMO,
  xrpAddress,
  xrpNetworks,
} from '../fixtures/deposits.js';

const verify = (overrides: Partial<VerifyAddressInput> = {}) =>
  verifyDepositAddress({ address: EVM_ADDRESS, addresses: walletAddresses, ...overrides });
const usdt = { ticker: 'USDT', networks: usdtNetworks, depositsDisabled: false };
const USDT_VIA = 'Ethereum (ERC-20), Polygon, BNB Chain (BEP-20)';
/** EVM_ADDRESS with its last character replaced by a different hex digit. */
const ONE_OFF = `${EVM_ADDRESS.slice(0, -1)}0`;

describe('levenshtein', () => {
  it.each([
    ['', 'abc', 3],
    ['kitten', 'sitting', 3],
    ['same', 'same', 0],
    ['0xab', '0xac', 1],
  ])('%j vs %j is %i', (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance);
  });
});

describe('verifyDepositAddress', () => {
  it("verifies an exact copy and lists the networks where it is the account's", () => {
    const result = verify();
    expect(result.status).toBe('verified');
    expect(result.verdict).toBe('This is exactly one of your Ripio Wallet deposit addresses.');
    expect(result.address_networks.map((n) => n.code)).toEqual(['ethereum', 'polygon', 'bsc', 'base', 'gnosis']);
    expect(VerifyAddressSchema.safeParse(result).success).toBe(true);
  });

  it('accepts an EVM address in another letter case, and a pasted copy with spaces or a newline', () => {
    expect(verify({ address: EVM_ADDRESS.toLowerCase() }).status).toBe('verified');
    expect(verify({ address: `  ${EVM_ADDRESS}\n` }).status).toBe('verified');
  });

  it('flags a copy with one character changed, and says where', () => {
    const result = verify({ address: ONE_OFF });
    expect(result.status).toBe('near_miss');
    expect(result.near_miss).toEqual({ distance: 1, differing_positions: [42] });
    expect(result.verdict).toBe(
      'This is NOT your address: it differs from your Ethereum, Polygon, BNB Chain, Base, Gnosis address at character 42. ' +
        'It looks like a mistyped copy — do not use it; copy the address again.',
    );
  });

  it('flags an extra character, such as a trailing period, as a mistyped copy', () => {
    const result = verify({ address: `${EVM_ADDRESS}.` });
    expect(result.status).toBe('near_miss');
    expect(result.near_miss).toEqual({ distance: 1 });
    expect(result.verdict).toContain('by 1 character.');
  });

  it('flags a lowercase EVM copy with an extra character as a mistyped copy', () => {
    const result = verify({ address: `${EVM_ADDRESS.toLowerCase()}.` });
    expect(result.status).toBe('near_miss');
    expect(result.near_miss).toEqual({ distance: 1 });
  });

  it('never reports a near miss by 0 characters for an upper-case 0X prefix', () => {
    const result = verify({ address: `0X${EVM_ADDRESS.slice(2)}` });
    expect(result.status).not.toBe('verified');
    expect(result.near_miss?.distance).not.toBe(0);
  });

  it('is case-sensitive for addresses that are not EVM', () => {
    const tron = addressOn(network('tron', 'Tron'), TRON_ADDRESS);
    expect(verifyDepositAddress({ address: TRON_ADDRESS.toLowerCase(), addresses: [tron] }).status).not.toBe('verified');
  });

  it("never reveals the account's addresses when the address is someone else's", () => {
    const result = verify({ address: 'TSomeoneElsesAddressThatIsFarAway9' });
    expect(result.status).toBe('not_yours');
    expect(result.verdict).toBe(
      'This is not one of your Ripio Wallet deposit addresses. Do not send to it expecting it to reach your Ripio app account. ' +
        'Ripio Trade addresses are not checked here.',
    );
    expect(JSON.stringify(result)).not.toContain(EVM_ADDRESS);
  });

  it('does not verify an address that a newer, blank one has replaced', () => {
    const polygon = network('polygon', 'Polygon');
    expect(verify({ addresses: [addressOn(polygon, EVM_ADDRESS, 2), addressOn(polygon, '', 3)] }).status).not.toBe('verified');
  });

  it('answers not_yours for an account without addresses', () => {
    expect(verify({ addresses: [] }).status).toBe('not_yours');
  });

  it('says through which of its networks Ripio credits the asset', () => {
    const result = verify({ asset: usdt });
    expect(result).toMatchObject({
      status: 'verified',
      asset: 'USDT',
      credited_via: ['Ethereum (ERC-20)', 'Polygon', 'BNB Chain (BEP-20)'],
      not_credited_via: ['Base', 'Gnosis'],
    });
    expect(result.verdict).toBe(`This is exactly one of your Ripio Wallet deposit addresses and Ripio credits USDT to it via ${USDT_VIA}.`);
    expect(result.warnings[0]).toBe(
      `Ripio credits USDT to this address only via: ${USDT_VIA}. Sending over any other network can lose the funds.`,
    );
  });

  it('rejects a network that does not credit the asset', () => {
    const result = verify({ asset: usdt, network: 'base' });
    expect(result.status).toBe('wrong_network');
    expect(result.verdict).toBe(
      `This is your address, but Ripio does not credit USDT to it via Base. Ripio credits USDT to it only via: ${USDT_VIA}.`,
    );
  });

  it("rejects a network where the address is not the account's", () => {
    expect(verify({ asset: usdt, network: 'TRC20' })).toMatchObject({
      status: 'wrong_network',
      verdict: `This address is not assigned to Tron (TRC-20) on your account. Ripio credits USDT to it only via: ${USDT_VIA}.`,
    });
  });

  it('never points to a network that does not credit the asset when the one given does not match', () => {
    expect(verify({ asset: usdt, network: 'TRC20' }).verdict).not.toMatch(/Base|Gnosis/);
    expect(verify({ asset: { ...usdt, depositsDisabled: true }, network: 'TRC20' }).verdict).toBe(
      'This address is not assigned to Tron (TRC-20) on your account, and Ripio does not credit USDT to this address on any network.',
    );
  });

  it('asks for one network when the name matches several of the asset', () => {
    const twins = [
      receiving(network('ethereum', 'Ethereum'), 'Ethereum (ERC-20)', 0, { standard: 'ERC-20' }),
      receiving(network('arbitrum', 'Arbitrum'), 'Arbitrum', 1, { standard: 'ERC-20' }),
    ];
    const addresses = [addressOn(network('ethereum', 'Ethereum'), EVM_ADDRESS), addressOn(network('arbitrum', 'Arbitrum'), EVM_ADDRESS)];
    const result = verify({ asset: { ticker: 'USDT', networks: twins, depositsDisabled: false }, network: 'ERC20', addresses });
    expect(result.status).toBe('wrong_network');
    expect(result.verdict).toBe(
      "'ERC20' matches several networks (Ethereum (ERC-20), Arbitrum): verify again with the one the sender will use.",
    );
  });

  it('names the networks the address is on when the one given does not match', () => {
    const tron = addressOn(network('tron', 'Tron'), TRON_ADDRESS);
    expect(verifyDepositAddress({ address: TRON_ADDRESS, network: 'TRC20', addresses: [tron] }).verdict).toBe(
      'This address is not assigned to TRC20 on your account; it is your address on Tron.',
    );
  });

  it('does not verify an asset Ripio is not accepting', () => {
    const result = verify({ asset: { ...usdt, depositsDisabled: true } });
    expect(result.status).toBe('wrong_network');
    expect(result.verdict).toBe('Ripio does not credit USDT to this address on any network.');
    expect(result.warnings[0]).toBe('Ripio does not accept USDT deposits right now.');
  });

  it('checks the memo on networks that need one', () => {
    const xrp = { address: XRP_ADDRESS, addresses: [xrpAddress], asset: { ticker: 'XRP', networks: xrpNetworks, depositsDisabled: false } };
    expect(verifyDepositAddress({ ...xrp, memo: XRP_MEMO }).status).toBe('verified');
    expect(verifyDepositAddress({ ...xrp, memo: ` ${XRP_MEMO} ` }).status).toBe('verified');
    const missing = verifyDepositAddress(xrp);
    expect(missing).toMatchObject({ status: 'memo_mismatch', expected_memo: XRP_MEMO });
    expect(missing.verdict).toBe(
      `The address is yours, but Ripple requires the memo/tag ${XRP_MEMO}; without the exact memo the deposit can be lost.`,
    );
    expect(verifyDepositAddress({ ...xrp, memo: '12345678' }).status).toBe('memo_mismatch');
  });

  it('checks the memo when only the asset network says the network uses one', () => {
    const stellar = network('stellar', 'Stellar', { use_memo: null });
    const asset = { ticker: 'XLM', networks: [receiving({ ...stellar, use_memo: true }, 'Stellar', 0)], depositsDisabled: false };
    const result = verifyDepositAddress({ address: 'GSYNTHETIC', asset, addresses: [addressOn(stellar, 'GSYNTHETIC', 1, '999')] });
    expect(result).toMatchObject({ status: 'memo_mismatch', expected_memo: '999' });
  });

  it('checks a memo Ripio sent even when no network flag asks for one', () => {
    const stellar = network('stellar', 'Stellar');
    const result = verifyDepositAddress({ address: 'GSYNTHETIC', addresses: [addressOn(stellar, 'GSYNTHETIC', 1, '999')] });
    expect(result).toMatchObject({ status: 'memo_mismatch', expected_memo: '999' });
  });

  it('never confirms a memo that is a number too large to have been read exactly', () => {
    const stellar = network('stellar', 'Stellar', { use_memo: true });
    const memo = JSON.parse('12345678901234567891') as number;
    const result = verifyDepositAddress({
      address: 'GSYNTHETIC',
      memo: '12345678901234567891',
      addresses: [addressOn(stellar, 'GSYNTHETIC', 1, memo)],
    });
    expect(result.status).toBe('memo_mismatch');
    expect(result.expected_memo).toBeUndefined();
    expect(result.verdict).toBe(
      'Stellar requires a memo/tag, but Ripio returned one for this address that cannot be read exactly: do not send; check the Ripio app.',
    );
  });

  it('notes a memo that the network does not use', () => {
    expect(verify({ memo: '42' }).warnings).toContain('This network does not use a memo/tag; the one given is not needed.');
  });

  it('says that only the address was checked when no asset is given', () => {
    const addressOnly =
      'Only the address was checked. To confirm that Ripio credits the asset on the network the sender will use, ' +
      'verify again with the asset and network.';
    expect(verify().warnings).toContain(addressOnly);
    expect(verify({ asset: usdt }).warnings).not.toContain(addressOnly);
  });

  it("ignores spaces around Ripio's own address and memo when comparing", () => {
    const tron = addressOn(network('tron', 'Tron'), ` ${TRON_ADDRESS} `);
    expect(verifyDepositAddress({ address: TRON_ADDRESS, addresses: [tron] }).status).toBe('verified');
    const padded = addressOn(xrpAddress.network, XRP_ADDRESS, 1, ` ${XRP_MEMO} `);
    expect(verifyDepositAddress({ address: XRP_ADDRESS, memo: XRP_MEMO, addresses: [padded] }).status).toBe('verified');
  });

  it('puts caller warnings first', () => {
    const checkFailed = 'Could not check whether Ripio accepts USDT deposits app-wide.';
    expect(verify({ warnings: [checkFailed] }).warnings[0]).toBe(checkFailed);
  });

  it('says an address Ripio lists in a conflicting tie cannot be verified, instead of "not yours"', () => {
    const polygon = network('polygon', 'Polygon');
    const tie = [addressOn(polygon, EVM_ADDRESS, 3), addressOn(polygon, '0x0000000000000000000000000000000000000001', 3)];
    for (const address of [EVM_ADDRESS, EVM_ADDRESS.toLowerCase()]) {
      const result = verify({ address, addresses: tie });
      expect(result.status, address).toBe('conflicting');
      expect(result.verdict).toBe(
        'Ripio lists this address for your account on Polygon, but together with a different address or memo at the same version, ' +
          'so it cannot be verified. Do not send to it; check the deposit screen in the Ripio app.',
      );
      expect(result.address_networks).toEqual([]);
      expect(VerifyAddressSchema.safeParse(result).success).toBe(true);
    }
    expect(verify({ address: TRON_ADDRESS, addresses: tie }).status).toBe('not_yours');
  });

  it('says a conflicting network cannot be verified even when the address is current on other networks', () => {
    const polygon = network('polygon', 'Polygon');
    const addresses = [
      addressOn(network('ethereum', 'Ethereum'), EVM_ADDRESS, 3),
      addressOn(polygon, EVM_ADDRESS, 3),
      addressOn(polygon, '0x0000000000000000000000000000000000000001', 3),
    ];
    const result = verify({ address: EVM_ADDRESS, network: 'polygon', asset: usdt, addresses });
    expect(result.status).toBe('conflicting');
    expect(result.verdict).toContain('Ripio lists this address for your account on Polygon, but together with a different address or memo');
    expect(result.address_networks).toEqual([{ code: 'ethereum', name: 'Ethereum' }]);
    expect(verify({ address: EVM_ADDRESS, network: 'ethereum', asset: usdt, addresses }).status).toBe('verified');
  });
});
