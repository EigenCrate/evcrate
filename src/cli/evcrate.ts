#!/usr/bin/env node
import '../adapters/index.js';
import { main } from './main.js';
import type { CliRuntime } from './types.js';

const cancellation = new AbortController();
let signalCode: 130 | 143 | undefined;

function handleSignal(code: 130 | 143): void {
  signalCode = code;
  cancellation.abort();
}

const onInterrupt = (): void => handleSignal(130);
const onTerminate = (): void => handleSignal(143);
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);
const runtime: CliRuntime = {
  abortSignal: cancellation.signal,
  signalCode: undefined
};
async function run(): Promise<void> {
  try {
    const exitCode = await main(process.argv.slice(2), runtime);
    process.exitCode = signalCode ?? exitCode;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({
      protocol: 'evcrate-cli',
      status: 'error',
      error: { code: 'INTERNAL_ERROR', category: 'internal', action: 'Retry or inspect the bounded diagnostic.', message }
    }) + '\n');
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = signalCode ?? 6;
});
