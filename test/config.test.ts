import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { RipioApiError } from '../src/ripio/errors.js';

describe('loadConfig', () => {
  it('reads and trims the credentials', () => {
    expect(loadConfig({ RIPIO_API_KEY: ' key ', RIPIO_API_SECRET: 'secret\n' })).toEqual({
      apiKey: 'key',
      apiSecret: 'secret',
      tradeRps: 1,
    });
  });

  it('reports every missing credential', () => {
    const result = loadConfig({});
    expect(result).toBeInstanceOf(RipioApiError);
    expect(result).toMatchObject({ kind: 'config', message: 'RIPIO_API_KEY and RIPIO_API_SECRET not set. See README → Setup.' });
  });

  it.each([[''], ['   '], ['${user_config.api_key}']])('treats %j as missing', (value) => {
    expect(loadConfig({ RIPIO_API_KEY: value, RIPIO_API_SECRET: 's' })).toMatchObject({
      kind: 'config',
      message: 'RIPIO_API_KEY not set. See README → Setup.',
    });
  });

  it('accepts a sane RIPIO_TRADE_RPS and falls back to 1 otherwise', () => {
    const base = { RIPIO_API_KEY: 'k', RIPIO_API_SECRET: 's' };
    expect(loadConfig({ ...base, RIPIO_TRADE_RPS: '3.5' })).toMatchObject({ tradeRps: 3.5 });
    for (const value of ['', 'abc', '50', '0', '${user_config.trade_rps}']) {
      expect(loadConfig({ ...base, RIPIO_TRADE_RPS: value })).toMatchObject({ tradeRps: 1 });
    }
  });
});
