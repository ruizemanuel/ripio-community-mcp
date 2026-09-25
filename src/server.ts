import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { createRipioClient, type RipioClient } from './ripio/client.js';
import { RipioApiError } from './ripio/errors.js';
import { RipioHttp } from './ripio/http.js';
import type { ToolContext } from './tools/context.js';
import { registerEstimateTrade } from './tools/estimate-trade.js';
import { registerGetDepositAddress } from './tools/get-deposit-address.js';
import { registerGetLimits } from './tools/get-limits.js';
import { registerGetPortfolio } from './tools/get-portfolio.js';
import { registerGetPrices } from './tools/get-prices.js';
import { registerGetTransaction } from './tools/get-transaction.js';
import { registerListActivity } from './tools/list-activity.js';
import { registerListOpenOrders } from './tools/list-open-orders.js';
import { stderrLogger, type Logger } from './tools/result.js';

export const SERVER_NAME = 'ripio-community-mcp';
export const SERVER_VERSION = '0.1.3';

export const INSTRUCTIONS = [
  'Unofficial, community-built, read-only MCP server for Ripio (not affiliated with Ripio).',
  'It cannot move funds, place orders or change the account.',
  'Values are estimates at Ripio app rates; say so when reporting totals.',
  "Ripio's API does not expose card transactions, in-app buys/sells or bill payments; never invent them.",
  'Amounts are decimal strings: quote them as returned instead of recomputing with floating point.',
  'Deposit addresses: only give an address returned by ripio_get_deposit_address, together with its network and memo, ' +
    'copied exactly from the tool result in a code block (never retyped, shortened, or reused for another network or ' +
    'for Ripio Trade), and always relay its warnings.',
].join(' ');

export interface ServerDeps {
  client?: RipioClient;
  now?: () => Date;
  log?: Logger;
}

export function createServer(config: Config | RipioApiError, deps: ServerDeps = {}): McpServer {
  const log = deps.log ?? stderrLogger;
  const client =
    deps.client ??
    (config instanceof RipioApiError
      ? config
      : createRipioClient(
          new RipioHttp({ apiKey: config.apiKey, apiSecret: config.apiSecret, tradeRps: config.tradeRps }),
        ));
  const ctx: ToolContext = { client, now: deps.now ?? (() => new Date()), log };
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  registerGetPortfolio(server, ctx);
  registerListActivity(server, ctx);
  registerGetTransaction(server, ctx);
  registerGetPrices(server, ctx);
  registerEstimateTrade(server, ctx);
  registerGetLimits(server, ctx);
  registerListOpenOrders(server, ctx);
  registerGetDepositAddress(server, ctx);
  return server;
}
