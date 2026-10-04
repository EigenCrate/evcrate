export const SET_ACTIVE_PLAN_SCRIPT_SOURCE = `#!/usr/bin/env node
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
    process.stdout.write(JSON.stringify(output, null, 2) + '\\n');
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
`;

export const VSCODE_SESSION_CONTEXT_SCRIPT_SOURCE = `#!/usr/bin/env node
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
      process.stdout.write(JSON.stringify(result, null, 2) + '\\n');
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
      process.stdout.write(JSON.stringify({ status: 'ok', forgotten: parsed.contextFile }, null, 2) + '\\n');
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[FORGET_FAILED] ' + msg);
      process.exit(1);
    }
  } else if (parsed.subcommand === 'sweep') {
    const sweepDir = parsed.userDir || path.join(os.tmpdir(), 'evcrate', 'vscode', 'v1');
    const count = sweepExpiredSessions(sweepDir);
    process.stdout.write(JSON.stringify({ status: 'ok', sweptCount: count }, null, 2) + '\\n');
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
`;
