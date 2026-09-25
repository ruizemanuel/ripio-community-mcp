import { describe, expect, it } from 'vitest';
import {
  normalizeTradeStatementEntry,
  normalizeWalletTransaction,
  walletTransactionDetail,
} from '../../src/domain/activity.js';
import { tradeStatement, walletDeposit, walletSwap, walletWithdrawal } from '../fixtures/synthetic.js';

describe('normalizeWalletTransaction', () => {
  it('normalizes a bank deposit and hides a zero fee', () => {
    expect(normalizeWalletTransaction(walletDeposit)).toEqual({
      id: '1001',
      date: '2025-06-18T14:20:10.123Z',
      type: 'deposit',
      direction: 'in',
      asset: 'ARS',
      amount: '1000',
      rail: 'bank',
      status: 'completed',
      counterparty: 'CVU ending 4321',
    });
  });

  it('normalizes a crypto withdrawal with its fee and destination', () => {
    expect(normalizeWalletTransaction(walletWithdrawal)).toEqual({
      id: '1002',
      date: '2025-06-04T11:05:30.654Z',
      type: 'withdrawal',
      direction: 'out',
      asset: 'USDT',
      amount: '25.5',
      fee: '1',
      fee_asset: 'USDT',
      rail: 'crypto',
      status: 'pending',
      counterparty: 'TXyz-example-address',
    });
  });

  it('describes swaps and passes unknown statuses through', () => {
    expect(normalizeWalletTransaction(walletSwap)).toEqual({
      id: '1003',
      date: '2025-03-10T09:45:15.987Z',
      type: 'swap',
      direction: 'internal',
      asset: 'USDT',
      amount: '100',
      status: 'xyz',
      description: 'Swap 100 USDT → 0.001 BTC',
    });
  });

  it('adds the raw status and hash in the detail view', () => {
    expect(walletTransactionDetail(walletWithdrawal)).toMatchObject({ raw_status: 'PEN', transaction_hash: '0xabc123' });
    expect(walletTransactionDetail(walletDeposit)).not.toHaveProperty('transaction_hash');
  });

  it('flags a movement whose amount or currency Ripio sent missing or unreadable', () => {
    const noAmount = normalizeWalletTransaction({ ...walletDeposit, amount_to: 'N/A', amount_from: null });
    expect(noAmount).toMatchObject({ amount: '0', asset: 'ARS', unreadable: ['amount'] });
    const noAsset = normalizeWalletTransaction({ ...walletDeposit, to_currency: null, from_currency: ' ' });
    expect(noAsset).toMatchObject({ asset: 'UNKNOWN', unreadable: ['asset'] });
    expect(normalizeWalletTransaction(walletDeposit)).not.toHaveProperty('unreadable');
  });
});

describe('normalizeTradeStatementEntry', () => {
  it('uses the sign for direction and classifies taxes before buys and sells', () => {
    const [sell, proceeds, tax] = tradeStatement.statement.map(normalizeTradeStatementEntry);
    expect(sell).toEqual({
      id: 'op-1',
      date: '2022-03-14T09:21:37.418Z',
      type: 'trade',
      direction: 'out',
      asset: 'BTC',
      amount: '0.5',
      status: 'completed',
      description: 'Sell',
    });
    expect(proceeds).toMatchObject({ direction: 'in', asset: 'ARS', amount: '30000', type: 'trade' });
    expect(tax).toMatchObject({ type: 'fee', direction: 'out', amount: '0.001' });
  });

  it('maps deposits, withdrawals and unknown operations', () => {
    const base = { after_balance: 0, currency: 'ARS', date: '2022-03-14 09:21:37', operation_id: 'x' };
    expect(normalizeTradeStatementEntry({ ...base, amount: 10, operation: 'Deposit' }).type).toBe('deposit');
    expect(normalizeTradeStatementEntry({ ...base, amount: -10, operation: 'Withdrawal' }).type).toBe('withdrawal');
    expect(normalizeTradeStatementEntry({ ...base, amount: 1, operation: 'Something new' }).type).toBe('other');
  });

  it('flags an entry whose amount Ripio sent unreadable', () => {
    const [sell] = tradeStatement.statement;
    if (sell === undefined) throw new Error('fixture');
    expect(normalizeTradeStatementEntry({ ...sell, amount: 'N/A' })).toMatchObject({ amount: '0', unreadable: ['amount'] });
    expect(normalizeTradeStatementEntry(sell)).not.toHaveProperty('unreadable');
  });
});
