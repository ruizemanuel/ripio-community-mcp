import * as z from 'zod/v4';
import type { LimitValues, WalletLimit, WalletRail } from '../ripio/schemas.js';
import { toDecimal } from './money.js';

const PeriodsSchema = z.object({
  daily: z.string().optional(),
  monthly: z.string().optional(),
  annual: z.string().optional(),
  daily_count: z.string().optional(),
  monthly_count: z.string().optional(),
  annual_count: z.string().optional(),
});
type Periods = z.infer<typeof PeriodsSchema>;

export const LimitsOutputSchema = z.object({
  limits: z.array(
    z.object({
      rail: z.string(),
      type: z.string(),
      currency: z.string(),
      min: z.string().optional(),
      max: z.string().optional(),
      caps: PeriodsSchema,
      remaining: PeriodsSchema,
    }),
  ),
  rails: z.array(
    z.object({
      rail: z.string(),
      name: z.string().optional(),
      types: z.array(
        z.object({
          type: z.string(),
          available: z.boolean(),
          fee: z.string().optional(),
          fixed_fee: z.string().optional(),
        }),
      ),
    }),
  ),
  note: z.string(),
});
export type LimitsOutput = z.infer<typeof LimitsOutputSchema>;

export const LIMITS_NOTE = 'A missing period means Ripio sets no limit for it. rail "account" is the account-wide limit.';

function periods(values: LimitValues | null | undefined): Periods {
  const out: Periods = {};
  const set = (key: keyof Periods, raw: number | string | null | undefined): void => {
    const value = toDecimal(raw);
    if (value !== undefined) out[key] = value;
  };
  set('daily', values?.daily_amount);
  set('monthly', values?.monthly_amount);
  set('annual', values?.annual_amount);
  set('daily_count', values?.daily_qty);
  set('monthly_count', values?.monthly_qty);
  set('annual_count', values?.annual_qty);
  return out;
}

function feeValue(raw: unknown): string | undefined {
  return typeof raw === 'number' || typeof raw === 'string' ? toDecimal(raw) : undefined;
}

export function buildLimits(limits: WalletLimit[], rails: WalletRail[]): LimitsOutput {
  return {
    limits: limits.flatMap((group) =>
      group.transaction_types.map((entry) => ({
        rail: group.rail ?? 'account',
        type: entry.transaction_type,
        currency: entry.currency,
        min: toDecimal(entry.limits?.min_amount),
        max: toDecimal(entry.limits?.max_amount),
        caps: periods(entry.limits),
        remaining: periods(entry.remaining),
      })),
    ),
    rails: rails.map((rail) => ({
      rail: rail.rail,
      name: rail.name ?? undefined,
      types: rail.transaction_types.map((entry) => ({
        type: entry.transaction_type,
        available: (entry.enabled ?? true) && (entry.account_enabled ?? true) && !(entry.blocked ?? false),
        fee: feeValue(entry.fee),
        fixed_fee: feeValue(entry.fixed_fee),
      })),
    })),
    note: LIMITS_NOTE,
  };
}
