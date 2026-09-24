#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.js';
import { RipioApiError } from './ripio/errors.js';
import { createServer } from './server.js';
import { stderrLogger } from './tools/result.js';

const config = loadConfig(process.env);
if (config instanceof RipioApiError) stderrLogger(`${config.message} Tools will report this until it is fixed.`);

serveStdio(() => createServer(config), { onerror: (error) => stderrLogger(error.message) });
