import { describe, expect, it } from 'vitest';
import { signRequest } from '../../src/ripio/signing.js';

describe('signRequest', () => {
  it('matches the vector computed with the algorithm of Ripio’s official example', () => {
    expect(signRequest('test-secret', '1700000000000', 'GET', '/wallet/balance/')).toBe(
      'aKyu807C67du98iMaQ5Aj6NMx1maIOH9XwFWFvnF4u4=',
    );
  });

  it('signs the path exactly as given, path parameters included', () => {
    expect(signRequest('test-secret', '1700000000000', 'GET', '/trade/orders/estimate-price/USDT_ARS')).toBe(
      'SD+Y3TpsX8LYs5K9tpQxElUO0wp/tX5mfZVx282a07Y=',
    );
  });
});
