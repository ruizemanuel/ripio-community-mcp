import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';

describe('stdio entrypoint', () => {
  it('serves all tools over stdio and reports missing credentials instead of crashing', async () => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('RIPIO_')) env[key] = value;
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/index.ts'],
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'e2e', version: '0.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(8);
      const result = await client.callTool({ name: 'ripio_get_portfolio', arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('RIPIO_API_KEY and RIPIO_API_SECRET not set');
    } finally {
      await client.close();
    }
  }, 30_000);
});
