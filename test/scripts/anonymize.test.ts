import { describe, expect, it } from 'vitest';
import { anonymize } from '../../scripts/anonymize.js';

describe('anonymize', () => {
  it('redacts identifiers and personal fields, scales account amounts and keeps public data', () => {
    const input = {
      results: [
        {
          id: 1234567,
          external_id: 'EXAMPLE-WALLET_TXN_0000001',
          transaction_type: 'withdrawal',
          amount_from: '12345.60',
          destination: '0000003100012345678901',
          created_at: '2025-06-18T14:20:10.123456+00:00',
          extra_data: { bank_name: 'Banco X', bank_account: '123', provider_reference: 'abc' },
        },
      ],
      nc: 'opaque-cursor',
      ticker: 'BTC_ARS',
      buy_rate: '98000000',
      available_amount: 3e-7,
    };
    const out = anonymize(input) as typeof input;
    const [tx] = out.results;
    expect(typeof tx?.id).toBe('number');
    expect(tx?.id).not.toBe(1234567);
    expect(tx?.external_id).toMatch(/^redacted-\d+$/);
    expect(tx?.destination).toMatch(/^redacted-\d+$/);
    expect(tx?.extra_data.bank_name).toMatch(/^redacted-\d+$/);
    expect(tx?.extra_data.bank_account).toMatch(/^redacted-\d+$/);
    expect(tx?.extra_data.provider_reference).toMatch(/^redacted-\d+$/);
    expect(tx?.amount_from).toBe('4567.87200000');
    expect(tx?.transaction_type).toBe('withdrawal');
    expect(tx?.created_at).toBe('2025-06-18T14:20:10.123456+00:00');
    expect(out.nc).toMatch(/^redacted-\d+$/);
    expect(out.ticker).toBe('BTC_ARS');
    expect(out.buy_rate).toBe('98000000');
    expect(out.available_amount).toBe(1.1e-7);
  });
});
