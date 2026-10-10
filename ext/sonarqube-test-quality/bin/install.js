#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import readline from 'node:readline/promises';
import { executeInstallation, isSupportedNodeVersion, MIN_NODE_VERSION, planInstallation } from '../lib/install.js';

if (!isSupportedNodeVersion()) {
  console.error(`Error: Node.js >=${MIN_NODE_VERSION} is required (current: ${process.version}).`);
  process.exit(1);
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function printHelp() {
  console.log(`\nUsage: sonarqube-test-quality-install [options]

Options:
  -t, --target <name>      Required: agents
  -d, --directory <path>   Required project root; installs under .agents/skills
  -n, --dry-run            Preview files without writing
  -f, --force              Authorize replacing different files
  -y, --yes                Confirm replacement non-interactively (requires --force)
  -h, --help               Show help
  -v, --version            Show package version
`);
}

function printPlan(plan) {
  console.log(`Target: ${plan.target}`);
  console.log(`Install root: ${plan.installationRoot}`);
  for (const action of plan.actions) {
    const marker = { add: '+', replace: '!', unchanged: '=', blocked: 'x' }[action.status];
    console.log(`  ${marker} ${action.relativePath}${action.reason ? ` (${action.reason})` : ''}`);
  }
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        target: { type: 'string', short: 't' },
        directory: { type: 'string', short: 'd' },
        'dry-run': { type: 'boolean', short: 'n', default: false },
        force: { type: 'boolean', short: 'f', default: false },
        yes: { type: 'boolean', short: 'y', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false }
      },
      allowPositionals: false
    }));
  } catch (error) {
    throw new Error(`${error.message}\nRun with --help for usage.`);
  }

  if (values.help) return printHelp();
  if (values.version) {
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    console.log(metadata.version);
    return;
  }
  if (values.yes && !values.force) throw new Error('Option --yes cannot be used without --force.');
  if (!values.target) throw new Error('Option --target is required. Choose agents.');

  const plan = planInstallation({
    sourceDir: packageRoot,
    target: values.target,
    directory: values.directory
  });
  printPlan(plan);
  if (plan.blockers.length) throw new Error('Installation blocked by an unsafe destination.');
  if (values['dry-run']) {
    console.log('Dry run complete; no files were written.');
    return;
  }

  let confirmed = values.yes;
  const isInteractive = Boolean(process.stdin.isTTY || process.env.FORCE_TTY === '1');
  if (plan.replacements.length && values.force && !confirmed && isInteractive) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt.question(`Replace ${plan.replacements.length} changed file(s)? [y/N]: `);
      confirmed = ['y', 'yes'].includes(answer.trim().toLowerCase());
    } finally {
      prompt.close();
    }
    if (!confirmed) {
      console.log('Installation cancelled.');
      process.exitCode = 1;
      return;
    }
  }

  const result = executeInstallation(plan, { force: values.force, yes: confirmed });
  console.log(`Installed ${result.committed.length} file(s); ${result.unchanged.length} unchanged.`);
  console.log(`Discover the common skill in ${path.join(plan.installationRoot, 'skills')} using your agent's skill discovery.`);
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});