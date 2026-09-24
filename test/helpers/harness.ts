import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { RipioClient } from '../../src/ripio/client.js';
import { RipioApiError } from '../../src/ripio/errors.js';
import { createServer } from '../../src/server.js';

/** A RipioClient whose un-stubbed methods reject, so tests notice unexpected calls. */
export function fakeClient(overrides: Partial<RipioClient>): RipioClient {
  return new Proxy(overrides as RipioClient, {
    get(target, prop) {
      if (prop in target) return target[prop as keyof RipioClient];
      return () => Promise.reject(new Error(`fake client: ${String(prop)} was not stubbed`));
    },
  });
}

export const FIXED_NOW = new Date('2026-09-24T12:00:00.000Z');

export interface Harness {
  mcp: Client;
  logs: string[];
  close(): Promise<void>;
}

export async function connectTools(client: RipioClient | RipioApiError): Promise<Harness> {
  const logs: string[] = [];
  const server =
    client instanceof RipioApiError
      ? createServer(client, { now: () => FIXED_NOW, log: (m) => logs.push(m) })
      : createServer({ apiKey: 'k', apiSecret: 's', tradeRps: 1 }, { client, now: () => FIXED_NOW, log: (m) => logs.push(m) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await mcp.connect(clientTransport);
  return {
    mcp,
    logs,
    close: async () => {
      await mcp.close();
      await server.close();
    },
  };
}
