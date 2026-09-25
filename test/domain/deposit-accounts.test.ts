import { describe, expect, it } from 'vitest';
import { buildDepositAccounts, DepositAccountsSchema, summarizeDepositAccounts } from '../../src/domain/deposit-accounts.js';
import { cvuAccount } from '../fixtures/deposits.js';

describe('buildDepositAccounts', () => {
  it('returns the CVU and alias exactly, with the transfer rule', () => {
    const result = buildDepositAccounts([cvuAccount]);
    expect(result).toEqual({
      accounts: [
        { type: 'cvu', currency: 'ARS', account_number: 'CVU-SYNTHETIC-0001', alias: 'synthetic.alias.ripio', same_holder_required: false },
      ],
      warnings: ['Deposit only ARS by bank transfer to this CVU. For crypto use ripio_get_deposit_address.'],
    });
    expect(DepositAccountsSchema.safeParse(result).success).toBe(true);
  });

  it("flags the same-holder rule without returning the holder's document number", () => {
    const pix = {
      type: 'pix',
      account_number: 'PIX-SYNTHETIC',
      account_label: 'Pix key',
      currency: 'BRL',
      deposit_constraint: { same_holder: '000.000.000-00' },
    };
    const result = buildDepositAccounts([pix]);
    expect(result.accounts[0]?.same_holder_required).toBe(true);
    expect(result.warnings).toContain("Deposits must come from an account in the account holder's name; otherwise they can be lost or blocked.");
    expect(JSON.stringify(result)).not.toContain('000.000.000-00');
  });

  it('passes unknown account types through and skips a blank alias', () => {
    const result = buildDepositAccounts([{ ...cvuAccount, type: 'wire', account_label: '  ' }]);
    expect(result.accounts[0]).toEqual({ type: 'wire', currency: 'ARS', account_number: 'CVU-SYNTHETIC-0001', same_holder_required: false });
  });
});

describe('summarizeDepositAccounts', () => {
  it('puts one account per line', () => {
    expect(summarizeDepositAccounts(buildDepositAccounts([cvuAccount]))).toBe('CVU (ARS): CVU-SYNTHETIC-0001, alias synthetic.alias.ripio');
  });

  it('says when Ripio returns none', () => {
    expect(summarizeDepositAccounts(buildDepositAccounts([]))).toBe('Ripio returned no deposit accounts for this user.');
  });
});
