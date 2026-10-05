import fs from 'node:fs';
import path from 'node:path';

export function printHelp() {
  console.log(`
Usage: npx @evcrate/snyk-expert [options]
       snyk-expert-install [options]

Install Snyk specialist agent and skills into a project's .claude/ directory.

Options:
  -t, --target <path>   Project directory to install into (defaults to current working directory)
  -n, --dry-run         Preview installation changes without modifying any files
  -f, --force           Authorize overwriting existing files when collisions occur
  -y, --yes             Confirm overwrite non-interactively (requires --force)
  -h, --help            Show this help message
  -v, --version         Show package version
`);
}

export function printVersion(packageRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    console.log(pkg.version || '1.0.0');
  } catch (_) {
    console.log('1.0.0');
  }
}

export function printDryRun(plan) {
  console.log(`\nDry run preview for ${plan.targetDir}:`);
  for (const a of plan.additions) {
    console.log(`  + .claude/${a.relPath} (new)`);
  }
  for (const r of plan.replacements) {
    console.log(`  ! .claude/${r.relPath} (collision: differs)`);
  }
  for (const u of plan.unchanged) {
    console.log(`  = .claude/${u.relPath} (identical, will skip)`);
  }
  console.log(`\nSummary: ${plan.additions.length} to add, ${plan.replacements.length} to replace, ${plan.unchanged.length} unchanged.`);
}

export function printInstallationSuccess(targetDir, result, plan) {
  console.log(`\nInstalled assets:`);
  for (const c of result.committed) {
    const isReplacement = plan.replacements.some(r => r.relPath === c);
    console.log(`  ${isReplacement ? '!' : '+'} .claude/${c}`);
  }
  if (result.unchanged.length > 0) {
    console.log(`\nPreserved identical assets:`);
    for (const u of result.unchanged) {
      console.log(`  = .claude/${u}`);
    }
  }

  console.log(`\n✨ Installation complete! Installed into ${path.join(targetDir, '.claude')}`);
  console.log(`\nNext steps:`);
  console.log(`1. Start a fresh Claude Code session in your project:`);
  console.log(`   cd ${targetDir} && claude`);
  console.log(`2. Delegate to the agent:`);
  console.log(`   "delegate to snyk-expert"`);
}
