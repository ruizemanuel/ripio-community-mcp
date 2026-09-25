// Records anonymized real responses with a READ-ONLY key from .env.live. Review every file before committing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { RipioApiError } from '../src/ripio/errors.js';
import { RipioHttp, type GetOptions } from '../src/ripio/http.js';
import { anonymize } from './anonymize.js';

const config = loadConfig(process.env);
if (config instanceof RipioApiError) {
  console.error(config.message);
  process.exit(1);
}

const http = new RipioHttp({ apiKey: config.apiKey, apiSecret: config.apiSecret, tradeRps: config.tradeRps });
const targets: Array<[name: string, path: string, options?: GetOptions]> = [
  ['wallet-balance', '/wallet/balance/'],
  ['wallet-rates', '/wallet/rates/'],
  ['wallet-transactions', '/wallet/transactions/'],
  ['wallet-limits', '/wallet/transactions/limits/'],
  ['wallet-rails', '/wallet/transactions/rails/'],
  ['trade-balances', '/trade/user/balances'],
  ['trade-tickers', '/trade/public/tickers', { signed: false }],
  ['trade-statement', '/trade/user/statement', { query: { page_size: 20 } }],
  ['trade-fees', '/trade/user/trading-fees', { query: { pair: 'USDT_ARS' } }],
  ['trade-open-orders', '/trade/orders/open'],
  ['trade-estimate-usdt-ars', '/trade/orders/estimate-price/USDT_ARS', { query: { amount: 1, side: 'buy' } }],
  ['wallet-addresses', '/wallet/addresses/'],
  ['wallet-currency-networks-usdt', '/wallet/network/currency-networks/USDT/'],
  ['wallet-currency-networks-usdc', '/wallet/network/currency-networks/USDC/'],
  ['wallet-currencies', '/wallet/currencies/'],
  ['wallet-deposit-accounts', '/wallet/banking/deposit-accounts/'],
];

// `npm run record-fixtures -- wallet-addresses …` records only the named targets and leaves the other files alone.
const only = new Set(process.argv.slice(2));
const unknown = [...only].filter((name) => !targets.some(([target]) => target === name));
if (unknown.length > 0) {
  console.error(`unknown targets: ${unknown.join(', ')}`);
  process.exit(1);
}
const selected = only.size === 0 ? targets : targets.filter(([name]) => only.has(name));

const outDir = 'test/fixtures/recorded';
mkdirSync(outDir, { recursive: true });
for (const [name, path, options] of selected) {
  try {
    const data = await http.get(path, options);
    writeFileSync(`${outDir}/${name}.json`, `${JSON.stringify(anonymize(data), null, 2)}\n`);
    console.error(`recorded ${name}`);
  } catch (error) {
    console.error(`failed ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
