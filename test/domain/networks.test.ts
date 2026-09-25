import { describe, expect, it } from 'vitest';
import {
  canonicalAsset,
  canReceive,
  currencyDepositState,
  currentAddresses,
  describeNetworks,
  memoOf,
  resolveNetwork,
  sameAddress,
} from '../../src/domain/networks.js';
import {
  addressOn,
  EVM_ADDRESS,
  network,
  receiving,
  TRON_ADDRESS,
  usdtNetworks,
  walletAddresses,
  walletCurrencies,
} from '../fixtures/deposits.js';

describe('canonicalAsset', () => {
  it("uses Ripio's spelling of the ticker, even a mixed-case one", () => {
    expect(canonicalAsset('aaplx', walletCurrencies)).toBe('AAPLx');
    expect(canonicalAsset(' usdt ', walletCurrencies)).toBe('USDT');
  });

  it('upper-cases when the ticker or the list is unknown', () => {
    expect(canonicalAsset('doge', walletCurrencies)).toBe('DOGE');
    expect(canonicalAsset('aaplx', undefined)).toBe('AAPLX');
  });
});

describe('currencyDepositState', () => {
  const find = (ticker: string) => walletCurrencies.find((currency) => currency.ticker === ticker);

  it.each([
    ['USDT', 'enabled'],
    ['ARS', 'fiat'],
    ['USD', 'disabled'],
    ['TON', 'disabled'],
  ])('%s is %s', (ticker, state) => {
    expect(currencyDepositState(find(ticker))).toBe(state);
  });

  it('is unknown without the currency or its actions', () => {
    expect(currencyDepositState(undefined)).toBe('unknown');
    expect(currencyDepositState({ ticker: 'X', actions: null })).toBe('unknown');
  });
});

describe('canReceive', () => {
  const tron = receiving(network('tron', 'Tron'), 'Tron (TRC-20)', 5);

  it('needs receive on, and neither the currency network nor the network disabled', () => {
    expect(canReceive(tron)).toBe(true);
    expect(canReceive({ ...tron, receive: false })).toBe(false);
    expect(canReceive({ ...tron, receive: null })).toBe(false);
    expect(canReceive({ ...tron, enabled: false })).toBe(false);
    expect(canReceive({ ...tron, network: { ...tron.network, enabled: false } })).toBe(false);
  });

  it('treats a missing enabled flag as off, as the spec does', () => {
    expect(canReceive({ ...tron, enabled: null })).toBe(false);
    expect(canReceive({ ...tron, enabled: undefined })).toBe(false);
    expect(canReceive({ ...tron, network: { ...tron.network, enabled: null } })).toBe(false);
  });
});

describe('resolveNetwork', () => {
  const code = (input: string): string => {
    const match = resolveNetwork(input, usdtNetworks);
    return match.kind === 'one' ? match.network.network.code : match.kind;
  };

  it.each([
    ['tron', 'tron'],
    ['Tron', 'tron'],
    ['TRC20', 'tron'],
    ['trc-20', 'tron'],
    ['Tron (TRC-20)', 'tron'],
    ['BEP20', 'bsc'],
    ['bsc', 'bsc'],
    ['BNB Chain', 'bsc'],
    ['ERC20', 'ethereum'],
  ])('%j is %s', (input, expected) => {
    expect(code(input)).toBe(expected);
  });

  it.each([['base'], ['solana'], [' '], ['-'], ['()']])('%j matches nothing', (input) => {
    expect(code(input)).toBe('none');
  });

  it('reports every match when the name is ambiguous', () => {
    const twins = [
      receiving(network('ethereum', 'Ethereum'), 'Ethereum (ERC-20)', 0, { standard: 'ERC-20' }),
      receiving(network('arbitrum', 'Arbitrum'), 'Arbitrum', 1, { standard: 'ERC-20' }),
    ];
    expect(resolveNetwork('erc20', twins).kind).toBe('many');
  });
});

describe('sameAddress', () => {
  it('ignores letter case only for EVM addresses', () => {
    expect(sameAddress(EVM_ADDRESS, EVM_ADDRESS.toLowerCase())).toBe(true);
    expect(sameAddress(TRON_ADDRESS, TRON_ADDRESS)).toBe(true);
    expect(sameAddress(TRON_ADDRESS, TRON_ADDRESS.toLowerCase())).toBe(false);
  });
});

describe('currentAddresses', () => {
  it('keeps the highest version per network and skips blank addresses', () => {
    const polygon = network('polygon', 'Polygon');
    const tron = network('tron', 'Tron');
    const current = currentAddresses([addressOn(polygon, 'old', 2), addressOn(polygon, 'new', 3), addressOn(tron, '   ', 5)]);
    expect(current.map((entry) => entry.address)).toEqual(['new']);
  });
});

describe('currentAddresses when the newest address is blank', () => {
  it('treats the network as having no address instead of falling back to an older one', () => {
    const polygon = network('polygon', 'Polygon');
    expect(currentAddresses([addressOn(polygon, '0xOLD', 2), addressOn(polygon, '', 3)])).toEqual([]);
  });
});

describe('currentAddresses with a tie at the newest version', () => {
  const polygon = network('polygon', 'Polygon');
  const ripple = network('ripple', 'Ripple', { use_memo: true });

  it('keeps no address when two different ones share the newest version, in either order', () => {
    expect(currentAddresses([addressOn(polygon, '0xA', 3), addressOn(polygon, '0xB', 3)])).toEqual([]);
    expect(currentAddresses([addressOn(polygon, '0xA', 3), addressOn(polygon, '', 3)])).toEqual([]);
    expect(currentAddresses([addressOn(polygon, '', 3), addressOn(polygon, '0xA', 3)])).toEqual([]);
  });

  it('keeps no address when the same address has two memos at the newest version', () => {
    expect(currentAddresses([addressOn(ripple, 'r1', 1, '11'), addressOn(ripple, 'r1', 1, '22')])).toEqual([]);
  });

  it('keeps no address when tied entries disagree on whether a memo is needed, in either order', () => {
    const stellar = network('stellar', 'Stellar', { use_memo: false });
    const plain = addressOn(stellar, 'G1', 3, null);
    const unreadableMemo = addressOn(stellar, 'G1', 3, JSON.parse('12345678901234567891') as number);
    const flagged = addressOn({ ...stellar, use_memo: true }, 'G1', 3, null);
    expect(currentAddresses([plain, unreadableMemo])).toEqual([]);
    expect(currentAddresses([unreadableMemo, plain])).toEqual([]);
    expect(currentAddresses([plain, flagged])).toEqual([]);
    expect(currentAddresses([flagged, plain])).toEqual([]);
  });

  it('keeps a repeated identical entry', () => {
    expect(currentAddresses([addressOn(polygon, '0xA', 3), addressOn(polygon, '0xA', 3)]).map((e) => e.address)).toEqual(['0xA']);
  });
});

describe('memoOf', () => {
  const ripple = network('ripple', 'Ripple', { use_memo: true });

  it.each([
    [null, null],
    ['', null],
    ['  ', null],
    [123456789, '123456789'],
    ['00042', '00042'],
  ])('%j is %j', (memo, expected) => {
    expect(memoOf(addressOn(ripple, 'r', 1, memo))).toBe(expected);
  });
});

describe('memoOf with numbers JSON cannot carry exactly', () => {
  it.each([['12345678901234567891'], ['1e21']])('refuses %s as JSON.parse reads it', (json) => {
    const stellar = network('stellar', 'Stellar', { use_memo: true });
    expect(memoOf(addressOn(stellar, 'G', 1, JSON.parse(json) as number))).toBeNull();
  });
});

describe('describeNetworks', () => {
  it('lists every network in Ripio order with what a sender needs to know', () => {
    const networks = describeNetworks('USDT', usdtNetworks, walletAddresses);
    expect(networks.map((n) => n.code)).toEqual(['ethereum', 'polygon', 'bsc', 'tron', 'ton']);
    expect(networks[0]).toEqual({
      code: 'ethereum',
      name: 'Ethereum',
      label: 'Ethereum (ERC-20)',
      token_standard: 'ERC-20',
      can_receive: true,
      memo_required: false,
      typical_minutes: 10,
      address_assigned: true,
      notes: [],
    });
    expect(networks[1]).toMatchObject({ code: 'polygon', min_amount: '0.1', token_standard: null });
    expect(networks[3]).toMatchObject({ code: 'tron', address_assigned: false });
    expect(networks[4]).toMatchObject({ code: 'ton', memo_required: true });
  });

  it('drops a zero minimum and a delivery time that is not a number', () => {
    const avalanche = receiving(network('avalanche', 'AVAX C-Chain', { deliver_time: '~15 min' }), 'AVAX C-Chain', 8, {
      min_amount: '0.00000000',
    });
    const [only] = describeNetworks('USDT', [avalanche], []);
    expect(only?.min_amount).toBeUndefined();
    expect(only?.typical_minutes).toBeUndefined();
  });

  it('drops a negative minimum or maximum', () => {
    const odd = receiving(network('polygon', 'Polygon'), 'Polygon', 1, { min_amount: '-1', max_amount: '-5.5' });
    const [only] = describeNetworks('USDT', [odd], []);
    expect(only?.min_amount).toBeUndefined();
    expect(only?.max_amount).toBeUndefined();
  });

  it('turns partial outages, congestion and receive notices into notes', () => {
    const polygon = receiving(network('polygon', 'Polygon', { status_tag: 'CONGESTED' }), 'Polygon', 1, {
      is_partial_disabled_receive: true,
      messages: [
        { level: 'warning', title: 'currency_network_bridge_alert', values: { currency: 'USDC.e' }, location: ['receive'] },
        { level: 'info', title: 'maintenance_window', values: null, location: ['receive', 'send'] },
        { level: 'info', title: 'send_only_notice', location: ['send'] },
        { title: null, location: null },
      ],
    });
    const [only] = describeNetworks('USDC', [polygon], []);
    expect(only?.notes).toEqual([
      'Ripio reports receiving on Polygon as partially disabled: confirm in the Ripio app before sending.',
      'Ripio marks Polygon as "CONGESTED": deposits may take longer.',
      'Ripio shows a bridged-token notice for USDC.e on Polygon: check in the Ripio app which token it credits before sending.',
      'Ripio shows a notice for receiving USDC on Polygon (maintenance_window): check the deposit screen in the Ripio app before sending.',
    ]);
  });
});
