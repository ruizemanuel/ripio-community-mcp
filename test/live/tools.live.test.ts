import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { createServer } from '../../src/server.js';

const config = loadConfig(process.env);
const enabled = process.env.RIPIO_LIVE === '1' && !(config instanceof RipioApiError);

describe.skipIf(!enabled)('live: every tool against a real account (read-only key)', () => {
  let mcp: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer(config);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    mcp = new Client({ name: 'live', version: '0.0.0' });
    await mcp.connect(clientTransport);
    close = async () => {
      await mcp.close();
      await server.close();
    };
  });

  afterAll(async () => {
    await close();
  });

  async function call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const result = await mcp.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
    return result.structuredContent as Record<string, unknown>;
  }

  it('ripio_get_portfolio', async () => {
    await call('ripio_get_portfolio');
  });

  it('ripio_list_activity (wallet) and ripio_get_transaction', async () => {
    const page = await call('ripio_list_activity');
    const [first] = page.items as Array<{ id: string }>;
    if (first) await call('ripio_get_transaction', { id: Number(first.id) });
  });

  it('ripio_list_activity (trade)', async () => {
    await call('ripio_list_activity', { source: 'trade' });
  });

  it('ripio_get_prices', async () => {
    await call('ripio_get_prices', { assets: ['USDT', 'BTC'] });
  });

  it('ripio_estimate_trade', async () => {
    await call('ripio_estimate_trade', { pair: 'USDT_ARS', side: 'buy', amount: '1' });
  });

  it('ripio_get_limits', async () => {
    await call('ripio_get_limits');
  });

  it('ripio_list_open_orders', async () => {
    await call('ripio_list_open_orders');
  });
});
