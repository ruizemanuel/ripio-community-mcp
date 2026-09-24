// Builds ripio-community-mcp.mcpb: dist + production dependencies + manifest, packed with the official mcpb CLI.
// Runs npm and mcpb through Node directly (no shell), so it behaves the same on Windows, macOS and Linux.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script with "npm run build:mcpb".');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const mcpbCli = resolve('node_modules/@anthropic-ai/mcpb/dist/cli/cli.js');
const stage = 'build/mcpb';

rmSync('build', { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync('dist', `${stage}/dist`, { recursive: true });
for (const file of ['manifest.json', 'LICENSE', 'README.md']) cpSync(file, `${stage}/${file}`);
writeFileSync(
  `${stage}/package.json`,
  JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', dependencies: pkg.dependencies }, null, 2),
);
execFileSync(process.execPath, [npmCli, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: stage,
  stdio: 'inherit',
});
execFileSync(process.execPath, [mcpbCli, 'pack', stage, `${pkg.name}.mcpb`], { stdio: 'inherit' });
console.log(`built ${pkg.name}.mcpb`);
