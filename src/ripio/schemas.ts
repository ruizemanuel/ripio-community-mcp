import * as z from 'zod/v4';
import { RipioApiError } from './errors.js';

/** Ripio mixes JSON numbers and numeric strings (Trade tickers return `last: "1599.5"`). */
export const Numeric = z.union([z.number(), z.string()]);
const OptionalNumeric = Numeric.nullish();
const OptionalString = z.string().nullish();

export const WalletBalanceSchema = z.object({
  wallet: z.array(z.object({ currency: z.string(), amount: Numeric, locked_amount: OptionalNumeric })),
  virals: z
    .array(
      z.object({
        currency: OptionalString,
        symbol: OptionalString,
        amount: OptionalNumeric,
        balance: OptionalNumeric,
        locked_amount: OptionalNumeric,
      }),
    )
    .nullish(),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export const WalletRatesSchema = z.array(
  z.object({ ticker: z.string(), buy_rate: Numeric, sell_rate: Numeric, variation: OptionalNumeric }),
);
export type WalletRate = z.infer<typeof WalletRatesSchema>[number];

export const WalletTransactionSchema = z.object({
  id: z.number().int(),
  external_id: OptionalString,
  transaction_type: z.string(),
  rail: OptionalString,
  status: z.string(),
  transaction_hash: OptionalString,
  from_currency: OptionalString,
  to_currency: OptionalString,
  fee_currency: OptionalString,
  fee: OptionalNumeric,
  amount_from: OptionalNumeric,
  amount_to: OptionalNumeric,
  origin: OptionalString,
  destination: OptionalString,
  created_at: z.string(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export const WalletTransactionPageSchema = z.object({
  results: z.array(WalletTransactionSchema),
  nc: OptionalString,
  pc: OptionalString,
});
export type WalletTransactionPage = z.infer<typeof WalletTransactionPageSchema>;

const LimitValuesSchema = z.object({
  min_amount: OptionalNumeric,
  max_amount: OptionalNumeric,
  daily_amount: OptionalNumeric,
  daily_qty: OptionalNumeric,
  monthly_amount: OptionalNumeric,
  monthly_qty: OptionalNumeric,
  annual_amount: OptionalNumeric,
  annual_qty: OptionalNumeric,
});
export type LimitValues = z.infer<typeof LimitValuesSchema>;

export const WalletLimitsSchema = z.array(
  z.object({
    rail: OptionalString,
    transaction_types: z.array(
      z.object({
        transaction_type: z.string(),
        currency: z.string(),
        limits: LimitValuesSchema.nullish(),
        remaining: LimitValuesSchema.nullish(),
      }),
    ),
  }),
);
export type WalletLimit = z.infer<typeof WalletLimitsSchema>[number];

export const WalletRailsSchema = z.array(
  z.object({
    rail: z.string(),
    name: OptionalString,
    transaction_types: z.array(
      z.object({
        transaction_type: z.string(),
        enabled: z.boolean().nullish(),
        account_enabled: z.boolean().nullish(),
        blocked: z.boolean().nullish(),
        fee: z.unknown().optional(),
        fixed_fee: z.unknown().optional(),
      }),
    ),
  }),
);
export type WalletRail = z.infer<typeof WalletRailsSchema>[number];

export const TradeBalancesSchema = z.array(
  z.object({ currency_code: z.string(), available_amount: Numeric, locked_amount: OptionalNumeric }),
);
export type TradeBalance = z.infer<typeof TradeBalancesSchema>[number];

export const TradeTickersSchema = z.array(
  z.object({
    pair: z.string(),
    bid: OptionalNumeric,
    ask: OptionalNumeric,
    last: OptionalNumeric,
    price_change_percent_24h: OptionalNumeric,
    volume: OptionalNumeric,
    date: OptionalString,
  }),
);
export type TradeTicker = z.infer<typeof TradeTickersSchema>[number];

export const TradeStatementSchema = z.object({
  statement: z.array(
    z.object({
      amount: Numeric,
      after_balance: OptionalNumeric,
      currency: z.string(),
      date: z.string(),
      operation: z.string(),
      operation_id: z.string(),
    }),
  ),
  pagination: z.object({ current_page: z.number().nullish(), total_pages: z.number().nullish() }).nullish(),
});
export type TradeStatement = z.infer<typeof TradeStatementSchema>;
export type TradeStatementEntry = TradeStatement['statement'][number];

export const TradeFeesSchema = z.array(z.object({ side: z.string(), maker: Numeric, taker: Numeric }));
export type TradeFee = z.infer<typeof TradeFeesSchema>[number];

export const TradeEstimateSchema = z.object({ price: Numeric });
export type TradePriceEstimate = z.infer<typeof TradeEstimateSchema>;

export const TradeOpenOrdersSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      pair: z.string(),
      side: z.string(),
      type: z.string(),
      status: z.string(),
      price: OptionalNumeric,
      requested_amount: OptionalNumeric,
      executed_amount: OptionalNumeric,
      remaining_amount: OptionalNumeric,
      create_date: z.string(),
    }),
  ),
  nc: OptionalString,
});
export type TradeOpenOrders = z.infer<typeof TradeOpenOrdersSchema>;
export type TradeOpenOrder = TradeOpenOrders['orders'][number];

const WalletNetworkSchema = z.object({
  code: z.string(),
  name: z.string(),
  status_tag: OptionalString,
  /** Minutes in practice; Ripio's docs show strings like "~15 min". */
  deliver_time: OptionalNumeric,
  enabled: z.boolean().nullish(),
  use_memo: z.boolean().nullish(),
});
export type WalletNetwork = z.infer<typeof WalletNetworkSchema>;

export const WalletAddressesSchema = z.array(
  z.object({
    address: z.string(),
    memo_id: Numeric.nullish(),
    version: z.number().nullish(),
    network: WalletNetworkSchema,
  }),
);
export type WalletAddress = z.infer<typeof WalletAddressesSchema>[number];

const NetworkMessageSchema = z.object({
  level: OptionalString,
  title: OptionalString,
  values: z.record(z.string(), z.unknown()).nullish(),
  location: z.array(z.string()).nullish(),
});
export type NetworkMessage = z.infer<typeof NetworkMessageSchema>;

export const WalletCurrencyNetworksSchema = z.array(
  z.object({
    network: WalletNetworkSchema,
    standard: OptionalString,
    network_standard: OptionalString,
    receive: z.boolean().nullish(),
    enabled: z.boolean().nullish(),
    order: z.number().nullish(),
    min_amount: OptionalNumeric,
    max_amount: OptionalNumeric,
    is_partial_disabled_receive: z.boolean().nullish(),
    messages: z.array(NetworkMessageSchema).nullish(),
  }),
);
export type WalletCurrencyNetwork = z.infer<typeof WalletCurrencyNetworksSchema>[number];

export const WalletCurrenciesSchema = z.array(
  z.object({
    ticker: z.string(),
    name: OptionalString,
    type: OptionalString,
    actions: z
      .array(z.object({ transaction_type: z.string(), enabled: z.boolean().nullish(), rails: z.array(z.string()).nullish() }))
      .nullish(),
  }),
);
export type WalletCurrency = z.infer<typeof WalletCurrenciesSchema>[number];

export const WalletDepositAccountsSchema = z.array(
  z.object({
    type: z.string(),
    account_number: z.string(),
    account_label: OptionalString,
    currency: z.string(),
    deposit_constraint: z.object({ same_holder: z.unknown().optional() }).nullish(),
  }),
);
export type WalletDepositAccount = z.infer<typeof WalletDepositAccountsSchema>[number];

/** Validates a Ripio `data` payload. Unknown fields are dropped; missing essentials fail loudly. */
export function parseResponse<S extends z.ZodType>(schema: S, data: unknown, endpoint: string): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new RipioApiError('schema', `Unexpected response from ${endpoint}`, { endpoint, details });
}
