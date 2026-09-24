import { describe, expect, it } from 'vitest';
import { buildLimits, LIMITS_NOTE } from '../../src/domain/limits.js';
import { walletLimits, walletRails } from '../fixtures/synthetic.js';

describe('buildLimits', () => {
  it('flattens limits per rail, naming the account-wide limit and omitting unlimited periods', () => {
    const output = buildLimits(walletLimits, walletRails);
    expect(output.limits).toEqual([
      {
        rail: 'account',
        type: 'withdrawal',
        currency: 'ARS',
        min: undefined,
        max: undefined,
        caps: { daily: '900000000', monthly: '900000000', annual: '900000000' },
        remaining: { daily: '900000000', monthly: '900000000', annual: '900000000' },
      },
      {
        rail: 'ripio',
        type: 'swap',
        currency: 'USDT',
        min: '1',
        max: undefined,
        caps: { daily: '50000', monthly: '900000', annual: '900000', daily_count: '50' },
        remaining: { daily: '49000', monthly: '899000', annual: '899000', daily_count: '49' },
      },
    ]);
    expect(output.note).toBe(LIMITS_NOTE);
  });

  it('reports rail availability and only numeric fees', () => {
    expect(buildLimits([], walletRails).rails).toEqual([
      { rail: 'bank', name: 'Bank', types: [{ type: 'withdrawal', available: true, fee: '0', fixed_fee: '0' }] },
      { rail: 'crypto', name: 'Crypto', types: [{ type: 'withdrawal', available: false, fee: undefined, fixed_fee: undefined }] },
    ]);
  });
});
