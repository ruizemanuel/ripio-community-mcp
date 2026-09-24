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

  it('commits no secrets or personal data in fixtures', () => {
    for (const path of listFiles('test/fixtures')) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toMatch(/\b[0-9a-f]{64}\b/i);
      expect(text, path).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      expect(text, path).not.toMatch(/\b\d{22}\b/);
    }
  });
});
