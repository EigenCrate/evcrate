#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import {
  planInstallation,
  executeInstallation,
  isSupportedNodeVersion,
  MIN_NODE_VERSION
} from '../lib/install.js';
import {
  printHelp,
  printVersion,
  printDryRun,
  printInstallationSuccess
} from '../lib/cli-formatters.js';

if (!isSupportedNodeVersion()) {
  console.error(`Error: Node.js >=${MIN_NODE_VERSION} is required (current: ${process.version}).`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const optionsConfig = {
  target: { type: 'string', short: 't' },
  directory: { type: 'string', short: 'd' },
  'dry-run': { type: 'boolean', short: 'n', default: false },
  force: { type: 'boolean', short: 'f', default: false },
  yes: { type: 'boolean', short: 'y', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false }
};

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ options: optionsConfig, allowPositionals: false });
  } catch (err) {
    console.error(`Error: ${err.message}\nRun with --help for usage.`);
    process.exit(1);
  }

  const { values } = parsed;

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    printVersion(PACKAGE_ROOT);
    process.exit(0);
  }

  if (values.yes && !values.force) {
    console.error('Error: Option --yes cannot be used without --force.');
    process.exit(1);
  }

  if (!values.target) {
    console.error('Error: Option --target is required. Choose agents.');
    process.exit(1);
  }

  let plan;
  try {
    plan = planInstallation({
      sourceDir: PACKAGE_ROOT,
      target: values.target,
      directory: values.directory
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Target: ${plan.target}`);
  console.log(`Install root: ${plan.installationRoot}`);

  if (plan.isBlocked) {
    console.error('\nInstallation blocked by destination conflicts:');
    for (const b of plan.blockers) {
      console.error(`  - ${b.relativePath || b.relPath}: ${b.reason}`);
    }
    process.exit(1);
  }

  if (values['dry-run']) {
    printDryRun(plan);
    console.log('Dry run complete; no files were written.');
    process.exit(0);
  }

  let authorizedYes = values.yes;

  if (plan.hasCollisions) {
    if (!values.force) {
      console.error('\nError: Destination files already exist and differ.');
      console.error('To overwrite existing files, re-run with --force.');
      process.exit(1);
    }

    const isInteractive = Boolean(process.stdin.isTTY || process.env.FORCE_TTY === '1');
    if (!authorizedYes) {
      if (isInteractive) {
        console.log('\nExisting files will be replaced:');
        for (const r of plan.replacements) {
          console.log(`  ! .agents/${r.relativePath || r.relPath}`);
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = await rl.question('\nAuthorize overwriting existing files? (yes/no): ');
          if (answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y') {
            authorizedYes = true;
          } else {
            console.log('Installation cancelled by user.');
            process.exit(1);
          }
        } finally {
          rl.close();
        }
      } else {
        console.error('Error: Destination files differ. Non-interactive replacement requires both --force and --yes.');
        process.exit(1);
      }
    }
  }

  try {
    const result = executeInstallation(plan, {
      force: values.force,
      yes: authorizedYes
    });
    printInstallationSuccess(plan.targetDir, result, plan);
  } catch (err) {
    console.error(`Error executing installation: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
