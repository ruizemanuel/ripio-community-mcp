import * as z from 'zod/v4';
import type { TradeStatementEntry, WalletTransaction } from '../ripio/schemas.js';
import { toIsoDate } from './dates.js';
import { abs, isNegative, isZero, toDecimal, type Decimal } from './money.js';

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
  /** Fields Ripio sent missing or unreadable; they show as "0" (amount) or "UNKNOWN" (asset). */
  unreadable: z.array(z.enum(['amount', 'asset'])).optional(),
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
export const TRADE_COVERAGE_NOTE =
  'Ripio Trade returns the last 6 months by default and only accepts ranges of up to 182 days: set both from and to for older activity.';
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
  const [asset, otherAsset] = (incoming ? [tx.to_currency, tx.from_currency] : [tx.from_currency, tx.to_currency]).map((c) => {
    const trimmed = c?.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  });
  // Borrow amount_to (a withdrawal's net amount) only when both sides carry the same asset: a swap's sides differ.
  const sameAsset = asset !== undefined && asset === otherAsset;
  const amount = toDecimal(incoming ? tx.amount_to : tx.amount_from) ?? (sameAsset ? toDecimal(tx.amount_to) : undefined);
  const item: ActivityItem = {
    id: String(tx.id),
    date: toIsoDate(tx.created_at),
    type,
    direction,
    asset: asset ?? 'UNKNOWN',
    amount: amount ?? '0',
    status: statusName(tx.status),
  };
  const unreadable = [...(amount === undefined ? ['amount' as const] : []), ...(asset === undefined ? ['asset' as const] : [])];
  if (unreadable.length > 0) item.unreadable = unreadable;
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

/** Without a readable amount there is no sign to read, so only the entry's type can tell its direction. */
function tradeDirection(type: string, amount: Decimal | undefined): ActivityItem['direction'] {
  if (amount !== undefined) return isNegative(amount) ? 'out' : 'in';
  if (type === 'deposit') return 'in';
  if (type === 'withdrawal' || type === 'fee') return 'out';
  return 'internal';
}

export function normalizeTradeStatementEntry(entry: TradeStatementEntry): ActivityItem {
  const readable = toDecimal(entry.amount);
  const asset = entry.currency.trim().toUpperCase();
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
  const item: ActivityItem = {
    id: entry.operation_id,
    date: toIsoDate(entry.date),
    type,
    direction: tradeDirection(type, readable),
    asset: asset === '' ? 'UNKNOWN' : asset,
    amount: abs(readable ?? '0'),
    status: 'completed',
    description: entry.operation,
  };
  const unreadable = [...(readable === undefined ? ['amount' as const] : []), ...(asset === '' ? ['asset' as const] : [])];
  if (unreadable.length > 0) item.unreadable = unreadable;
  return item;
}

export const UNREADABLE_NOTE =
  'Some movements came from Ripio with a missing or unreadable amount or asset: they show "0" or "UNKNOWN" and are flagged in "unreadable".';

export function unreadableNotes(items: ActivityItem[]): string[] {
  return items.some((item) => item.unreadable !== undefined) ? [UNREADABLE_NOTE] : [];
}
