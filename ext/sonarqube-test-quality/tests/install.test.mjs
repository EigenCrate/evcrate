import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { executeInstallation, isSupportedNodeVersion, MIN_NODE_VERSION, planInstallation, resolveInstallTarget, RETIRED_ASSETS } from '../lib/install.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(packageRoot, 'bin', 'install.js');

const EXPECTED_ASSETS = [
  { source: 'SKILL.md', dest: 'skills/sonarqube-test-quality/SKILL.md' },
  { source: 'references/sonar-cli-commands.md', dest: 'skills/sonarqube-test-quality/references/sonar-cli-commands.md' },
  { source: 'references/full-scan-workflow.md', dest: 'skills/sonarqube-test-quality/references/full-scan-workflow.md' },
  { source: 'references/testing-and-coverage.md', dest: 'skills/sonarqube-test-quality/references/testing-and-coverage.md' },
  { source: 'references/remediation-and-handoff.md', dest: 'skills/sonarqube-test-quality/references/remediation-and-handoff.md' },
  { source: 'references/report-formats.md', dest: 'skills/sonarqube-test-quality/references/report-formats.md' },
  { source: 'references/worktree-remediation.md', dest: 'skills/sonarqube-test-quality/references/worktree-remediation.md' },
  { source: 'scripts/convert-sonar-report.mjs', dest: 'skills/sonarqube-test-quality/scripts/convert-sonar-report.mjs' },
  { source: 'scripts/fetch-sonar-issues.mjs', dest: 'skills/sonarqube-test-quality/scripts/fetch-sonar-issues.mjs' },
  { source: 'scripts/calculate-jacoco-coverage.mjs', dest: 'skills/sonarqube-test-quality/scripts/calculate-jacoco-coverage.mjs' },
  { source: 'scripts/vendor/sax.cjs', dest: 'skills/sonarqube-test-quality/scripts/vendor/sax.cjs' },
  { source: 'scripts/vendor/sax.LICENSE', dest: 'skills/sonarqube-test-quality/scripts/vendor/sax.LICENSE' },
  { source: 'scripts/vendor/sax-provenance.json', dest: 'skills/sonarqube-test-quality/scripts/vendor/sax-provenance.json' },
  { source: 'references/remediation-cycles.md', dest: 'skills/sonarqube-test-quality/references/remediation-cycles.md' },
  { source: 'references/project-discovery.md', dest: 'skills/sonarqube-test-quality/references/project-discovery.md' },
  { source: 'references/local-analysis.md', dest: 'skills/sonarqube-test-quality/references/local-analysis.md' },
  { source: 'references/run-guidance.md', dest: 'skills/sonarqube-test-quality/references/run-guidance.md' },
  { source: 'agents/sonar-evidence.md', dest: 'skills/sonarqube-test-quality/agents/sonar-evidence.md' },
  { source: 'templates/remediation-cycle-report.md', dest: 'skills/sonarqube-test-quality/templates/remediation-cycle-report.md' },
  { source: 'templates/run-guidance-report.md', dest: 'skills/sonarqube-test-quality/templates/run-guidance-report.md' },
  { source: 'commands/cmd-sonar-remediate/SKILL.md', dest: 'skills/cmd-sonar-remediate/SKILL.md' }
];

const skillRoot = project => path.join(project, '.agents', 'skills', 'sonarqube-test-quality');
const planFor = project => planInstallation({ sourceDir: packageRoot, target: 'agents', directory: project });
const FIXTURES_DIR = path.join(packageRoot, 'tests', 'fixtures', 'retired');
const HISTORICAL_FETCH_BYTES = fs.readFileSync(path.join(FIXTURES_DIR, 'historical-fetch-sonar-issues.ps1.bin'));
const HISTORICAL_COVERAGE_BYTES = fs.readFileSync(path.join(FIXTURES_DIR, 'historical-calculate-jacoco-coverage.ps1.bin'));

function assertNoRegistration(project) {
  for (const file of [
    '.vscode', 'plugin.json', 'settings.json', '.agents/plugin.json', '.agents/settings.json',
    '.agents/skills/sonarqube-test-quality/plugin.json', '.agents/skills/sonarqube-test-quality/settings.json',
    '.agents/agents/sonar-evidence.md', '.claude/agents/sonar-evidence.md'
  ]) {
    assert.ok(!fs.existsSync(path.join(project, file)), `Installer must not create ${file}`);
  }
}

describe('SonarQube common skill installer', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sonarqube-skill-'));
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('installs only the common skill payload and leaves repeat installations unchanged', () => {
    const project = path.join(tempRoot, 'project');
    const plan = planFor(project);
    assert.equal(plan.installationRoot, path.join(project, '.agents'));
    const result = executeInstallation(plan);
    assert.equal(result.committed.length, EXPECTED_ASSETS.length);
    for (const asset of EXPECTED_ASSETS) {
      assert.ok(fs.readFileSync(path.join(project, '.agents', asset.dest)).equals(fs.readFileSync(path.join(packageRoot, asset.source))));
    }
    const repeated = executeInstallation(planFor(project));
    assert.equal(repeated.committed.length, 0);
    assert.equal(repeated.unchanged.length, EXPECTED_ASSETS.length);
    assert.deepEqual(fs.readdirSync(project), ['.agents']);
    assert.deepEqual(fs.readdirSync(path.join(project, '.agents')), ['skills']);
    assert.deepEqual(fs.readdirSync(path.join(project, '.agents', 'skills')).sort(), ['cmd-sonar-remediate', 'sonarqube-test-quality']);
    assertNoRegistration(project);
  });

  test('CLI installs a standalone converter preserving nested reports outside the source tree', () => {
    const project = path.join(tempRoot, 'project');
    execFileSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project], { cwd: tempRoot, encoding: 'utf8' });
    const converter = path.join(skillRoot(project), 'scripts', 'convert-sonar-report.mjs');
    assert.ok(!fs.existsSync(path.join(skillRoot(project), 'lib')));
    const evidence = {
      project: { key: 'demo-project', branch: 'feature-report', pullRequest: '73', revision: 'abcdef0123456789' },
      paging: { pageIndex: 2, pageSize: 2, total: 21 },
      issues: [
        { key: 'finding-first', severity: 'MAJOR', flows: [{ locations: [
          { component: 'demo-project:src/example.js', textRange: { startLine: 17 }, msg: 'Nested finding evidence' }
        ] }], tags: ['coverage', 'coverage'] },
        { key: 'finding-second', severity: 'MINOR', message: 'Second finding evidence', unknown: { active: false, extra: null } }
      ],
      errors: [{ msg: 'Partial page evidence' }],
      unknown: { emptyArray: [], emptyObject: {} }
    };
    const runConverter = format => execFileSync(process.execPath, [converter, '--input', '-', '--format', format], {
      cwd: tempRoot, input: JSON.stringify(evidence, null, 2), encoding: 'utf8'
    });
    const json = runConverter('json');
    assert.equal(json.trimEnd(), JSON.stringify(evidence));
    assert.deepEqual(JSON.parse(json), evidence);
    const markdown = runConverter('markdown');
    for (const value of [
      'project', 'branch', 'pullRequest', 'revision', 'paging', 'pageIndex', 'pageSize', 'total',
      'demo-project', 'feature-report', '73', 'abcdef0123456789', 'issues', 'finding-first',
      'finding-second', 'MAJOR', 'MINOR', 'flows', 'locations', 'textRange', 'startLine',
      '17', 'Nested finding evidence', 'Second finding evidence', 'Partial page evidence',
      'unknown', 'active', 'false', 'extra', 'null', 'emptyArray', 'emptyObject'
    ]) assert.ok(markdown.includes(value), `Markdown preserves ${value}`);
    assert.ok(markdown.indexOf('finding-first') < markdown.indexOf('finding-second'));
    assert.equal(markdown.split('coverage').length - 1, 2);
    assertNoRegistration(project);
  });

  test('library and CLI dry runs preview the .agents payload without creating a project', () => {
    const project = path.join(tempRoot, 'new-project');
    const result = executeInstallation(planFor(project), { dryRun: true });
    assert.deepEqual(result.additions, EXPECTED_ASSETS.map(a => a.dest));
    const output = execFileSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--dry-run'], {
      cwd: tempRoot, encoding: 'utf8'
    });
    assert.ok(output.includes(path.join(project, '.agents')));
    for (const file of result.additions) assert.ok(output.includes(file));
    assert.ok(!fs.existsSync(project));
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  });

  test('requires both replacement authorization and confirmation while preserving unrelated files', () => {
    const project = path.join(tempRoot, 'project');
    executeInstallation(planFor(project));
    const destination = path.join(skillRoot(project), 'SKILL.md');
    const unrelated = path.join(skillRoot(project), 'user-notes.txt');
    const existingInstallation = path.join(project, '.claude', 'skills', 'user-skill', 'SKILL.md');
    fs.writeFileSync(destination, 'user-owned change');
    fs.writeFileSync(unrelated, 'unrelated evidence');
    fs.mkdirSync(path.dirname(existingInstallation), { recursive: true });
    fs.writeFileSync(existingInstallation, 'pre-existing user installation');
    const plan = planFor(project);
    assert.equal(plan.replacements.length, 1);
    assert.throws(() => executeInstallation(plan), /Destination files differ/);
    assert.throws(() => executeInstallation(plan, { force: true }), /requires confirmation with --yes/);
    assert.throws(() => executeInstallation(plan, { yes: true }), /Option --yes cannot be used without --force/);
    const result = executeInstallation(plan, { force: true, yes: true });
    assert.equal(result.committed.length, 1);
    assert.equal(result.unchanged.length, EXPECTED_ASSETS.length - 1);
    assert.equal(fs.readFileSync(destination, 'utf8'), fs.readFileSync(path.join(packageRoot, 'SKILL.md'), 'utf8'));
    assert.equal(fs.readFileSync(unrelated, 'utf8'), 'unrelated evidence');
    assert.equal(fs.readFileSync(existingInstallation, 'utf8'), 'pre-existing user installation');
  });

  test('rejects removed or missing targets and missing project roots without writing', () => {
    const project = path.join(tempRoot, 'project');
    fs.writeFileSync(path.join(tempRoot, 'unrelated.txt'), 'keep');
    for (const target of ['directory', 'vscode', 'codex', 'copilot', 'antigravity', '', undefined]) {
      assert.throws(() => resolveInstallTarget({ target, directory: project }), /Unsupported target.*Choose agents/);
      assert.throws(() => planInstallation({ sourceDir: packageRoot, target, directory: project }), /Unsupported target/);
      const args = [...(target === undefined ? [] : ['--target', target]), '--directory', project];
      const result = spawnSync(process.execPath, [cliPath, ...args], { cwd: tempRoot, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unsupported target|--target is required/);
      assert.ok(!fs.existsSync(project));
    }
    for (const directory of [undefined, '', '   ']) {
      assert.throws(() => resolveInstallTarget({ target: 'agents', directory }), /requires --directory <project-root>/);
      const args = ['--target', 'agents', ...(directory === undefined ? [] : ['--directory', directory])];
      const result = spawnSync(process.execPath, [cliPath, ...args], {
        cwd: tempRoot, encoding: 'utf8', env: { ...process.env, HOME: tempRoot, USERPROFILE: tempRoot }
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires --directory <project-root>/);
    }
    assert.deepEqual(fs.readdirSync(tempRoot), ['unrelated.txt']);
    assert.equal(fs.readFileSync(path.join(tempRoot, 'unrelated.txt'), 'utf8'), 'keep');
  });

  for (const relativePath of ['.agents', '.agents/skills', '.agents/skills/sonarqube-test-quality/SKILL.md']) {
    test(`blocks a symbolic link at ${relativePath} without touching its target`, t => {
      const project = path.join(tempRoot, 'project');
      fs.mkdirSync(project, { recursive: true });
      const linkTarget = path.join(tempRoot, 'link-target');
      fs.mkdirSync(linkTarget, { recursive: true });
      const targetFile = path.join(linkTarget, 'target.txt');
      fs.writeFileSync(targetFile, 'target payload');
      const linkPath = path.join(project, relativePath);
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      try {
        fs.symlinkSync(linkTarget, linkPath, relativePath.endsWith('.md') ? 'file' : 'junction');
      } catch (error) {
        t.skip(`Symlink creation is unavailable: ${error.code}`);
        return;
      }

      const plan = planFor(project);
      assert.ok(plan.blockers.length > 0);
      assert.throws(() => executeInstallation(plan), /Installation blocked/);
      assert.equal(fs.readFileSync(targetFile, 'utf8'), 'target payload');
      assert.equal(fs.readdirSync(linkTarget).length, 1);
    });
  }

  test('rejects a file or symbolic link supplied as the project root', t => {
    const file = path.join(tempRoot, 'file');
    fs.writeFileSync(file, 'keep');
    assert.throws(() => planFor(file), /non-symbolic-link directory/);
    const project = path.join(tempRoot, 'project');
    const outside = path.join(tempRoot, 'outside');
    fs.mkdirSync(outside);
    try {
      fs.symlinkSync(outside, project, 'junction');
    } catch (error) {
      t.skip(`Directory symlinks are unavailable: ${error.code}`);
      return;
    }
    assert.throws(() => planFor(project), /non-symbolic-link directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
  });

  test('refuses a changed replacement after planning before writing any additions', () => {
    const project = path.join(tempRoot, 'project');
    const destination = path.join(skillRoot(project), 'SKILL.md');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, 'first user change');
    const plan = planFor(project);
    fs.writeFileSync(destination, 'second user change');
    assert.throws(() => executeInstallation(plan, { force: true, yes: true }), /Destination changed after planning/);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'second user change');
    assert.deepEqual(fs.readdirSync(skillRoot(project)), ['SKILL.md']);
  });

  test('refuses an addition that appears after planning without overwriting it', () => {
    const project = path.join(tempRoot, 'project');
    const plan = planFor(project);
    fs.mkdirSync(skillRoot(project), { recursive: true });
    fs.writeFileSync(path.join(skillRoot(project), 'SKILL.md'), 'new user evidence');
    assert.throws(() => executeInstallation(plan), /Destination changed after planning/);
    assert.deepEqual(fs.readdirSync(skillRoot(project)), ['SKILL.md']);
    assert.equal(fs.readFileSync(path.join(skillRoot(project), 'SKILL.md'), 'utf8'), 'new user evidence');
  });

  test('enforces Node.js >=22.19.0 compatibility in metadata and runtime validator', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '>=22.19.0');
    assert.equal(MIN_NODE_VERSION, '22.19.0');
    assert.equal(isSupportedNodeVersion('18.0.0'), false);
    assert.equal(isSupportedNodeVersion('18.11.0'), false);
    assert.equal(isSupportedNodeVersion('20.0.0'), false);
    assert.equal(isSupportedNodeVersion('21.0.0'), false);
    assert.equal(isSupportedNodeVersion('22.0.0'), false);
    assert.equal(isSupportedNodeVersion('22.18.0'), false);
    assert.equal(isSupportedNodeVersion('22.18.9'), false);
    assert.equal(isSupportedNodeVersion('22.18.9-rc.1'), false);
    assert.equal(isSupportedNodeVersion('v22.18.0'), false);
    assert.equal(isSupportedNodeVersion('v22.18.9'), false);
    assert.equal(isSupportedNodeVersion('22.19.0'), true);
    assert.equal(isSupportedNodeVersion('22.19.0-alpha.1'), true);
    assert.equal(isSupportedNodeVersion('v22.19.0'), true);
    assert.equal(isSupportedNodeVersion('v22.19.0-rc.1'), true);
    assert.equal(isSupportedNodeVersion('22.19.1'), true);
    assert.equal(isSupportedNodeVersion('22.19.9'), true);
    assert.equal(isSupportedNodeVersion('22.20.0'), true);
    assert.equal(isSupportedNodeVersion('23.0.0'), true);
    assert.equal(isSupportedNodeVersion('24.16.0'), true);
    assert.equal(isSupportedNodeVersion('24.21.0'), true);
    assert.equal(isSupportedNodeVersion(), true);
    assert.equal(isSupportedNodeVersion(null), false);
    assert.equal(isSupportedNodeVersion(123), false);
  });

  test('installer exits status 1 with diagnostic on unsupported Node version without mutation', () => {
    const project = path.join(tempRoot, 'project-guard');
    const preload = path.join(tempRoot, 'mock-unsupported-node.cjs');
    fs.writeFileSync(preload, [
      'Object.defineProperty(process.versions, "node", { value: "22.18.9", configurable: true });',
      'Object.defineProperty(process, "version", { value: "v22.18.9", configurable: true });'
    ].join('\n'));

    const result = spawnSync(process.execPath, [
      '--require', preload,
      cliPath,
      '--target', 'agents',
      '--directory', project
    ], {
      cwd: tempRoot,
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Node\.js >=22\.19\.0 is required \(current: v22\.18\.9\)\./);
    assert.equal(fs.existsSync(project), false, 'Must perform no filesystem mutation on unsupported runtime');
  });

  test('exits with status 1 and leaves files untouched when interactive replacement is rejected', () => {
    const project = path.join(tempRoot, 'project');
    executeInstallation(planFor(project));
    const target = path.join(skillRoot(project), 'SKILL.md');
    fs.writeFileSync(target, 'original user edit');
    const result = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--force'], {
      cwd: tempRoot,
      input: 'n\n',
      env: { ...process.env, FORCE_TTY: '1' },
      encoding: 'utf8'
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Installation cancelled\./);
    assert.equal(fs.readFileSync(target, 'utf8'), 'original user edit');
  });

  test('confirms interactive replacement when user confirms with yes', () => {
    const project = path.join(tempRoot, 'project');
    executeInstallation(planFor(project));
    const target = path.join(skillRoot(project), 'SKILL.md');
    fs.writeFileSync(target, 'original user edit');
    const result = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--force'], {
      cwd: tempRoot,
      input: 'yes\n',
      env: { ...process.env, FORCE_TTY: '1' },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Installed 1 file\(s\)/);
    assert.ok(fs.readFileSync(target).equals(fs.readFileSync(path.join(packageRoot, 'SKILL.md'))));
  });

  test('exclusive installation locking prevents concurrent installer execution', () => {
    const project = path.join(tempRoot, 'project');
    const plan = planFor(project);
    const lockFile = path.join(skillRoot(project), '.install.lock');
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, 'lock held by another process');
    assert.throws(() => executeInstallation(plan), /Installation locked by another process/);
    assert.ok(fs.existsSync(lockFile));
    fs.unlinkSync(lockFile);
  });

  test('prevents overwriting a destination created concurrently immediately before publication', () => {
    const project = path.join(tempRoot, 'project');
    const plan = planFor(project);
    assert.throws(() => executeInstallation(plan, {
      _beforePublish: (action) => {
        if (action.relativePath.endsWith('SKILL.md')) {
          fs.writeFileSync(action.destinationPath, 'competing concurrent write');
        }
      }
    }), /Destination changed during installation.*already exists/);
    assert.equal(fs.readFileSync(path.join(skillRoot(project), 'SKILL.md'), 'utf8'), 'competing concurrent write');
  });

  test('rolls back to previous usable installation if a fault occurs during replacement', () => {
    const project = path.join(tempRoot, 'project');
    executeInstallation(planFor(project));
    const modifiedSkill = path.join(skillRoot(project), 'SKILL.md');
    const modifiedConverter = path.join(skillRoot(project), 'scripts', 'convert-sonar-report.mjs');
    fs.writeFileSync(modifiedSkill, 'modified skill by user');
    fs.writeFileSync(modifiedConverter, 'modified converter by user');

    const replacePlan = planFor(project);
    assert.equal(replacePlan.replacements.length, 2);

    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: (action, index) => {
        if (index === 1) {
          throw new Error('Simulated I/O failure during commit');
        }
      }
    }), /Simulated I\/O failure during commit/);

    assert.equal(fs.readFileSync(modifiedSkill, 'utf8'), 'modified skill by user');
    assert.equal(fs.readFileSync(modifiedConverter, 'utf8'), 'modified converter by user');
    assert.ok(!fs.existsSync(path.join(skillRoot(project), '.install.lock')));
    const allFiles = fs.readdirSync(skillRoot(project), { recursive: true });
    for (const f of allFiles) {
      assert.ok(!f.includes('.tmp-'));
    }
  });

  test('installs claude-only payload and leaves .agents untouched', () => {
    const project = path.join(tempRoot, 'claude-project');
    const plan = planInstallation({ sourceDir: packageRoot, target: 'claude', directory: project });
    assert.equal(plan.installationRoot, path.join(project, '.claude'));
    const result = executeInstallation(plan);
    assert.equal(result.committed.length, EXPECTED_ASSETS.length);
    for (const asset of EXPECTED_ASSETS) {
      assert.ok(fs.readFileSync(path.join(project, '.claude', asset.dest)).equals(fs.readFileSync(path.join(packageRoot, asset.source))));
    }
    assert.ok(!fs.existsSync(path.join(project, '.agents')), 'Installer must not create .agents when target is claude');
    assert.deepEqual(fs.readdirSync(path.join(project, '.claude', 'skills')).sort(), ['cmd-sonar-remediate', 'sonarqube-test-quality']);

    const repeated = executeInstallation(planInstallation({ sourceDir: packageRoot, target: 'claude', directory: project }));
    assert.equal(repeated.committed.length, 0);
    assert.equal(repeated.unchanged.length, EXPECTED_ASSETS.length);
  });

  test('installs both targets with 42 destinations and dual discovery messaging', () => {
    const project = path.join(tempRoot, 'both-project');
    const plan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.equal(plan.installationRoot, project);
    assert.equal(plan.actions.length, EXPECTED_ASSETS.length * 2);
    assert.equal(plan.additions.length, EXPECTED_ASSETS.length * 2);

    const cliResult = spawnSync(process.execPath, [cliPath, '--target', 'both', '--directory', project], {
      cwd: tempRoot, encoding: 'utf8'
    });
    assert.equal(cliResult.status, 0);
    assert.match(cliResult.stdout, /Installed 42 file\(s\)/);
    assert.match(cliResult.stdout, /\.agents\/skills.*and.*\.claude\/skills/);
    assert.doesNotMatch(cliResult.stdout, new RegExp(`${project}/skills`));

    for (const asset of EXPECTED_ASSETS) {
      assert.ok(fs.readFileSync(path.join(project, '.agents', asset.dest)).equals(fs.readFileSync(path.join(packageRoot, asset.source))));
      assert.ok(fs.readFileSync(path.join(project, '.claude', asset.dest)).equals(fs.readFileSync(path.join(packageRoot, asset.source))));
    }

    const repeatedPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.equal(repeatedPlan.unchanged.length, EXPECTED_ASSETS.length * 2);
    const repeated = executeInstallation(repeatedPlan);
    assert.equal(repeated.committed.length, 0);
    assert.equal(repeated.unchanged.length, EXPECTED_ASSETS.length * 2);
  });

  test('enforces locking hierarchy: shared project lock and legacy agents lock', () => {
    const project = path.join(tempRoot, 'locked-project');
    fs.mkdirSync(project, { recursive: true });

    const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
    fs.writeFileSync(sharedLock, 'shared lock active');
    for (const target of ['agents', 'claude', 'both']) {
      const plan = planInstallation({ sourceDir: packageRoot, target, directory: project });
      assert.throws(() => executeInstallation(plan), /Installation locked by another process/);
    }
    fs.unlinkSync(sharedLock);

    const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
    fs.mkdirSync(path.dirname(legacyLock), { recursive: true });
    fs.writeFileSync(legacyLock, 'legacy lock active');

    const claudePlan = planInstallation({ sourceDir: packageRoot, target: 'claude', directory: project });
    const claudeRes = executeInstallation(claudePlan);
    assert.equal(claudeRes.committed.length, EXPECTED_ASSETS.length);

    const agentsPlan = planInstallation({ sourceDir: packageRoot, target: 'agents', directory: project });
    assert.throws(() => executeInstallation(agentsPlan), /Installation locked by another process/);

    const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.throws(() => executeInstallation(bothPlan), /Installation locked by another process/);
    assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released on partial acquisition failure');
    assert.ok(fs.existsSync(legacyLock), 'Pre-existing legacy lock must be preserved');
    fs.unlinkSync(legacyLock);
  });

  test('cross-root rollback restores state and cleans up on publication failure in both mode', () => {
    const project = path.join(tempRoot, 'rollback-project');
    executeInstallation(planInstallation({ sourceDir: packageRoot, target: 'both', directory: project }));

    const agentsSkill = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'SKILL.md');
    const claudeSkill = path.join(project, '.claude', 'skills', 'sonarqube-test-quality', 'SKILL.md');
    fs.writeFileSync(agentsSkill, 'modified agents skill');
    fs.writeFileSync(claudeSkill, 'modified claude skill');

    const replacePlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.equal(replacePlan.replacements.length, 2);

    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: (action, index) => {
        if (index === 1) throw new Error('simulated fault during second replacement');
      }
    }), /simulated fault during second replacement/);

    assert.equal(fs.readFileSync(agentsSkill, 'utf8'), 'modified agents skill');
    assert.equal(fs.readFileSync(claudeSkill, 'utf8'), 'modified claude skill');
    assert.ok(!fs.existsSync(path.join(project, '.sonarqube-test-quality.install.lock')));
  });

  test('detects concurrent modification during publication after planning', () => {
    const project = path.join(tempRoot, 'partial-rollback-project');
    executeInstallation(planInstallation({ sourceDir: packageRoot, target: 'both', directory: project }));

    const agentsSkill = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'SKILL.md');
    fs.writeFileSync(agentsSkill, 'modified agents skill');

    const replacePlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });

    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: (action, index) => {
        if (action.relativePath.includes('sonarqube-test-quality/SKILL.md')) {
          fs.writeFileSync(action.destinationPath, 'concurrent external modification');
        }
      }
    }), /Destination changed during installation/);
  });

  test('preserves pre-existing empty directories along managed paths across installation and rollback', () => {
    const project = path.join(tempRoot, 'empty-dir-project');
    const preExistingEmpty = path.join(project, 'pre-existing-dir');
    const preExistingAgentsSkill = path.join(project, '.agents', 'skills', 'existing-agent-skill');
    const preExistingClaudeSkill = path.join(project, '.claude', 'skills', 'existing-claude-skill');
    fs.mkdirSync(preExistingEmpty, { recursive: true });
    fs.mkdirSync(preExistingAgentsSkill, { recursive: true });
    fs.mkdirSync(preExistingClaudeSkill, { recursive: true });

    // 1. Initial installation with pre-existing directories in place
    executeInstallation(planInstallation({ sourceDir: packageRoot, target: 'both', directory: project }));
    assert.ok(fs.existsSync(preExistingEmpty), 'Pre-existing empty directory must be preserved after install');
    assert.ok(fs.existsSync(preExistingAgentsSkill), 'Pre-existing empty directory in .agents/skills must be preserved after install');
    assert.ok(fs.existsSync(preExistingClaudeSkill), 'Pre-existing empty directory in .claude/skills must be preserved after install');

    // 2. Rollback during replacement preserving pre-existing directories
    const agentsSkill = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'SKILL.md');
    fs.writeFileSync(agentsSkill, 'user edit');
    const replacePlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });

    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: () => { throw new Error('rollback fault'); }
    }), /rollback fault/);

    assert.ok(fs.existsSync(preExistingEmpty), 'Pre-existing empty directory must be preserved after rollback');
    assert.ok(fs.existsSync(preExistingAgentsSkill), 'Pre-existing empty directory in .agents/skills must be preserved after rollback');
    assert.ok(fs.existsSync(preExistingClaudeSkill), 'Pre-existing empty directory in .claude/skills must be preserved after rollback');

    // 3. Rollback during fresh installation into a new target cleans new paths while preserving pre-existing directories
    const freshProject = path.join(tempRoot, 'fresh-failed-project');
    const freshAgentsPre = path.join(freshProject, '.agents', 'skills', 'pre-existing-custom-skill');
    const freshClaudePre = path.join(freshProject, '.claude', 'skills', 'pre-existing-custom-skill');
    fs.mkdirSync(freshAgentsPre, { recursive: true });
    fs.mkdirSync(freshClaudePre, { recursive: true });

    const freshPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: freshProject });
    assert.throws(() => executeInstallation(freshPlan, {
      _beforePublish: (action, index) => {
        if (index === 2) throw new Error('simulated fresh install fault');
      }
    }), /simulated fresh install fault/);

    assert.ok(fs.existsSync(freshAgentsPre), 'Pre-existing empty directory in .agents/skills must survive fresh install rollback');
    assert.ok(fs.existsSync(freshClaudePre), 'Pre-existing empty directory in .claude/skills must survive fresh install rollback');
    assert.ok(!fs.existsSync(path.join(freshProject, '.agents', 'skills', 'sonarqube-test-quality')), 'Newly created skill dir must be pruned');
  });

  test('package validation smoke test: packed tarball installs cleanly with --target both into disposable directory', () => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packOutput = execFileSync(npmCmd, ['pack', '--pack-destination', tempRoot], {
      cwd: packageRoot,
      encoding: 'utf8'
    }).trim();
    const tarballName = packOutput.split('\n').pop().trim();
    const tarballPath = path.join(tempRoot, tarballName);
    assert.ok(fs.existsSync(tarballPath), `Tarball must exist at ${tarballPath}`);

    const extractDir = path.join(tempRoot, 'extracted-package');
    const targetDir = path.join(tempRoot, 'disposable-install-target');
    fs.mkdirSync(extractDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir]);
    const packedCliPath = path.join(extractDir, 'package', 'bin', 'install.js');
    assert.ok(fs.existsSync(packedCliPath), `Packed CLI must exist at ${packedCliPath}`);

    const cliResult = spawnSync(process.execPath, [packedCliPath, '--target', 'both', '--directory', targetDir], {
      cwd: tempRoot,
      encoding: 'utf8'
    });
    assert.equal(cliResult.status, 0);
    assert.match(cliResult.stdout, /Installed 42 file\(s\)/);
    assert.match(cliResult.stdout, /\.agents[\\/]skills.*and.*\.claude[\\/]skills/);
    for (const root of ['.agents', '.claude']) {
      const rootPath = path.join(targetDir, root);
      assert.ok(fs.existsSync(rootPath), `Root ${root} must exist`);

      const entrypoint1 = path.join(rootPath, 'skills', 'sonarqube-test-quality', 'SKILL.md');
      const entrypoint2 = path.join(rootPath, 'skills', 'cmd-sonar-remediate', 'SKILL.md');
      assert.ok(fs.existsSync(entrypoint1), `Entrypoint 1 must exist at ${entrypoint1}`);
      assert.ok(fs.existsSync(entrypoint2), `Entrypoint 2 must exist at ${entrypoint2}`);
      assert.ok(fs.readFileSync(entrypoint1).equals(fs.readFileSync(path.join(packageRoot, 'SKILL.md'))));
      assert.ok(fs.readFileSync(entrypoint2).equals(fs.readFileSync(path.join(packageRoot, 'commands', 'cmd-sonar-remediate', 'SKILL.md'))));

      for (const asset of EXPECTED_ASSETS) {
        const installedFile = path.join(rootPath, asset.dest);
        const sourceFile = path.join(packageRoot, asset.source);
        assert.ok(fs.existsSync(installedFile), `Expected file missing: ${installedFile}`);
        assert.ok(fs.readFileSync(installedFile).equals(fs.readFileSync(sourceFile)), `File content mismatch: ${installedFile}`);
      }
    }

    let fileCount = 0;
    function countFiles(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) countFiles(full);
        else if (entry.isFile()) fileCount++;
      }
    }
    countFiles(targetDir);
    assert.equal(fileCount, EXPECTED_ASSETS.length * 2, `Expected exactly ${EXPECTED_ASSETS.length * 2} installed files, found ${fileCount}`);

    // Prove parser/license/provenance and helper closure runs outside repo
    for (const root of ['.agents', '.claude']) {
      const installedSkill = path.join(targetDir, root, 'skills', 'sonarqube-test-quality');
      const fetchHelper = path.join(installedSkill, 'scripts', 'fetch-sonar-issues.mjs');
      const coverageHelper = path.join(installedSkill, 'scripts', 'calculate-jacoco-coverage.mjs');
      assert.ok(fs.existsSync(fetchHelper), 'Installed fetch helper must exist');
      assert.ok(fs.existsSync(coverageHelper), 'Installed coverage helper must exist');
      assert.ok(fs.existsSync(path.join(installedSkill, 'scripts', 'vendor', 'sax.cjs')), 'Installed vendor parser must exist');

      const fetchHelp = spawnSync(process.execPath, [fetchHelper, '--help'], { cwd: tempRoot, encoding: 'utf8' });
      assert.equal(fetchHelp.status, 0);
      assert.match(fetchHelp.stdout, /Usage: node fetch-sonar-issues\.mjs/);

      const covHelp = spawnSync(process.execPath, [coverageHelper, '--help'], { cwd: tempRoot, encoding: 'utf8' });
      assert.equal(covHelp.status, 0);
      assert.match(covHelp.stdout, /Usage: node calculate-jacoco-coverage\.mjs/);
    }
  });

  test('staging failure cleans up temporary staged files', () => {
    const project = path.join(tempRoot, 'staging-fail-project');
    const plan = planFor(project);
    let stageSeen = false;
    assert.throws(() => executeInstallation(plan, {
      _afterStage: (action, index, tempPath) => {
        if (index === 2) {
          stageSeen = true;
          assert.ok(fs.existsSync(tempPath), 'Staged temp file must exist before failure');
          throw new Error('deterministic staging failure injection');
        }
      }
    }), /deterministic staging failure injection/);
    assert.ok(stageSeen, 'Staging hook must have run');
    if (fs.existsSync(project)) {
      const allFiles = fs.readdirSync(project, { recursive: true });
      for (const file of allFiles) {
        assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
      }
    }
    const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
    const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
    assert.ok(!fs.existsSync(sharedLock), 'Lock must be released after staging failure');
    assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released after staging failure');
  });

  test('rollback refuses to write through a symlink mid-transaction and reports partial rollback failure', () => {
    const project = path.join(tempRoot, 'symlink-rollback-project');
    executeInstallation(planFor(project));
    const targetFile = path.join(skillRoot(project), 'SKILL.md');
    const secondFile = path.join(skillRoot(project), 'references', 'sonar-cli-commands.md');
    const victimFile = path.join(tempRoot, 'victim.txt');
    fs.writeFileSync(victimFile, 'VICTIM');
    fs.writeFileSync(targetFile, 'original user edit');
    fs.writeFileSync(secondFile, 'second user edit');

    const replacePlan = planFor(project);
    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: (action, index) => {
        if (index === 1) {
          fs.rmSync(targetFile);
          fs.symlinkSync(victimFile, targetFile);
          throw new Error('publish fault after symlink swap');
        }
      }
    }), /rollback partial failure.*refusing to overwrite/);

    assert.equal(fs.readFileSync(victimFile, 'utf8'), 'VICTIM');
    assert.ok(fs.lstatSync(targetFile).isSymbolicLink(), 'Target file must remain a symlink');
    assert.equal(fs.readlinkSync(targetFile), victimFile);
    assert.equal(fs.readFileSync(secondFile, 'utf8'), 'second user edit');
    const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
    const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
    assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released');
    assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released');
    const allFiles = fs.readdirSync(project, { recursive: true });
    for (const file of allFiles) {
      assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
    }
  });

  test('rollback reports conflict when regular file is concurrently modified after publish before rollback', () => {
    const project = path.join(tempRoot, 'regular-rollback-conflict-project');
    executeInstallation(planFor(project));
    const targetFile = path.join(skillRoot(project), 'SKILL.md');
    const secondFile = path.join(skillRoot(project), 'references', 'sonar-cli-commands.md');
    fs.writeFileSync(targetFile, 'original user edit 1');
    fs.writeFileSync(secondFile, 'original user edit 2');

    const replacePlan = planFor(project);
    assert.throws(() => executeInstallation(replacePlan, {
      force: true,
      yes: true,
      _beforePublish: (action, index) => {
        if (index === 1) {
          fs.writeFileSync(targetFile, 'foreign concurrent edit');
          throw new Error('publish fault after regular file edit');
        }
      }
    }), /rollback partial failure.*concurrent modification detected, unable to safely restore/);

    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'foreign concurrent edit');
    assert.equal(fs.readFileSync(secondFile, 'utf8'), 'original user edit 2');
    const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
    const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
    assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released');
    assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released');
    const allFiles = fs.readdirSync(project, { recursive: true });
    for (const file of allFiles) {
      assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
    }
  });

  test('addition rollback removes copied file if chmodSync fails during publication', () => {
    const project = path.join(tempRoot, 'chmod-fail-project');
    const plan = planFor(project);
    const origChmodSync = fs.chmodSync;
    let injected = false;
    try {
      assert.throws(() => executeInstallation(plan, {
        _beforePublish: (action, index) => {
          if (index === 0) {
            fs.chmodSync = (p, m) => {
              if (p === plan.actions[0].destinationPath) {
                fs.chmodSync = origChmodSync;
                injected = true;
                throw new Error('injected chmodSync failure');
              }
              return origChmodSync(p, m);
            };
          }
        }
      }), /injected chmodSync failure/);
      assert.ok(injected, 'Injected chmodSync failure must have run');
      const action0Dest = plan.actions[0].destinationPath;
      assert.ok(!fs.existsSync(action0Dest), 'Action 0 destination must be removed by rollback');
      const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
      const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
      assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released');
      assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released');
      if (fs.existsSync(project)) {
        const allFiles = fs.readdirSync(project, { recursive: true });
        for (const file of allFiles) {
          assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
        }
      }
    } finally {
      fs.chmodSync = origChmodSync;
    }
  });

  test('replacement rollback restores original files and does not falsely report conflict if renameSync fails', () => {
    const project = path.join(tempRoot, 'rename-fail-project');
    executeInstallation(planFor(project));
    const targetFile = path.join(skillRoot(project), 'SKILL.md');
    fs.writeFileSync(targetFile, 'original user edit before rename fail');
    fs.chmodSync(targetFile, 0o600);
    const replacePlan = planFor(project);
    const origRenameSync = fs.renameSync;
    let injected = false;
    try {
      assert.throws(() => executeInstallation(replacePlan, {
        force: true,
        yes: true,
        _beforePublish: (action, index) => {
          if (index === 0) {
            fs.renameSync = (src, dest) => {
              if (dest === replacePlan.actions[0].destinationPath) {
                fs.renameSync = origRenameSync;
                injected = true;
                throw new Error('injected renameSync failure');
              }
              return origRenameSync(src, dest);
            };
          }
        }
      }), (err) => {
        assert.ok(!err.message.includes('rollback partial failure'), `Must not report rollback conflict: ${err.message}`);
        assert.match(err.message, /injected renameSync failure/);
        return true;
      });
      assert.ok(injected, 'Injected renameSync failure must have run');
      assert.equal(fs.readFileSync(targetFile, 'utf8'), 'original user edit before rename fail');
      assert.equal(fs.statSync(targetFile).mode & 0o777, 0o600, 'Original mode must survive failed renameSync');
      const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
      const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
      assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released');
      assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released');
      if (fs.existsSync(project)) {
        const allFiles = fs.readdirSync(project, { recursive: true });
        for (const file of allFiles) {
          assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
        }
      }
    } finally {
      fs.renameSync = origRenameSync;
    }
  });

  test('replacement rollback restores original file when chmodSync fails after rename', () => {
    const project = path.join(tempRoot, 'replace-chmod-fail-project');
    executeInstallation(planFor(project));
    const targetFile = path.join(skillRoot(project), 'SKILL.md');
    fs.writeFileSync(targetFile, 'original user edit before replace chmod fail');
    fs.chmodSync(targetFile, 0o600);
    const replacePlan = planFor(project);
    const origChmodSync = fs.chmodSync;
    let injected = false;
    try {
      assert.throws(() => executeInstallation(replacePlan, {
        force: true,
        yes: true,
        _beforePublish: (action, index) => {
          if (index === 0) {
            fs.chmodSync = (p, m) => {
              if (p === replacePlan.actions[0].destinationPath) {
                fs.chmodSync = origChmodSync;
                injected = true;
                throw new Error('injected replace chmodSync failure');
              }
              return origChmodSync(p, m);
            };
          }
        }
      }), /injected replace chmodSync failure/);
      assert.ok(injected, 'Injected replace chmodSync failure must have run');
      assert.equal(fs.readFileSync(targetFile, 'utf8'), 'original user edit before replace chmod fail');
      assert.equal(fs.statSync(targetFile).mode & 0o777, 0o600, 'Original mode must be restored after post-rename failure');
      const sharedLock = path.join(project, '.sonarqube-test-quality.install.lock');
      const legacyLock = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', '.install.lock');
      assert.ok(!fs.existsSync(sharedLock), 'Shared lock must be released');
      assert.ok(!fs.existsSync(legacyLock), 'Legacy lock must be released');
      if (fs.existsSync(project)) {
        const allFiles = fs.readdirSync(project, { recursive: true });
        for (const file of allFiles) {
          assert.ok(!file.includes('.tmp-'), `Leaked temporary file found: ${file}`);
        }
      }
    } finally {
      fs.chmodSync = origChmodSync;
    }
  });

  test('sibling-only or root-only collision blocks the whole plan', () => {
    const project = path.join(tempRoot, 'collision-project');
    executeInstallation(planFor(project));
    const cmdSkill = path.join(project, '.agents', 'skills', 'cmd-sonar-remediate', 'SKILL.md');
    fs.writeFileSync(cmdSkill, 'user custom command');

    const plan = planFor(project);
    assert.equal(plan.replacements.length, 1);
    assert.equal(plan.unchanged.length, EXPECTED_ASSETS.length - 1);
    assert.throws(() => executeInstallation(plan), /Destination files differ/);
  });

  test('handles mixed additions and replacements across roots in both mode', () => {
    const project = path.join(tempRoot, 'mixed-roots-project');
    executeInstallation(planInstallation({ sourceDir: packageRoot, target: 'claude', directory: project }));

    const claudeSkill = path.join(project, '.claude', 'skills', 'sonarqube-test-quality', 'SKILL.md');
    fs.writeFileSync(claudeSkill, 'user edit in claude');

    const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.equal(bothPlan.additions.length, EXPECTED_ASSETS.length);
    assert.equal(bothPlan.replacements.length, 1);
    assert.equal(bothPlan.unchanged.length, EXPECTED_ASSETS.length - 1);

    assert.throws(() => executeInstallation(bothPlan), /Destination files differ/);
    const result = executeInstallation(bothPlan, { force: true, yes: true });
    assert.equal(result.committed.length, EXPECTED_ASSETS.length + 1);
    assert.equal(result.unchanged.length, EXPECTED_ASSETS.length - 1);
  });

  test('concurrent user-created file survives in both mode', () => {
    const project = path.join(tempRoot, 'surviving-file-project');
    const userFile = path.join(project, '.agents', 'skills', 'user-file.txt');

    const plan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    const result = executeInstallation(plan, {
      _beforePublish: (action, index) => {
        if (index === 0) {
          fs.mkdirSync(path.dirname(userFile), { recursive: true });
          fs.writeFileSync(userFile, 'user created file');
        }
      }
    });
    assert.equal(result.committed.length, EXPECTED_ASSETS.length * 2);
    assert.ok(fs.existsSync(userFile));
    assert.equal(fs.readFileSync(userFile, 'utf8'), 'user created file');
  });

  test('CLI installs claude-only without creating .agents', () => {
    const project = path.join(tempRoot, 'cli-claude-project');
    const cliResult = spawnSync(process.execPath, [cliPath, '--target', 'claude', '--directory', project], {
      cwd: tempRoot,
      encoding: 'utf8'
    });
    assert.equal(cliResult.status, 0);
    assert.match(cliResult.stdout, /Installed 21 file\(s\)/);
    assert.match(cliResult.stdout, /\.claude\/skills/);
    assert.ok(!fs.existsSync(path.join(project, '.agents')));
    assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'sonarqube-test-quality', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'cmd-sonar-remediate', 'SKILL.md')));
  });

  test('blocks symbolic links for claude and both targets', t => {
    const project = path.join(tempRoot, 'symlink-claude-project');
    fs.mkdirSync(project, { recursive: true });
    const linkTarget = path.join(tempRoot, 'link-target-claude');
    fs.mkdirSync(linkTarget, { recursive: true });
    const linkPath = path.join(project, '.claude');
    try {
      fs.symlinkSync(linkTarget, linkPath, 'junction');
    } catch (e) {
      t.skip('symlinks unavailable');
      return;
    }
    const claudePlan = planInstallation({ sourceDir: packageRoot, target: 'claude', directory: project });
    assert.ok(claudePlan.blockers.length > 0);
    assert.throws(() => executeInstallation(claudePlan), /Installation blocked/);

    const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.ok(bothPlan.blockers.length > 0);
    assert.throws(() => executeInstallation(bothPlan), /Installation blocked/);
  });

  test('cleans up newly created project root on failed fresh install', () => {
    const project = path.join(tempRoot, 'nonexistent-fresh-project');
    const plan = planInstallation({ sourceDir: packageRoot, target: 'agents', directory: project });
    assert.ok(!fs.existsSync(project));

    assert.throws(() => executeInstallation(plan, {
      _beforePublish: () => { throw new Error('fail fresh install'); }
    }), /fail fresh install/);

    assert.ok(!fs.existsSync(project), 'Nonexistent project root created by installer must be cleaned up on failure');
  });

  describe('Transactional retirement of legacy PowerShell helpers', () => {
    function seedHistoricalHelpers(projectRoot, target = 'agents', { fetchBytes = HISTORICAL_FETCH_BYTES, coverageBytes = HISTORICAL_COVERAGE_BYTES } = {}) {
      const roots = target === 'both' ? ['.agents', '.claude'] : (target === 'agents' ? ['.agents'] : ['.claude']);
      for (const root of roots) {
        const scriptsDir = path.join(projectRoot, root, 'skills', 'sonarqube-test-quality', 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });
        if (fetchBytes !== null) {
          fs.writeFileSync(path.join(scriptsDir, 'fetch-sonar-issues.ps1'), fetchBytes, { mode: 0o644 });
        }
        if (coverageBytes !== null) {
          fs.writeFileSync(path.join(scriptsDir, 'calculate-jacoco-coverage.ps1'), coverageBytes, { mode: 0o644 });
        }
      }
    }
    test('immutable release provenance metadata matches RETIRED_ASSETS and authentic fixtures', () => {
      const jsonPath = path.join(packageRoot, 'lib', 'retirement-provenance.json');
      assert.ok(fs.existsSync(jsonPath), 'retirement-provenance.json must exist');
      const provData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      assert.equal(provData.provenanceVersion, 1);
      assert.equal(provData.retiredAssets.length, RETIRED_ASSETS.length);

      for (let i = 0; i < RETIRED_ASSETS.length; i++) {
        const constantAsset = RETIRED_ASSETS[i];
        const jsonAsset = provData.retiredAssets[i];
        assert.equal(constantAsset.destination, jsonAsset.destination);
        assert.equal(constantAsset.knownVariants.length, jsonAsset.knownVariants.length);
        for (let v = 0; v < constantAsset.knownVariants.length; v++) {
          const cVar = constantAsset.knownVariants[v];
          const jVar = jsonAsset.knownVariants[v];
          assert.equal(cVar.version, jVar.version);
          assert.equal(cVar.release, jVar.release);
          assert.equal(cVar.commit, jVar.commit);
          assert.equal(cVar.length, jVar.length);
          assert.equal(cVar.sha256, jVar.sha256);
          assert.equal(cVar.reproductionCommand, jVar.reproductionCommand);
        }
      }

      const fetchHash = crypto.createHash('sha256').update(HISTORICAL_FETCH_BYTES).digest('hex');
      const covHash = crypto.createHash('sha256').update(HISTORICAL_COVERAGE_BYTES).digest('hex');
      assert.equal(HISTORICAL_FETCH_BYTES.length, RETIRED_ASSETS[0].knownVariants[0].length);
      assert.equal(fetchHash, RETIRED_ASSETS[0].knownVariants[0].sha256);
      assert.equal(HISTORICAL_COVERAGE_BYTES.length, RETIRED_ASSETS[1].knownVariants[0].length);
      assert.equal(covHash, RETIRED_ASSETS[1].knownVariants[0].sha256);
    });


    test('Case 1: fresh install has zero removals, reports missing paths, and leaves retired paths absent', () => {
      const project = path.join(tempRoot, 'fresh-retirement-project');
      const plan = planFor(project);
      assert.equal(plan.removals.length, 0);
      assert.equal(plan.missing.length, 2);
      assert.equal(plan.blockers.length, 0);

      const result = executeInstallation(plan);
      assert.equal(result.committed.length, EXPECTED_ASSETS.length);
      assert.equal(result.removals.length, 0);
      assert.equal(result.missing.length, 2);

      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const covPs1 = path.join(skillRoot(project), 'scripts', 'calculate-jacoco-coverage.ps1');
      assert.ok(!fs.existsSync(fetchPs1));
      assert.ok(!fs.existsSync(covPs1));

      const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: path.join(tempRoot, 'fresh-both') });
      assert.equal(bothPlan.removals.length, 0);
      assert.equal(bothPlan.missing.length, 4);
    });

    test('Case 2: recognized upgrade removes trusted .ps1 helpers and reports completed removals', () => {
      const project = path.join(tempRoot, 'upgrade-agents-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const covPs1 = path.join(skillRoot(project), 'scripts', 'calculate-jacoco-coverage.ps1');
      assert.ok(fs.existsSync(fetchPs1));
      assert.ok(fs.existsSync(covPs1));

      const plan = planFor(project);
      assert.equal(plan.removals.length, 2);
      assert.equal(plan.missing.length, 0);
      assert.equal(plan.blockers.length, 0);

      const result = executeInstallation(plan);
      assert.equal(result.committed.length, EXPECTED_ASSETS.length);
      assert.equal(result.removals.length, 2);
      assert.ok(!fs.existsSync(fetchPs1));
      assert.ok(!fs.existsSync(covPs1));

      // CLI presentation check
      const cliProject = path.join(tempRoot, 'cli-upgrade-project');
      seedHistoricalHelpers(cliProject, 'agents');
      const cliRes = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', cliProject], {
        cwd: tempRoot,
        encoding: 'utf8'
      });
      assert.equal(cliRes.status, 0);
      assert.match(cliRes.stdout, /retired 2 obsolete file\(s\)/);

      // Both mode upgrade
      const bothProject = path.join(tempRoot, 'upgrade-both-project');
      seedHistoricalHelpers(bothProject, 'both');
      const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: bothProject });
      assert.equal(bothPlan.removals.length, 4);
      assert.equal(bothPlan.missing.length, 0);
      const bothRes = executeInstallation(bothPlan);
      assert.equal(bothRes.committed.length, EXPECTED_ASSETS.length * 2);
      assert.equal(bothRes.removals.length, 4);
      for (const root of ['.agents', '.claude']) {
        assert.ok(!fs.existsSync(path.join(bothProject, root, 'skills', 'sonarqube-test-quality', 'scripts', 'fetch-sonar-issues.ps1')));
        assert.ok(!fs.existsSync(path.join(bothProject, root, 'skills', 'sonarqube-test-quality', 'scripts', 'calculate-jacoco-coverage.ps1')));
      }
    });

    test('Case 3: repeat upgrade is idempotent and partially missing files are handled safely', () => {
      const project = path.join(tempRoot, 'repeat-retirement-project');
      seedHistoricalHelpers(project, 'agents');
      executeInstallation(planFor(project));

      // Repeat execution
      const repPlan = planFor(project);
      assert.equal(repPlan.removals.length, 0);
      assert.equal(repPlan.missing.length, 2);
      const repRes = executeInstallation(repPlan);
      assert.equal(repRes.committed.length, 0);
      assert.equal(repRes.unchanged.length, EXPECTED_ASSETS.length);
      assert.equal(repRes.removals.length, 0);
      assert.equal(repRes.missing.length, 2);

      // Partially missing: only fetch helper present
      const partialProject = path.join(tempRoot, 'partial-missing-project');
      seedHistoricalHelpers(partialProject, 'agents', { coverageBytes: null });
      const partPlan = planFor(partialProject);
      assert.equal(partPlan.removals.length, 1);
      assert.equal(partPlan.missing.length, 1);
      const partRes = executeInstallation(partPlan);
      assert.equal(partRes.removals.length, 1);
      assert.equal(partRes.missing.length, 1);
      assert.ok(!fs.existsSync(path.join(skillRoot(partialProject), 'scripts', 'fetch-sonar-issues.ps1')));
    });

    test('Case 4: library and CLI dry-run surface removals and missing paths without disk changes or locks', () => {
      const project = path.join(tempRoot, 'dry-run-retirement-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const mtimeBefore = fs.statSync(fetchPs1).mtimeMs;

      const plan = planFor(project);
      const dryResult = executeInstallation(plan, { dryRun: true });
      assert.equal(dryResult.dryRun, true);
      assert.equal(dryResult.removals.length, 2);
      assert.equal(dryResult.additions.length, EXPECTED_ASSETS.length);
      assert.equal(dryResult.blockers.length, 0);
      assert.ok(fs.existsSync(fetchPs1));
      assert.equal(fs.statSync(fetchPs1).mtimeMs, mtimeBefore);
      assert.ok(!fs.existsSync(path.join(project, '.sonarqube-test-quality.install.lock')));

      // CLI dry run
      const cliRes = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--dry-run'], {
        cwd: tempRoot,
        encoding: 'utf8'
      });
      assert.equal(cliRes.status, 0);
      assert.match(cliRes.stdout, /- skills\/sonarqube-test-quality\/scripts\/fetch-sonar-issues\.ps1/);
      assert.match(cliRes.stdout, /Dry run complete; no files were written\./);

      // CLI dry run with customized blocker
      fs.writeFileSync(fetchPs1, 'customized content');
      const cliBlockRes = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--dry-run'], {
        cwd: tempRoot,
        encoding: 'utf8'
      });
      assert.equal(cliBlockRes.status, 1);
      assert.match(cliBlockRes.stderr, /Dry run detected blockers:/);
      assert.match(cliBlockRes.stderr, /Customized or unrecognized obsolete helper file/);
    });

    test('Case 5: unknown/customized regular old file blocks the entire plan with and without force', () => {
      const project = path.join(tempRoot, 'customized-project');
      seedHistoricalHelpers(project, 'agents', { fetchBytes: Buffer.from('# customized user script\nexit 0') });
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const origBytes = fs.readFileSync(fetchPs1);

      const plan = planFor(project);
      assert.equal(plan.blockers.length, 1);
      assert.match(plan.blockers[0].reason, /Customized or unrecognized obsolete helper file/);

      assert.throws(() => executeInstallation(plan), /Installation blocked/);
      assert.throws(() => executeInstallation(plan, { force: true }), /Installation blocked/);
      assert.throws(() => executeInstallation(plan, { force: true, yes: true }), /Installation blocked/);

      // Original customized file is untouched, not deleted, not backed up
      assert.ok(fs.existsSync(fetchPs1));
      assert.ok(fs.readFileSync(fetchPs1).equals(origBytes));
      assert.ok(!fs.existsSync(path.join(skillRoot(project), 'SKILL.md')), 'No active files installed when blocked');
    });

    test('Case 6: one blocked root in both mode blocks both roots before any modification', () => {
      const project = path.join(tempRoot, 'one-blocked-both-project');
      seedHistoricalHelpers(project, 'agents'); // trusted
      seedHistoricalHelpers(project, 'claude', { fetchBytes: Buffer.from('unrecognized helper') }); // customized

      const bothPlan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
      assert.equal(bothPlan.blockers.length, 1);
      assert.match(bothPlan.blockers[0].relativePath, /\.claude/);

      assert.throws(() => executeInstallation(bothPlan), /Installation blocked/);

      // .agents trusted helper remains untouched on disk!
      const agentsFetch = path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'scripts', 'fetch-sonar-issues.ps1');
      assert.ok(fs.existsSync(agentsFetch));
      assert.ok(fs.readFileSync(agentsFetch).equals(HISTORICAL_FETCH_BYTES));
      assert.ok(!fs.existsSync(path.join(project, '.agents', 'skills', 'sonarqube-test-quality', 'SKILL.md')));
      assert.ok(!fs.existsSync(path.join(project, '.claude', 'skills', 'sonarqube-test-quality', 'SKILL.md')));
    });

    test('Case 7: unsafe leaf or ancestor (symlinks, non-directories) blocks retirement without touching targets', t => {
      const project = path.join(tempRoot, 'unsafe-leaf-project');
      const scriptsDir = path.join(skillRoot(project), 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      const outsideFile = path.join(tempRoot, 'outside-secret.txt');
      fs.writeFileSync(outsideFile, 'secret outside file');

      const symlinkLeaf = path.join(scriptsDir, 'fetch-sonar-issues.ps1');
      try {
        fs.symlinkSync(outsideFile, symlinkLeaf);
      } catch (e) {
        t.skip('symlinks unavailable');
        return;
      }

      const plan = planFor(project);
      assert.ok(plan.blockers.length > 0);
      assert.match(plan.blockers[0].reason, /symbolic link/);
      assert.throws(() => executeInstallation(plan), /Installation blocked/);
      assert.ok(fs.existsSync(outsideFile));
      assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'secret outside file');
      fs.unlinkSync(symlinkLeaf);

      // Directory leaf where file expected
      fs.mkdirSync(symlinkLeaf);
      const dirPlan = planFor(project);
      assert.ok(dirPlan.blockers.length > 0);
      assert.match(dirPlan.blockers[0].reason, /not a regular file/);
      assert.throws(() => executeInstallation(dirPlan), /Installation blocked/);
      fs.rmdirSync(symlinkLeaf);
    });

    test('Case 8: post-plan drift is rejected under lock before staging or unlinking', () => {
      const project = path.join(tempRoot, 'post-plan-drift-project');
      seedHistoricalHelpers(project, 'agents');
      const plan = planFor(project);
      assert.equal(plan.removals.length, 2);

      // Modify candidate after planning
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      fs.writeFileSync(fetchPs1, 'tampered bytes after planning');

      assert.throws(() => executeInstallation(plan), /Retirement candidate changed after planning/);
      assert.ok(!fs.existsSync(path.join(skillRoot(project), 'SKILL.md')));
      assert.ok(fs.existsSync(fetchPs1));
    });

    test('Case 9: mutation-boundary drift immediately before unlink aborts safely', () => {
      const project = path.join(tempRoot, 'immediate-drift-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const plan = planFor(project);

      assert.throws(() => executeInstallation(plan, {
        _beforeUnlink: (rAction) => {
          if (rAction.relativePath.includes('fetch-sonar-issues.ps1')) {
            fs.writeFileSync(rAction.destinationPath, 'modified right before unlink');
          }
        }
      }), /Retirement destination content changed immediately before removal/);

      assert.ok(fs.existsSync(fetchPs1));
      assert.equal(fs.readFileSync(fetchPs1, 'utf8'), 'modified right before unlink');
    });

    test('Case 10: failure before unlink completes leaves candidate untouched and restores prior removals', () => {
      const project = path.join(tempRoot, 'unlink-fail-project');
      seedHistoricalHelpers(project, 'agents');
      const plan = planFor(project);

      assert.throws(() => executeInstallation(plan, {
        _beforeUnlink: (rAction, rIdx) => {
          if (rIdx === 1) {
            throw new Error('injected unlink failure on second candidate');
          }
        }
      }), /injected unlink failure on second candidate/);

      // First candidate was unlinked and must be restored by rollback
      // Second candidate was never unlinked and must be untouched
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const covPs1 = path.join(skillRoot(project), 'scripts', 'calculate-jacoco-coverage.ps1');
      assert.ok(fs.existsSync(fetchPs1), 'First candidate must be restored');
      assert.ok(fs.existsSync(covPs1), 'Second candidate must remain present');
      assert.ok(fs.readFileSync(fetchPs1).equals(HISTORICAL_FETCH_BYTES));
      assert.ok(fs.readFileSync(covPs1).equals(HISTORICAL_COVERAGE_BYTES));
    });

    test('Case 11: fault after each completed removal restores all unlinked originals with exact bytes and mode', () => {
      for (let failAt = 0; failAt < 4; failAt++) {
        const project = path.join(tempRoot, `fault-after-removal-${failAt}`);
        seedHistoricalHelpers(project, 'both');
        const plan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
        assert.equal(plan.removals.length, 4);

        assert.throws(() => executeInstallation(plan, {
          _afterUnlink: (rAction, rIdx) => {
            if (rIdx === failAt) {
              throw new Error(`simulated failure after removal ${failAt}`);
            }
          }
        }), new RegExp(`simulated failure after removal ${failAt}`));

        // All 4 files must exist with exact historical bytes
        for (const root of ['.agents', '.claude']) {
          const fPath = path.join(project, root, 'skills', 'sonarqube-test-quality', 'scripts', 'fetch-sonar-issues.ps1');
          const cPath = path.join(project, root, 'skills', 'sonarqube-test-quality', 'scripts', 'calculate-jacoco-coverage.ps1');
          assert.ok(fs.existsSync(fPath), `fetch helper in ${root} must be present`);
          assert.ok(fs.existsSync(cPath), `coverage helper in ${root} must be present`);
          assert.ok(fs.readFileSync(fPath).equals(HISTORICAL_FETCH_BYTES));
          assert.ok(fs.readFileSync(cPath).equals(HISTORICAL_COVERAGE_BYTES));
        }
      }
    });

    test('Case 12: fault across publication and verification boundaries restores all retired files and rolls back active additions/replacements', () => {
      const project = path.join(tempRoot, 'pub-verify-fault-project');
      seedHistoricalHelpers(project, 'agents');
      const plan = planFor(project);

      // Fault during publication after unlinks completed
      assert.throws(() => executeInstallation(plan, {
        _beforePublish: (action, index) => {
          if (index === 3) throw new Error('injected publication failure');
        }
      }), /injected publication failure/);

      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const covPs1 = path.join(skillRoot(project), 'scripts', 'calculate-jacoco-coverage.ps1');
      assert.ok(fs.existsSync(fetchPs1));
      assert.ok(fs.existsSync(covPs1));
      assert.ok(fs.readFileSync(fetchPs1).equals(HISTORICAL_FETCH_BYTES));
      assert.ok(fs.readFileSync(covPs1).equals(HISTORICAL_COVERAGE_BYTES));
      assert.ok(!fs.existsSync(path.join(skillRoot(project), 'SKILL.md')));

      // Fault during verification after all active files published
      const freshPlan = planFor(project);
      assert.throws(() => executeInstallation(freshPlan, {
        _beforeVerify: () => {
          throw new Error('injected verification failure');
        }
      }), /injected verification failure/);

      assert.ok(fs.existsSync(fetchPs1));
      assert.ok(fs.existsSync(covPs1));
      assert.ok(fs.readFileSync(fetchPs1).equals(HISTORICAL_FETCH_BYTES));
      assert.ok(fs.readFileSync(covPs1).equals(HISTORICAL_COVERAGE_BYTES));
    });

    test('Case 13: explicit mode restoration under restrictive umask and tracked restoration failure', () => {
      const project = path.join(tempRoot, 'umask-mode-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      fs.chmodSync(fetchPs1, 0o640);

      const plan = planFor(project);
      const oldUmask = process.umask(0o077);
      try {
        assert.throws(() => executeInstallation(plan, {
          _beforePublish: () => { throw new Error('fail during publication for umask test'); }
        }), /fail during publication for umask test/);
      } finally {
        process.umask(oldUmask);
      }

      assert.ok(fs.existsSync(fetchPs1));
      const restoredStat = fs.statSync(fetchPs1);
      assert.equal(restoredStat.mode & 0o777, 0o640, 'Restored mode must match original 0640 even under umask 077');

      // Tracked chmod failure during restore keeps restored bytes and reports mode restoration failure
      const chmodFailPlan = planFor(project);
      assert.throws(() => executeInstallation(chmodFailPlan, {
        _beforeRestoreChmod: () => { throw new Error('permission denied on chmod'); },
        _beforePublish: () => { throw new Error('trigger rollback'); }
      }), /rollback partial failure: .*failed to restore mode: permission denied on chmod/);
      assert.ok(fs.existsSync(fetchPs1), 'Restored bytes must be preserved when mode restoration fails');

      // Tracked write failure during restore retains destination for inspection
      const writeFailPlan = planFor(project);
      assert.throws(() => executeInstallation(writeFailPlan, {
        _beforeRestoreWrite: () => { throw new Error('simulated disk full during write'); },
        _beforePublish: () => { throw new Error('trigger rollback'); }
      }), /rollback partial failure: .*restoration failed; any existing destination left untouched: simulated disk full during write/);
      assert.ok(fs.existsSync(fetchPs1), 'Destination must be retained for inspection on write failure');
      // Also verify active replacement rollback preserves mode under restrictive umask
      const replProject = path.join(tempRoot, 'umask-replacement-project');
      executeInstallation(planFor(replProject));
      const skillFile = path.join(skillRoot(replProject), 'SKILL.md');
      fs.chmodSync(skillFile, 0o640);
      fs.writeFileSync(skillFile, 'modified user skill file');
      const replPlan = planFor(replProject);
      const umask2 = process.umask(0o077);
      try {
        assert.throws(() => executeInstallation(replPlan, {
          force: true, yes: true,
          _beforeVerify: () => {
            assert.ok(fs.readFileSync(skillFile).equals(fs.readFileSync(path.join(packageRoot, 'SKILL.md'))));
            throw new Error('fail replacement publish under umask');
          }
        }), /fail replacement publish under umask/);
      } finally {
        process.umask(umask2);
      }
      assert.equal(fs.readFileSync(skillFile, 'utf8'), 'modified user skill file', 'Rollback must restore original modified user content');
      assert.equal(fs.statSync(skillFile).mode & 0o777, 0o640, 'Replaced file mode must match original 0640 even under umask 077');
    });

    test('Case 14: concurrent rollback recreation is preserved without overwrite and reported as partial rollback', () => {
      const project = path.join(tempRoot, 'concurrent-recreation-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const plan = planFor(project);

      assert.throws(() => executeInstallation(plan, {
        _beforePublish: () => {
          // Simulate external process recreating the unlinked file before rollback
          fs.writeFileSync(fetchPs1, 'recreated by external writer');
          throw new Error('trigger rollback with recreation');
        }
      }), /rollback partial failure: .* destination recreated during installation, preserving file/);

      // Recreated file was preserved and NOT clobbered by rollback
      assert.ok(fs.existsSync(fetchPs1));
      assert.equal(fs.readFileSync(fetchPs1, 'utf8'), 'recreated by external writer');
    });

    test('Case 15: scope isolation preserves unselected roots and unrelated files across success, blocks, and rollback', () => {
      const project = path.join(tempRoot, 'isolation-project');
      const sentinel = path.join(project, 'sentinel.txt');
      const unselectedFile = path.join(project, '.claude', 'user-file.txt');
      fs.mkdirSync(path.dirname(unselectedFile), { recursive: true });
      fs.writeFileSync(sentinel, 'project sentinel');
      fs.writeFileSync(unselectedFile, 'claude user file');

      seedHistoricalHelpers(project, 'agents');
      const plan = planFor(project);

      // Success
      executeInstallation(plan);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'project sentinel');
      assert.equal(fs.readFileSync(unselectedFile, 'utf8'), 'claude user file');

      // Blocked preflight preserves all outside files
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      fs.writeFileSync(fetchPs1, 'customized blocker file');
      const blockPlan = planFor(project);
      assert.throws(() => executeInstallation(blockPlan), /Installation blocked/);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'project sentinel');
      assert.equal(fs.readFileSync(unselectedFile, 'utf8'), 'claude user file');
      fs.unlinkSync(fetchPs1);
      // Rollback of actual replacement mutation preserves all outside files
      const skillFile = path.join(skillRoot(project), 'SKILL.md');
      fs.writeFileSync(skillFile, 'modified skill content');
      const updatePlan = planFor(project);
      assert.throws(() => executeInstallation(updatePlan, {
        force: true, yes: true,
        _beforeVerify: () => {
          assert.ok(fs.readFileSync(skillFile).equals(fs.readFileSync(path.join(packageRoot, 'SKILL.md'))));
          throw new Error('fail during replacement');
        }
      }), /fail during replacement/);
      assert.equal(fs.readFileSync(sentinel, 'utf8'), 'project sentinel');
      assert.equal(fs.readFileSync(unselectedFile, 'utf8'), 'claude user file');
      assert.equal(fs.readFileSync(skillFile, 'utf8'), 'modified skill content');
    });

    test('Case 16: identity change detection protects against same-byte file swaps', () => {
      const project = path.join(tempRoot, 'same-byte-swap-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const plan = planFor(project);

      assert.throws(() => executeInstallation(plan, {
        _beforeUnlink: (rAction) => {
          if (rAction.relativePath.includes('fetch-sonar-issues.ps1')) {
            // Unlink and recreate with same bytes but new inode
            fs.unlinkSync(fetchPs1);
            fs.writeFileSync(fetchPs1, HISTORICAL_FETCH_BYTES);
          }
        }
      }), /Retirement destination identity changed immediately before removal/);
    });

    test('Case 17: ancestor swap during publication or rollback aborts safely without corrupting outside paths', t => {
      const project = path.join(tempRoot, 'ancestor-swap-project');
      seedHistoricalHelpers(project, 'agents');
      const plan = planFor(project);

      const outsideDir = path.join(tempRoot, 'outside-ancestor-target');
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(path.join(outsideDir, 'outside.txt'), 'do not delete');

      let symlinkCreated = false;
      try {
        assert.throws(() => executeInstallation(plan, {
          _beforePublish: () => {
            // Replace skills directory with symlink to outside directory
            const skillsDir = path.join(project, '.agents', 'skills');
            fs.rmSync(skillsDir, { recursive: true, force: true });
            fs.symlinkSync(outsideDir, skillsDir, 'junction');
            symlinkCreated = true;
            throw new Error('trigger publication failure after ancestor swap');
          }
        }), /trigger publication failure after ancestor swap/);
      } catch (err) {
        if (!symlinkCreated) {
          t.skip('symlinks unavailable');
          return;
        }
        throw err;
      }

      // Outside directory contents must NOT be removed by rollback!
      assert.ok(fs.existsSync(path.join(outsideDir, 'outside.txt')));
      assert.equal(fs.readFileSync(path.join(outsideDir, 'outside.txt'), 'utf8'), 'do not delete');
      assert.deepEqual(fs.readdirSync(outsideDir), ['outside.txt'], 'Outside directory must not contain any new or restored files');
    });

    test('Case 18: destination recreated during restoration while descriptor is held open is preserved and never deleted', () => {
      const project = path.join(tempRoot, 'recreation-during-restore-project');
      seedHistoricalHelpers(project, 'agents');
      const fetchPs1 = path.join(skillRoot(project), 'scripts', 'fetch-sonar-issues.ps1');
      const plan = planFor(project);

      assert.throws(() => executeInstallation(plan, {
        _beforeRestoreWrite: (removalRecord, fd) => {
          fs.unlinkSync(removalRecord.destinationPath);
          fs.writeFileSync(removalRecord.destinationPath, 'external writer replaced during restore');
          throw new Error('trigger error after external replacement');
        },
        _beforePublish: () => { throw new Error('trigger rollback'); }
      }), /restoration failed; any existing destination left untouched: trigger error after external replacement/);

      assert.ok(fs.existsSync(fetchPs1));
      assert.equal(fs.readFileSync(fetchPs1, 'utf8'), 'external writer replaced during restore');
    });
  });
});
