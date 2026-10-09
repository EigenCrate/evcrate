import fs from 'node:fs';
import path from 'node:path';

export function printHelp() {
  console.log(`
Usage: npx @evcrate/snyk-expert [options]
       snyk-expert-install [options]

Install portable Snyk specialist instructions and skills into a project's .agents/ directory.

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
    console.log(`  + .agents/${a.relPath} (new)`);
  }
  for (const r of plan.replacements) {
    console.log(`  ! .agents/${r.relPath} (collision: differs)`);
  }
  for (const u of plan.unchanged) {
    console.log(`  = .agents/${u.relPath} (identical, will skip)`);
  }
  console.log(`\nSummary: ${plan.additions.length} to add, ${plan.replacements.length} to replace, ${plan.unchanged.length} unchanged.`);
}

export function printInstallationSuccess(targetDir, result, plan) {
  console.log(`\nInstalled assets:`);
  for (const c of result.committed) {
    const isReplacement = plan.replacements.some(r => r.relPath === c);
    console.log(`  ${isReplacement ? '!' : '+'} .agents/${c}`);
  }
  if (result.unchanged.length > 0) {
    console.log(`\nPreserved identical assets:`);
    for (const u of result.unchanged) {
      console.log(`  = .agents/${u}`);
    }
  }

  console.log(`\nInstallation complete! Installed into ${path.join(targetDir, '.agents')}`);
  console.log(`\nNext steps:`);
  console.log(`1. In your host, explicitly read .agents/agents/snyk-expert.md and its linked skills.`);
  console.log(`2. If the host supports agent registration, delegate to snyk-expert with an explicit target and authority.`);
  console.log(`3. Use snyk-cli for authorized setup/login/scan; snyk-fix for dependency remediation.`);
  console.log(`   Installation does not configure native host discovery or authenticate Snyk.`);
}

export function printLegacyMigrationWarning(legacyInstallation) {
  if (!legacyInstallation || !legacyInstallation.detected) return;
  const targetLabel = legacyInstallation.targetDir || 'target project';
  console.log(`\n⚠️  Legacy .claude/ installation detected in ${targetLabel}:`);
  for (const p of legacyInstallation.paths) {
    const qualifiedPath = legacyInstallation.targetDir
      ? path.join(legacyInstallation.targetDir, p)
      : p;
    console.log(`  - ${qualifiedPath}`);
  }
  console.log(`Notice: The installer installs new common resources into .agents/.`);
  console.log(`To prevent host discovery ambiguity or running outdated instructions:`);
  console.log(`1. Inspect and back up any customized instructions or files in the legacy directory.`);
  console.log(`2. In the target project (${targetLabel}), manually archive or remove`);
  console.log(`   only the legacy snyk-expert files listed above after verification.`);
  console.log(`Existing files are preserved and never deleted automatically.`);
}
