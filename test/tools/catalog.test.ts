import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../../src/server.js';
import { connectTools, fakeClient } from '../helpers/harness.js';

describe('tool catalog', () => {
  it('exposes exactly these read-only, documented tools with structured output', async () => {
    const harness = await connectTools(fakeClient({}));
    try {
      const { tools } = await harness.mcp.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'ripio_estimate_trade',
        'ripio_get_deposit_address',
        'ripio_get_limits',
        'ripio_get_portfolio',
        'ripio_get_prices',
        'ripio_get_transaction',
        'ripio_list_activity',
        'ripio_list_open_orders',
        'ripio_verify_deposit_address',
      ]);
      for (const tool of tools) {
        expect(tool.annotations, tool.name).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        });
        expect(tool.title, tool.name).toBeTruthy();
        expect(tool.description?.length ?? 0, tool.name).toBeGreaterThanOrEqual(60);
        expect(tool.outputSchema?.type, tool.name).toBe('object');
      }
    } finally {
      await harness.close();
    }
  });

  it('tells the model how to hand out deposit addresses', () => {
    expect(INSTRUCTIONS).toContain('only give an address returned by ripio_get_deposit_address');
    expect(INSTRUCTIONS).toContain('copied exactly from the tool result in a code block');
    expect(INSTRUCTIONS).toContain('offer to check the address they will actually use with ripio_verify_deposit_address');
  });
});
