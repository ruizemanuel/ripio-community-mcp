import * as z from 'zod/v4';
import type { WalletDepositAccount } from '../ripio/schemas.js';

export const DepositAccountsSchema = z.object({
  accounts: z.array(
    z.object({
      type: z.string(),
      currency: z.string(),
      account_number: z.string(),
      alias: z.string().optional(),
      same_holder_required: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type DepositAccounts = z.infer<typeof DepositAccountsSchema>;

const SAME_HOLDER = "Deposits must come from an account in the account holder's name; otherwise they can be lost or blocked.";

/** Ripio's own accounts for fiat deposits, copied exactly. The holder's document number (Brazil) is never returned. */
export function buildDepositAccounts(accounts: WalletDepositAccount[]): DepositAccounts {
  const warnings = new Set<string>();
  const out = accounts.map((account) => {
    const label = account.account_label ?? '';
    const sameHolder = (account.deposit_constraint?.same_holder ?? null) !== null;
    warnings.add(
      `Deposit only ${account.currency} by bank transfer to this ${account.type.toUpperCase()}. For crypto use ripio_get_deposit_address.`,
    );
    if (sameHolder) warnings.add(SAME_HOLDER);
    return {
      type: account.type,
      currency: account.currency,
      account_number: account.account_number,
      alias: label.trim() === '' ? undefined : label,
      same_holder_required: sameHolder,
    };
  });
  return { accounts: out, warnings: [...warnings] };
}

export function summarizeDepositAccounts(result: DepositAccounts): string {
  if (result.accounts.length === 0) return 'Ripio returned no deposit accounts for this user.';
  return result.accounts
    .map((a) => `${a.type.toUpperCase()} (${a.currency}): ${a.account_number}${a.alias === undefined ? '' : `, alias ${a.alias}`}`)
    .join('\n');
}
