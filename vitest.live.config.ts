import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Credentials for a READ-ONLY Ripio key live in .env.live (git-ignored).
const fileEnv = existsSync('.env.live') ? (parseEnv(readFileSync('.env.live', 'utf8')) as Record<string, string>) : {};

export default defineConfig({
  test: {
    include: ['test/live/**/*.test.ts'],
    env: { ...fileEnv, RIPIO_LIVE: '1' },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
