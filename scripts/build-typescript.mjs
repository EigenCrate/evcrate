#!/usr/bin/env node
/**
 * scripts/build-typescript.mjs
 *
 * Minimal TypeScript incremental build driver orchestrating:
 * 1. Configuration parsing and output resolution.
 * 2. Missing-output cache invalidation and corruption recovery.
 * 3. Execution of the authoritative TypeScript compiler.
 * 4. Stale compiler-owned output removal via bounded receipts.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  cleanStaleOutputs,
  writeReceipt,
} from './typescript-build-receipt.mjs';
import {
  resolveConfigOutputs,
  validateAndInvalidateCache,
} from './typescript-build-cache.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..');

/**
 * Builds TypeScript project incrementally with output presence validation
 * and stale output cleanup.
 *
 * @param {object} options - Build options
 * @returns {{ status: number, cleaned: string[], receiptWritten: boolean }} Build result
 */
export function buildTypeScript(options = {}) {
  const {
    config = 'tsconfig.json',
    clean = false,
    root = PROJECT_ROOT,
    extraArgs = [],
    logger = console,
  } = options;

  const info = resolveConfigOutputs(config, root);
  const currentOutputsSet = new Set(info.expectedOutputs);

  // 1. Explicit clean mode: remove cache and receipt
  if (clean) {
    if (info.tsBuildInfoPath && fs.existsSync(info.tsBuildInfoPath)) {
      fs.rmSync(info.tsBuildInfoPath, { force: true });
    }
    if (info.receiptPath && fs.existsSync(info.receiptPath)) {
      fs.rmSync(info.receiptPath, { force: true });
    }
  } else {
    // 2. Incremental validation: invalidate cache if corrupted or outputs missing
    validateAndInvalidateCache(info, root, logger);
  }

  // Ensure cache directory exists before compiler runs
  if (info.tsBuildInfoPath) {
    fs.mkdirSync(dirname(info.tsBuildInfoPath), { recursive: true });
  }

  // 3. Execute authoritative TypeScript compiler
  const tscBin = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!fs.existsSync(tscBin)) {
    throw new Error(`TypeScript compiler binary not found at ${tscBin}`);
  }

  const args = [tscBin, '-p', info.absoluteConfigPath, ...extraArgs];
  const proc = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

  if (proc.status !== 0) {
    if (proc.error) {
      logger.error?.(`[build-typescript] Compiler execution failed: ${proc.error.message}`);
    }
    return {
      status: proc.status ?? 1,
      cleaned: [],
      receiptWritten: false,
    };
  }

  // 4. Successful compile -> clean stale outputs from previous receipt
  const { cleaned, errors } = cleanStaleOutputs(info.receiptPath, currentOutputsSet, info.outDir, root);
  if (errors.length > 0) {
    for (const err of errors) {
      logger.warn(`[build-typescript] ${err}`);
    }
  }

  // 5. Write updated receipt
  writeReceipt(info.receiptPath, info.absoluteConfigPath, info.relativeOutDir, info.expectedOutputs, root);

  return {
    status: 0,
    cleaned,
    receiptWritten: true,
  };
}

/**
 * Parses CLI arguments.
 */
function parseArgs(args) {
  let config = 'tsconfig.json';
  let clean = false;
  const extraArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' || arg === '--project') {
      if (i + 1 < args.length) {
        config = args[++i];
      }
    } else if (arg.startsWith('-p=')) {
      config = arg.slice('-p='.length);
    } else if (arg.startsWith('--project=')) {
      config = arg.slice('--project='.length);
    } else if (arg === '--clean') {
      clean = true;
    } else if (arg === '-h' || arg === '--help') {
      console.log(`Usage: node scripts/build-typescript.mjs [-p <tsconfig.json>] [--clean] [...]`);
      process.exit(0);
    } else {
      extraArgs.push(arg);
    }
  }

  return { config, clean, extraArgs };
}

// CLI entrypoint execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { config, clean, extraArgs } = parseArgs(process.argv.slice(2));
  try {
    const result = buildTypeScript({ config, clean, extraArgs });
    process.exit(result.status);
  } catch (err) {
    console.error(`[build-typescript] Error: ${err.message}`);
    process.exit(1);
  }
}
