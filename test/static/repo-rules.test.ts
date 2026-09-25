import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../../src/server.js';

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const sources = listFiles('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('repository rules', () => {
  it('only ever issues GET requests', () => {
    for (const { path, text } of sources) {
      expect(text, path).not.toMatch(/['"`](POST|PUT|PATCH|DELETE)['"`]/);
      // HTTP verbs are uppercase; lowercase values (e.g. valuation.method) are not requests.
      expect(text, path).not.toMatch(/method:\s*['"`](?!GET['"`])[A-Z]+['"`]/);
    }
  });

  it('talks to a single hard-coded API host', () => {
    const hosts = new Set(
      sources.flatMap(({ text }) => [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => (match[1] ?? '').toLowerCase())),
    );
    expect([...hosts].sort()).toEqual(['api.ripio.com', 'github.com']);
  });

  it('keeps the version in sync across package.json, manifest.json and the server', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
    expect(manifest.version).toBe(pkg.version);
  });

  it('describes the same npm package, name and version to the MCP Registry', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string; version: string; mcpName?: string };
    const server = JSON.parse(readFileSync('server.json', 'utf8')) as {
      name: string;
      version: string;
      description: string;
      packages: Array<{ registryType: string; identifier: string; version: string; transport: { type: string } }>;
    };
    expect(pkg.mcpName).toBe('io.github.ruizemanuel/ripio-community-mcp');
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.packages).toEqual([
      expect.objectContaining({
        registryType: 'npm',
        identifier: pkg.name,
        version: pkg.version,
        transport: { type: 'stdio' },
      }),
    ]);
  });

  it('keeps English text free of Ripio’s Spanish UI labels (README.es.md is the Spanish guide)', () => {
    const spanish = /Perfil|Configuración|Solo lectura|Nueva clave|IPs específicas|Sin restricción|Extracto|Consultar/;
    const english = [...sources, ...['README.md', 'manifest.json'].map((path) => ({ path, text: readFileSync(path, 'utf8') }))];
    for (const { path, text } of english) {
      expect(text, path).not.toMatch(spanish);
    }
  });

  it('commits no secrets or personal data in fixtures', () => {
    for (const path of listFiles('test/fixtures')) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toMatch(/\b[0-9a-f]{64}\b/i);
      expect(text, path).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      expect(text, path).not.toMatch(/\b\d{22}\b/);
    }
  });

  it('commits no real deposit addresses in recorded fixtures', () => {
    for (const path of listFiles('test/fixtures/recorded')) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/\b0x[0-9a-fA-F]{40}\b/);
    }
  });

  it('pins every GitHub Action to a full commit SHA', () => {
    for (const path of listFiles('.github/workflows')) {
      for (const line of readFileSync(path, 'utf8').split('\n').filter((l) => /^\s*-?\s*uses:/.test(l))) {
        expect(line, path).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+#\s*v\d/);
      }
    }
  });
});
