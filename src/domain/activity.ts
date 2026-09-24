import * as z from 'zod/v4';
import type { TradeStatementEntry, WalletTransaction } from '../ripio/schemas.js';
import { toIsoDate } from './dates.js';
import { abs, isNegative, isZero, toDecimal } from './money.js';

export const ActivityItemSchema = z.object({
  id: z.string(),
  date: z.string(),
  type: z.string(),
  direction: z.enum(['in', 'out', 'internal']),
  asset: z.string(),
  amount: z.string(),
  fee: z.string().optional(),
  fee_asset: z.string().optional(),
  rail: z.string().optional(),
  status: z.string(),
  counterparty: z.string().optional(),
  description: z.string().optional(),
});

export const TransactionDetailSchema = ActivityItemSchema.extend({
  raw_status: z.string(),
  transaction_hash: z.string().optional(),
});

export const ActivityPageSchema = z.object({
  source: z.enum(['wallet', 'trade']),
  items: z.array(ActivityItemSchema),
  next_cursor: z.string().optional(),
  coverage_notes: z.array(z.string()),
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>;
export type ActivityPage = z.infer<typeof ActivityPageSchema>;

export const WALLET_COVERAGE_NOTE =
  "Since 2026-07-21 Ripio's API excludes card transactions, in-app buys/sells and bill payments from this feed.";
export const TRADE_COVERAGE_NOTE = 'Ripio Trade returns the last 6 months unless `from` is set.';
export const PAGE_DATE_FILTER_NOTE =
  'Date filters are applied to this page only; follow next_cursor for older movements.';

const STATUS_NAMES: Record<string, string> = { COM: 'completed', PEN: 'pending', CAN: 'cancelled', REJ: 'rejected' };

function statusName(raw: string): string {
  return STATUS_NAMES[raw.toUpperCase()] ?? raw.toLowerCase();
}

export function normalizeWalletTransaction(tx: WalletTransaction): ActivityItem {
  const type = tx.transaction_type.toLowerCase();
  const incoming = type === 'deposit';
  const direction: ActivityItem['direction'] = incoming ? 'in' : type === 'withdrawal' ? 'out' : 'internal';
  const currency = (incoming ? tx.to_currency : tx.from_currency) ?? tx.to_currency ?? tx.from_currency ?? 'UNKNOWN';
  const amount = toDecimal(incoming ? tx.amount_to : tx.amount_from) ?? toDecimal(tx.amount_to) ?? '0';
  const item: ActivityItem = {
    id: String(tx.id),
    date: toIsoDate(tx.created_at),
    type,
    direction,
    asset: currency.toUpperCase(),
    amount,
    status: statusName(tx.status),
  };
  const fee = toDecimal(tx.fee);
  if (fee !== undefined && !isZero(fee)) {
    item.fee = fee;
    if (tx.fee_currency) item.fee_asset = tx.fee_currency.toUpperCase();
  }
  if (tx.rail) item.rail = tx.rail;
  const counterparty = incoming ? tx.origin : tx.destination;
  if (counterparty) item.counterparty = counterparty;
  if (type === 'swap' && tx.from_currency && tx.to_currency) {
    const from = toDecimal(tx.amount_from) ?? '?';
    const to = toDecimal(tx.amount_to) ?? '?';
    item.description = `Swap ${from} ${tx.from_currency.toUpperCase()} → ${to} ${tx.to_currency.toUpperCase()}`;
  }
  return item;
}

export function walletTransactionDetail(tx: WalletTransaction): TransactionDetail {
  const detail: TransactionDetail = { ...normalizeWalletTransaction(tx), raw_status: tx.status };
  if (tx.transaction_hash) detail.transaction_hash = tx.transaction_hash;
  return detail;
}

export function normalizeTradeStatementEntry(entry: TradeStatementEntry): ActivityItem {
  const signed = toDecimal(entry.amount) ?? '0';
  const operation = entry.operation.toLowerCase();
  const type =
    operation.includes('tax') || operation.includes('fee')
      ? 'fee'
      : operation.includes('deposit')
        ? 'deposit'
        : operation.includes('withdraw')
          ? 'withdrawal'
          : operation.includes('buy') || operation.includes('sell')
            ? 'trade'
            : 'other';
  return {
    id: entry.operation_id,
    date: toIsoDate(entry.date),
    type,
    direction: isNegative(signed) ? 'out' : 'in',
    asset: entry.currency.toUpperCase(),
    amount: abs(signed),
    status: 'completed',
    description: entry.operation,
  };
}
