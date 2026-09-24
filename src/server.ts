import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { createRipioClient, type RipioClient } from './ripio/client.js';
import { RipioApiError } from './ripio/errors.js';
import { RipioHttp } from './ripio/http.js';
import type { ToolContext } from './tools/context.js';
import { registerGetPortfolio } from './tools/get-portfolio.js';
import { stderrLogger, type Logger } from './tools/result.js';

export const SERVER_NAME = 'ripio-community-mcp';
export const SERVER_VERSION = '0.1.0';

export const INSTRUCTIONS = [
  'Unofficial, community-built, read-only MCP server for Ripio (not affiliated with Ripio).',
  'It cannot move funds, place orders or change the account.',
  'Values are estimates at Ripio app rates; say so when reporting totals.',
  "Ripio's API does not expose card transactions, in-app buys/sells or bill payments; never invent them.",
  'Amounts are decimal strings: quote them as returned instead of recomputing with floating point.',
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
  return server;
}
