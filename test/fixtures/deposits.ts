import type { WalletAddress, WalletCurrency, WalletCurrencyNetwork, WalletDepositAccount } from '../../src/ripio/schemas.js';

type Network = WalletCurrencyNetwork['network'];

/** The EIP-55 example address from the EIP itself, not anyone's deposit address. */
export const EVM_ADDRESS = '0x52908400098527886E0F7030069857D2E4169EE7';
export const TRON_ADDRESS = 'TSyntheticTronDepositAddress00001';
export const XRP_ADDRESS = 'rSyntheticRippleDepositAddress0001';
export const XRP_MEMO = '123456789';

export const network = (code: string, name: string, extra: Partial<Network> = {}): Network => ({
  code,
  name,
  status_tag: 'NORMAL',
  deliver_time: 1,
  enabled: true,
  use_memo: false,
  ...extra,
});

export const addressOn = (
  net: Network,
  address: string,
  version: number | null = 3,
  memo_id: string | number | null = null,
): WalletAddress => ({ address, memo_id, version, network: net });

export const receiving = (
  net: Network,
  network_standard: string,
  order: number,
  extra: Partial<WalletCurrencyNetwork> = {},
): WalletCurrencyNetwork => ({
  network: net,
  standard: null,
  network_standard,
  receive: true,
  enabled: true,
  order,
  min_amount: null,
  max_amount: null,
  is_partial_disabled_receive: false,
  messages: [],
  ...extra,
});

/** Like the test account: one EVM address on several EVM networks, nothing on Tron or TON. */
export const walletAddresses: WalletAddress[] = [
  addressOn(network('ethereum', 'Ethereum', { deliver_time: 10 }), EVM_ADDRESS),
  addressOn(network('polygon', 'Polygon'), EVM_ADDRESS),
  addressOn(network('bsc', 'BNB Chain'), EVM_ADDRESS),
  addressOn(network('base', 'Base', { deliver_time: 2 }), EVM_ADDRESS),
  addressOn(network('gnosis', 'Gnosis', { deliver_time: 2 }), EVM_ADDRESS),
];

/** USDT networks in Ripio's shape, deliberately not in `order`. */
export const usdtNetworks: WalletCurrencyNetwork[] = [
  receiving(network('tron', 'Tron', { deliver_time: 10 }), 'Tron (TRC-20)', 5, { standard: 'TRC-20' }),
  receiving(network('ethereum', 'Ethereum', { deliver_time: 10 }), 'Ethereum (ERC-20)', 0, { standard: 'ERC-20' }),
  receiving(network('polygon', 'Polygon'), 'Polygon', 1, { min_amount: '0.10000000' }),
  receiving(network('bsc', 'BNB Chain'), 'BNB Chain (BEP-20)', 3, { standard: 'BEP-20' }),
  receiving(network('ton', 'The Open Network', { use_memo: true }), 'The Open Network', 10),
];

export const xrpNetworks: WalletCurrencyNetwork[] = [receiving(network('ripple', 'Ripple', { use_memo: true }), 'Ripple', 0)];

export const xrpAddress = addressOn(network('ripple', 'Ripple', { use_memo: true }), XRP_ADDRESS, 1, XRP_MEMO);

const deposit = (enabled: boolean, rails: string[]) => [{ transaction_type: 'deposit', enabled, rails }];

export const walletCurrencies: WalletCurrency[] = [
  { ticker: 'USDT', name: 'Tether', type: 'ERC20_TOKEN', actions: deposit(true, ['crypto', 'ripio']) },
  { ticker: 'XRP', name: 'XRP', type: 'CRYPTO', actions: deposit(true, ['crypto', 'ripio']) },
  { ticker: 'ARS', name: 'Peso argentino', type: 'FIAT', actions: deposit(true, ['bank', 'crypto', 'ripio']) },
  { ticker: 'USD', name: 'US Dollar', type: 'FIAT', actions: [] },
  { ticker: 'TON', name: 'Toncoin', type: 'CRYPTO', actions: deposit(false, ['crypto']) },
  { ticker: 'AAPLx', name: 'Apple xStock', type: 'XTOKEN', actions: deposit(true, ['crypto']) },
];

export const cvuAccount: WalletDepositAccount = {
  type: 'cvu',
  account_number: 'CVU-SYNTHETIC-0001',
  account_label: 'synthetic.alias.ripio',
  currency: 'ARS',
  deposit_constraint: null,
};
