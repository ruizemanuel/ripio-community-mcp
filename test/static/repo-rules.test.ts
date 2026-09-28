import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
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

  it('installs npm dependencies in CI without running their install scripts', () => {
    const installs = listFiles('.github/workflows').flatMap((path) =>
      readFileSync(path, 'utf8')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .filter((line) => /\bnpm\s+(add|ci|cit|clean-install|i|install|install-ci-test|install-test|isntall|it)\b/.test(line))
        .map((line) => ({ file: basename(path), line })),
    );
    expect(installs.map(({ file }) => file).sort()).toEqual(['ci.yml', 'release.yml']);
    for (const { file, line } of installs) expect(line, file).toMatch(/\bnpm ci\b.*\s--ignore-scripts(\s|$)/);
  });

  it('builds releases in a job that cannot publish, and publishes from a job that runs no npm dependencies', () => {
    // Windows checkouts turn line endings into CRLF; dropping comments keeps one from ending a job's block early.
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    const [head = '', jobs = ''] = workflow.split(/^jobs:\n/m);
    const job = (name: string): string => new RegExp(`^  ${name}:\\n((?: {4}.*\\n|\\n)*)`, 'm').exec(jobs)?.[1] ?? '';
    const build = job('build');
    const publish = job('publish');
    expect(head, 'workflow-level permissions').toMatch(/^permissions: \{\}$/m);
    expect(workflow, 'no job may take every permission').not.toMatch(/write-all/);
    expect(workflow.match(/id-token["']?\s*:\s*["']?write/g), 'only publish may request an OIDC token').toHaveLength(1);
    expect(workflow.match(/contents["']?\s*:\s*["']?write/g), 'only publish may write to the repository').toHaveLength(1);
    expect(build).toMatch(/run: npm ci/);
    expect(build).toMatch(/run: npm test/);
    expect(build).toMatch(/Check the tag matches package\.json/);
    expect(build).not.toMatch(/:\s*["']?write/);
    expect(publish).toMatch(/needs: build/);
    expect(publish).toMatch(/id-token:\s*write/);
    // An allowlist, not a blocklist: npm there may only look a version up or publish it, and only these actions run there.
    // The extra words are what follows "npm" in today's step names and messages ("Publish to npm", "on npm from…").
    for (const [, word] of publish.matchAll(/\bnpm\b[ \t\n\\]*(\S*)/g)) {
      expect(['--version', 'view', 'publish', 'from', 'release', 'run:', ''], `npm ${word}`).toContain(word);
    }
    for (const [, action] of publish.matchAll(/uses:\s*([^@\s]+)/g)) {
      expect(['actions/checkout', 'actions/download-artifact', 'actions/setup-node'], action).toContain(action);
    }
    expect(publish).not.toMatch(/\bnpx\b|\b(yarn|pnpm|bun|corepack)\b|\bnode[ \t]+(-|\.|\/|\S+\.[cm]?[jt]s)/);
    expect(publish).toMatch(/npm publish "[^"\n]+\.tgz"/);
  });

  it('checks what it is about to publish, and skips npm or the Release only when this release already did that step', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8').replace(/\r\n/g, '\n');
    const at = (text: string): number => workflow.indexOf(text);
    expect(workflow, 'the artifact lands outside the checkout').toMatch(/name: release\n\s+path: \$\{\{ runner\.temp \}\}\/release\n/);
    expect(at('npm pkg set gitHead="$GITHUB_SHA"'), 'build stamps the commit').toBeGreaterThan(-1);
    expect(at('npm pkg set gitHead="$GITHUB_SHA"')).toBeLessThan(at('run: npm pack'));
    const publishing = at('npm publish "${RUNNER_TEMP}/release/ripio-community-mcp-${version}.tgz"');
    expect(publishing).toBeGreaterThan(-1);
    expect(at('test -f "${RUNNER_TEMP}/release/ripio-community-mcp.mcpb"')).toBeGreaterThan(-1);
    expect(at('test -f "${RUNNER_TEMP}/release/ripio-community-mcp.mcpb"')).toBeLessThan(publishing);
    expect(workflow).toContain('if [ "$published" != "$GITHUB_SHA" ]; then');
    expect(workflow).toContain('--jq \'(.isDraft | not) and any(.assets[]; .name == "ripio-community-mcp.mcpb")\'');
    expect(workflow).toContain('gh release create "${GITHUB_REF_NAME}" "${RUNNER_TEMP}/release/ripio-community-mcp.mcpb"');
  });

  it('publishes only from the release environment, which npm requires of this package', () => {
    const workflow = readFileSync('.github/workflows/release.yml', 'utf8').replace(/\r\n/g, '\n');
    const publish = /^ {2}publish:\n((?: {4}.*\n|\n)*)/m.exec(workflow)?.[1] ?? '';
    expect(publish, 'at job level').toMatch(/^ {4}environment: release$/m);
    expect(workflow.match(/^ *environment:/gm), 'nowhere else').toHaveLength(1);
  });
});
