#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import {
  resolveTarget,
  planInstallation,
  executeInstallation
} from '../lib/install.js';
import {
  printHelp,
  printVersion,
  printDryRun,
  printInstallationSuccess
} from '../lib/cli-formatters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const optionsConfig = {
  target: { type: 'string', short: 't' },
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
    console.error(`Error: ${err.message}\nRun with --help to see available options.`);
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
    console.error(`Error: Option --yes cannot be used without --force.`);
    process.exit(1);
  }

  let targetDir;
  try {
    const resolved = resolveTarget(values.target);
    targetDir = resolved.targetDir;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Target project: ${targetDir}`);

  let plan;
  try {
    plan = planInstallation({ sourceDir: PACKAGE_ROOT, targetDir });
  } catch (err) {
    console.error(`Error planning installation: ${err.message}`);
    process.exit(1);
  }

  if (plan.isBlocked) {
    console.error(`\nInstallation blocked by destination conflicts:`);
    for (const b of plan.blockers) {
      console.error(`  ✖ .agents/${b.relPath}: ${b.reason}`);
    }
    process.exit(1);
  }

  if (values['dry-run']) {
    printDryRun(plan);
    process.exit(0);
  }

  let authorizedYes = values.yes;

  if (plan.hasCollisions) {
    console.log(`\nExisting files differ from bundle:`);
    for (const r of plan.replacements) {
      console.log(`  ! .agents/${r.relPath}`);
    }

    if (!values.force) {
      console.error(`\nError: Destination files already exist and differ.\nTo overwrite, re-run with --force.`);
      process.exit(1);
    }

    if (!authorizedYes) {
      if (process.stdin.isTTY) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = await rl.question(`\nOverwrite ${plan.replacements.length} existing file(s)? [y/N]: `);
          if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
            authorizedYes = true;
          } else {
            console.log(`Installation cancelled by user.`);
            process.exit(0);
          }
        } finally {
          rl.close();
        }
      } else {
        console.error(`\nError: Overwrite authorized with --force, but confirmation (--yes) is required in non-interactive mode.`);
        process.exit(1);
      }
    }
  }

  try {
    const result = executeInstallation(plan, { dryRun: false, force: values.force, yes: authorizedYes });
    printInstallationSuccess(targetDir, result, plan);
    console.log(`Usage guide: ${path.join(PACKAGE_ROOT, 'docs', 'usage.md')}`);
  } catch (err) {
    console.error(`\nInstallation failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Unexpected fatal error: ${err.message}`);
  process.exit(1);
});
