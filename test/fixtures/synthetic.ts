import type {
  TradeBalance,
  TradeFee,
  TradeOpenOrders,
  TradeStatement,
  TradeTicker,
  WalletBalance,
  WalletLimit,
  WalletRail,
  WalletRate,
  WalletTransaction,
  WalletTransactionPage,
} from '../../src/ripio/schemas.js';

export const walletBalance: WalletBalance = {
  wallet: [
    { currency: 'ARS', amount: '2500.50', locked_amount: '0.00' },
    { currency: 'BTC', amount: '0.00000002', locked_amount: '0.00' },
    { currency: 'USDC', amount: '0.000050', locked_amount: '0.00' },
    { currency: 'RPC', amount: '250.5', locked_amount: '0.00' },
    { currency: 'ETH', amount: '0.00', locked_amount: '0.00' },
  ],
  virals: [],
};

export const tradeBalances: TradeBalance[] = [
  { currency_code: 'BTC', available_amount: 3e-7, locked_amount: 0 },
  { currency_code: 'USDT', available_amount: 0.05, locked_amount: 0 },
];

export const walletRates: WalletRate[] = [
  { ticker: 'BTC_ARS', buy_rate: '99000000', sell_rate: '98000000' },
  { ticker: 'USDC_ARS', buy_rate: '1600', sell_rate: '1580' },
  { ticker: 'USDT_ARS', buy_rate: '1610', sell_rate: '1590' },
  { ticker: 'USD_ARS', buy_rate: '1620', sell_rate: '1600' },
];

export const tradeTickers: TradeTicker[] = [
  { pair: 'USDT_ARS', bid: 1599.5, ask: 1606.1, last: '1599.5', price_change_percent_24h: '0.42', volume: 1234.5 },
  { pair: 'BTC_USDT', bid: 64000, ask: 64100, last: 64050, price_change_percent_24h: '-1.2', volume: 3.5 },
];

export const walletDeposit: WalletTransaction = {
  id: 1001,
  transaction_type: 'deposit',
  rail: 'bank',
  status: 'COM',
  from_currency: 'ARS',
  to_currency: 'ARS',
  amount_from: '1000.00',
  amount_to: '1000.00',
  fee: '0.00',
  fee_currency: 'ARS',
  origin: 'CVU ending 4321',
  destination: null,
  transaction_hash: null,
  created_at: '2025-06-18T14:20:10.123456+00:00',
};

export const walletWithdrawal: WalletTransaction = {
  id: 1002,
  transaction_type: 'withdrawal',
  rail: 'crypto',
  status: 'PEN',
  from_currency: 'usdt',
  to_currency: 'usdt',
  amount_from: '25.5',
  amount_to: '24.5',
  fee: '1',
  fee_currency: 'USDT',
  origin: null,
  destination: 'TXyz-example-address',
  transaction_hash: '0xabc123',
  created_at: '2025-06-04T11:05:30.654321+00:00',
};

export const walletSwap: WalletTransaction = {
  id: 1003,
  transaction_type: 'swap',
  rail: null,
  status: 'XYZ',
  from_currency: 'USDT',
  to_currency: 'BTC',
  amount_from: '100',
  amount_to: '0.001',
  created_at: '2025-03-10T09:45:15.987654+00:00',
};

export const walletTransactionPage: WalletTransactionPage = {
  results: [walletDeposit, walletWithdrawal, walletSwap],
  nc: 'ripio-next-token',
  pc: null,
};

export const tradeStatement: TradeStatement = {
  statement: [
    { amount: -0.5, after_balance: 1, currency: 'btc', date: '2022-03-14 09:21:37.418', operation: 'Sell', operation_id: 'op-1' },
    { amount: 30000, after_balance: 30000, currency: 'ARS', date: '2022-03-14 09:21:37.418', operation: 'Sell', operation_id: 'op-2' },
    { amount: -0.001, after_balance: 0.999, currency: 'BTC', date: '2022-03-14 09:21:38', operation: 'Tax over buy', operation_id: 'op-3' },
  ],
  pagination: { current_page: 1, total_pages: 2 },
};

export const tradeFees: TradeFee[] = [
  { side: 'buy', maker: 0.21, taker: 0.3 },
  { side: 'sell', maker: 0.21, taker: 0.3 },
];

export const walletLimits: WalletLimit[] = [
  {
    rail: null,
    transaction_types: [
      {
        transaction_type: 'withdrawal',
        currency: 'ARS',
        limits: { min_amount: null, max_amount: null, daily_amount: 900000000, monthly_amount: 900000000, annual_amount: 900000000 },
        remaining: { daily_amount: 900000000, monthly_amount: 900000000, annual_amount: 900000000 },
      },
    ],
  },
  {
    rail: 'ripio',
    transaction_types: [
      {
        transaction_type: 'swap',
        currency: 'USDT',
        limits: { min_amount: 1, max_amount: null, daily_amount: 50000, daily_qty: 50, monthly_amount: 900000, annual_amount: 900000 },
        remaining: { daily_amount: 49000, daily_qty: 49, monthly_amount: 899000, annual_amount: 899000 },
      },
    ],
  },
];

export const walletRails: WalletRail[] = [
  {
    rail: 'bank',
    name: 'Bank',
    transaction_types: [
      { transaction_type: 'withdrawal', enabled: true, account_enabled: true, blocked: false, fee: '0', fixed_fee: 0 },
    ],
  },
  {
    rail: 'crypto',
    name: 'Crypto',
    transaction_types: [
      { transaction_type: 'withdrawal', enabled: true, account_enabled: true, blocked: true, fee: { network: 'varies' } },
    ],
  },
];

export const tradeOpenOrders: TradeOpenOrders = {
  orders: [
    {
      id: 'ord-1',
      pair: 'usdt_ars',
      side: 'BUY',
      type: 'LIMIT',
      status: 'OPEN',
      price: 1500,
      requested_amount: 10,
      executed_amount: 2.5,
      remaining_amount: 7.5,
      create_date: '2026-09-20 10:00:00',
    },
  ],
  nc: 'orders-next',
};
