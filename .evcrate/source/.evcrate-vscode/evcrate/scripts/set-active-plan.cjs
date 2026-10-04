#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  setActivePlan,
  clearActivePlan,
  SessionStateError
} = require('../runtime/local-session-state.cjs');

function printUsage() {
  console.error('Usage:');
  console.error('  node set-active-plan.cjs <plan-path> --context-file <handle> --project-root <root> --expected-revision <n>');
  console.error('  node set-active-plan.cjs --clear --context-file <handle> --project-root <root> --expected-revision <n>');
}

function parseArgs(args) {
  let isClear = false;
  let planPath = null;
  let contextFile = null;
  let projectRoot = null;
  let expectedRevision = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--clear') {
      isClear = true;
    } else if (arg === '--context-file') {
      contextFile = args[++i];
    } else if (arg === '--project-root') {
      projectRoot = args[++i];
    } else if (arg === '--expected-revision') {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed)) expectedRevision = parsed;
    } else if (!arg.startsWith('--') && planPath === null) {
      planPath = arg;
    }
  }

  return { isClear, planPath, contextFile, projectRoot, expectedRevision };
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.isClear && parsed.planPath) {
    console.error('[evcrate-session-state] ARGUMENT_CONFLICT: Cannot combine --clear with plan path');
    printUsage();
    process.exit(1);
  }

  if (!parsed.isClear && !parsed.planPath) {
    console.error('[evcrate-session-state] ARGUMENT_MISSING: Must specify either <plan-path> or --clear');
    printUsage();
    process.exit(1);
  }

  if (!parsed.contextFile) {
    console.error('[evcrate-session-state] ARGUMENT_MISSING: --context-file is required');
    printUsage();
    process.exit(1);
  }

  if (!parsed.projectRoot) {
    console.error('[evcrate-session-state] ARGUMENT_MISSING: --project-root is required');
    printUsage();
    process.exit(1);
  }

  if (parsed.expectedRevision === null) {
    console.error('[evcrate-session-state] ARGUMENT_MISSING: --expected-revision is required and must be an integer');
    printUsage();
    process.exit(1);
  }

  try {
    let result;
    if (parsed.isClear) {
      result = clearActivePlan(parsed.contextFile, parsed.projectRoot, parsed.expectedRevision);
    } else {
      result = setActivePlan(parsed.contextFile, parsed.projectRoot, parsed.planPath, parsed.expectedRevision);
    }

    const output = {
      status: 'ok',
      revision: result.revision,
      activePlan: result.activePlan,
      handle: parsed.contextFile,
      lastSeenAt: result.lastSeenAt
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    let code = 'INTERNAL_ERROR';
    let message = String(err);
    if (err instanceof SessionStateError) {
      code = err.code;
      message = err.message;
    } else if (err instanceof Error) {
      message = err.message;
    }
    console.error('[' + code + '] ' + message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  main
};
