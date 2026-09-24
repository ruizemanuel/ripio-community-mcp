import { describe, expect, it } from 'vitest';
import { anonymize } from '../../scripts/anonymize.js';

const half = () => 0.5;

describe('anonymize', () => {
  it('keeps only the magnitude of an amount: different amounts of the same size look identical', () => {
    expect(anonymize({ amount: '12345.60' }, half)).toEqual({ amount: '55000.00' });
    expect(anonymize({ amount: '98765.43' }, half)).toEqual({ amount: '55000.00' });
  });

  it('keeps sign, decimals and zero, for strings and numbers', () => {
    const out = anonymize(
      { available_amount: 3e-7, after_balance: -0.5, locked_amount: '0.00', fee: 1, total: '7' },
      half,
    ) as Record<string, unknown>;
    expect(out).toEqual({ available_amount: 6e-7, after_balance: -0.6, locked_amount: '0.00', fee: 6, total: '6' });
  });

  it('redacts every field it does not know to be safe, keeping ids numeric', () => {
    const out = anonymize(
      {
        id: 1234567,
        external_id: 'EXAMPLE-WALLET_TXN_0000001',
        nc: 'opaque-cursor',
        destination: '0000003100012345678901',
        extra_data: {
          bank_name: 'Banco X',
          username: 'someone',
          description: 'rent',
          phone: '+54 11 5555 5555',
          document_number: 12345678,
        },
      },
      half,
    ) as { id: number; external_id: string; nc: string; destination: string; extra_data: Record<string, unknown> };
    expect(typeof out.id).toBe('number');
    expect(out.id).not.toBe(1234567);
    const { document_number, ...texts } = out.extra_data;
    for (const value of [out.external_id, out.nc, out.destination, ...Object.values(texts)]) {
      expect(value).toMatch(/^redacted-\d+$/);
    }
    expect(document_number).not.toBe(12345678);
  });

  it('keeps public market data, enums, flags and dates', () => {
    const input = {
      ticker: 'BTC_ARS',
      buy_rate: '98000000',
      sell_rate: '97000000',
      pair: 'USDT_ARS',
      bid: 1599.5,
      transaction_type: 'withdrawal',
      status: 'COM',
      currency: 'ARS',
      rail: 'bank',
      enabled: true,
      created_at: '2025-06-18T14:20:10.123456+00:00',
      taker: 0.3,
    };
    expect(anonymize(input, half)).toEqual(input);
  });
});
