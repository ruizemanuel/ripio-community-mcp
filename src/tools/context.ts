import type { CallToolResult } from '@modelcontextprotocol/server';
import type { RipioClient } from '../ripio/client.js';
import { RipioApiError } from '../ripio/errors.js';
import { fail, type Logger } from './result.js';

export interface ToolContext {
  /** A RipioApiError here means the server has no usable credentials. */
  client: RipioClient | RipioApiError;
  now: () => Date;
  log: Logger;
}

export async function run(
  ctx: ToolContext,
  fn: (client: RipioClient) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  if (ctx.client instanceof RipioApiError) return fail(ctx.client, ctx.log);
  try {
    return await fn(ctx.client);
  } catch (error) {
    return fail(error, ctx.log);
  }
}
