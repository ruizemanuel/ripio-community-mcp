import { RipioApiError } from './ripio/errors.js';

export interface Config {
  apiKey: string;
  apiSecret: string;
  tradeRps: number;
}

/** Empty values and unsubstituted Claude Desktop placeholders (`${user_config.x}`) count as missing. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('${')) return undefined;
  return trimmed;
}

export function loadConfig(env: Record<string, string | undefined>): Config | RipioApiError {
  const apiKey = clean(env.RIPIO_API_KEY);
  const apiSecret = clean(env.RIPIO_API_SECRET);
  if (apiKey === undefined || apiSecret === undefined) {
    const missing = [apiKey === undefined ? 'RIPIO_API_KEY' : '', apiSecret === undefined ? 'RIPIO_API_SECRET' : '']
      .filter((name) => name !== '')
      .join(' and ');
    return new RipioApiError('config', `${missing} not set. See README → Setup.`);
  }
  const rps = Number(clean(env.RIPIO_TRADE_RPS));
  const tradeRps = Number.isFinite(rps) && rps >= 0.2 && rps <= 10 ? rps : 1;
  return { apiKey, apiSecret, tradeRps };
}
