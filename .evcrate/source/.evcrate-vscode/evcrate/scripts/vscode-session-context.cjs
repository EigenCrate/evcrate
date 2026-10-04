#!/usr/bin/env node
'use strict';

const path = require('node:path');
const os = require('node:os');
const {
  readSessionContext,
  forgetSession,
  sweepExpiredSessions,
  SessionStateError
} = require('../runtime/local-session-state.cjs');

function parseArgs(args) {
  const subcommand = args[0];
  let contextFile = null;
  let projectRoot = null;
  let expectedRevision = null;
  let userDir = null;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--context-file') {
      contextFile = args[++i];
    } else if (arg === '--project-root') {
      projectRoot = args[++i];
    } else if (arg === '--expected-revision') {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed)) expectedRevision = parsed;
    } else if (arg === '--user-dir') {
      userDir = args[++i];
    }
  }

  return { subcommand, contextFile, projectRoot, expectedRevision, userDir };
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.subcommand === 'inspect') {
    if (!parsed.contextFile || !parsed.projectRoot) {
      console.error('Usage: vscode-session-context.cjs inspect --context-file <handle> --project-root <root>');
      process.exit(1);
    }
    const result = readSessionContext(parsed.contextFile, parsed.projectRoot);
    if (result.status === 'ok') {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    } else {
      console.error('[' + result.code + '] ' + result.message);
      process.exit(1);
    }
  } else if (parsed.subcommand === 'forget') {
    if (!parsed.contextFile || !parsed.projectRoot) {
      console.error('Usage: vscode-session-context.cjs forget --context-file <handle> --project-root <root> [--expected-revision <n>]');
      process.exit(1);
    }
    try {
      forgetSession(parsed.contextFile, parsed.projectRoot, parsed.expectedRevision);
      process.stdout.write(JSON.stringify({ status: 'ok', forgotten: parsed.contextFile }, null, 2) + '\n');
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[FORGET_FAILED] ' + msg);
      process.exit(1);
    }
  } else if (parsed.subcommand === 'sweep') {
    const sweepDir = parsed.userDir || path.join(os.tmpdir(), 'evcrate', 'vscode', 'v1');
    const count = sweepExpiredSessions(sweepDir);
    process.stdout.write(JSON.stringify({ status: 'ok', sweptCount: count }, null, 2) + '\n');
    process.exit(0);
  } else {
    console.error('Unknown subcommand. Available: inspect, forget, sweep');
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
