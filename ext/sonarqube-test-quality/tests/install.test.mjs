import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { executeInstallation, isSupportedNodeVersion, MIN_NODE_VERSION, planInstallation, resolveInstallTarget } from '../lib/install.js';

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
  { source: 'scripts/fetch-sonar-issues.ps1', dest: 'skills/sonarqube-test-quality/scripts/fetch-sonar-issues.ps1' },
  { source: 'scripts/calculate-jacoco-coverage.ps1', dest: 'skills/sonarqube-test-quality/scripts/calculate-jacoco-coverage.ps1' },
  { source: 'references/remediation-cycles.md', dest: 'skills/sonarqube-test-quality/references/remediation-cycles.md' },
  { source: 'references/project-discovery.md', dest: 'skills/sonarqube-test-quality/references/project-discovery.md' },
  { source: 'references/local-analysis.md', dest: 'skills/sonarqube-test-quality/references/local-analysis.md' },
  { source: 'references/run-guidance.md', dest: 'skills/sonarqube-test-quality/references/run-guidance.md' },
  { source: 'agents/sonar-evidence.md', dest: 'skills/sonarqube-test-quality/agents/sonar-evidence.md' },
  { source: 'templates/remediation-cycle-report.md', dest: 'skills/sonarqube-test-quality/templates/remediation-cycle-report.md' },
  { source: 'commands/cmd-sonar-remediate/SKILL.md', dest: 'skills/cmd-sonar-remediate/SKILL.md' }
];

const skillRoot = project => path.join(project, '.agents', 'skills', 'sonarqube-test-quality');
const planFor = project => planInstallation({ sourceDir: packageRoot, target: 'agents', directory: project });

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
    assert.deepEqual(fs.readdirSync(path.join(skillRoot(project), 'templates')), ['remediation-cycle-report.md']);
    const repeated = executeInstallation(planFor(project));
    assert.equal(repeated.committed.length, 0);
    assert.equal(repeated.unchanged.length, EXPECTED_ASSETS.length);
    assert.deepEqual(fs.readdirSync(project), ['.agents']);
    assert.deepEqual(fs.readdirSync(path.join(project, '.agents')), ['skills']);
    assert.deepEqual(fs.readdirSync(path.join(project, '.agents', 'skills')).sort(), ['cmd-sonar-remediate', 'sonarqube-test-quality']);
    assertNoRegistration(project);
  });

  test('CLI installs a standalone converter consuming Sonar evidence outside the source tree', () => {
    const project = path.join(tempRoot, 'project');
    execFileSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project], { cwd: tempRoot, encoding: 'utf8' });
    const converter = path.join(skillRoot(project), 'scripts', 'convert-sonar-report.mjs');
    assert.ok(!fs.existsSync(path.join(skillRoot(project), 'lib')));
    const evidence = {
      run: { target: 'demo-project', branch: 'feature-report', revision: 'abcdef0123456789' },
      issues: [{
        paging: { pageIndex: 1, pageSize: 2, total: 2 },
        issues: [
          { key: 'finding-first', component: 'demo-project:src/example.js', rule: 'javascript:S3776',
            message: 'First finding evidence', severity: 'MAJOR',
            impacts: [{ softwareQuality: 'MAINTAINABILITY', severity: 'HIGH' }],
            textRange: { startLine: 17, endLine: 19 }, flows: [{ locations: [
              { component: 'demo-project:src/helper.js', textRange: { startLine: 7 }, msg: 'Nested finding evidence' }
            ] }] },
          { key: 'finding-second', component: 'demo-project:src/other.js', severity: 'MINOR',
            message: 'Second finding evidence' }
        ]
      }],
      hotspots: [{ paging: { pageIndex: 1, pageSize: 2, total: 0 }, hotspots: [] }],
      measures: [{ component: { key: 'demo-project', measures: [
        { metric: 'coverage', value: '98' }, { metric: 'uncovered_lines', value: '0' }
      ] } }]
    };
    const input = JSON.stringify(evidence);
    const json = execFileSync(process.execPath, [converter, '--input', '-', '--format', 'json'], {
      cwd: tempRoot, input, encoding: 'utf8'
    });
    assert.deepEqual(JSON.parse(json), evidence);
    const markdown = execFileSync(process.execPath, [converter, '--input', '-'], { cwd: tempRoot, input, encoding: 'utf8' });
    for (const value of [
      'demo-project', 'feature-report', 'abcdef0123456789', 'finding-first', 'finding-second',
      'src/example.js', 'src/helper.js', 'javascript:S3776', 'MAINTAINABILITY', 'HIGH',
      'First finding evidence', 'Nested finding evidence', 'Second finding evidence',
      'coverage', '98', 'uncovered_lines'
    ]) assert.ok(markdown.includes(value), `Installed converter retains evidence: ${value}`);
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
    const retiredReport = path.join(skillRoot(project), 'templates', 'run-guidance-report.md');
    fs.writeFileSync(destination, 'user-owned change');
    fs.writeFileSync(unrelated, 'unrelated evidence');
    fs.mkdirSync(path.dirname(existingInstallation), { recursive: true });
    fs.writeFileSync(existingInstallation, 'pre-existing user installation');
    fs.writeFileSync(retiredReport, 'unmanaged prior-install report');
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
    assert.equal(fs.readFileSync(retiredReport, 'utf8'), 'unmanaged prior-install report');
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

  test('enforces Node.js >=18.11.0 compatibility in metadata and runtime validator', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '>=18.11.0');
    assert.equal(MIN_NODE_VERSION, '18.11.0');
    assert.equal(isSupportedNodeVersion('18.0.0'), false);
    assert.equal(isSupportedNodeVersion('18.10.0'), false);
    assert.equal(isSupportedNodeVersion('18.10.9'), false);
    assert.equal(isSupportedNodeVersion('18.11.0'), true);
    assert.equal(isSupportedNodeVersion('18.11.0-alpha.1'), true);
    assert.equal(isSupportedNodeVersion('18.10.0-rc.1'), false);
    assert.equal(isSupportedNodeVersion('v18.11.0'), true);
    assert.equal(isSupportedNodeVersion('v18.10.0'), false);
    assert.equal(isSupportedNodeVersion('18.12.0'), true);
    assert.equal(isSupportedNodeVersion('20.0.0'), true);
    assert.equal(isSupportedNodeVersion('22.19.0'), true);
    assert.equal(isSupportedNodeVersion(), true);
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

  test('installs both targets with the full payload and dual discovery messaging', () => {
    const project = path.join(tempRoot, 'both-project');
    const plan = planInstallation({ sourceDir: packageRoot, target: 'both', directory: project });
    assert.equal(plan.installationRoot, project);
    assert.equal(plan.actions.length, EXPECTED_ASSETS.length * 2);
    assert.equal(plan.additions.length, EXPECTED_ASSETS.length * 2);

    const cliResult = spawnSync(process.execPath, [cliPath, '--target', 'both', '--directory', project], {
      cwd: tempRoot, encoding: 'utf8'
    });
    assert.equal(cliResult.status, 0);
    assert.match(cliResult.stdout, /Installed 34 file\(s\)/);
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
    assert.match(cliResult.stdout, /Installed 34 file\(s\)/);
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
    assert.equal(fileCount, EXPECTED_ASSETS.length * 2);
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
    assert.match(cliResult.stdout, /Installed 17 file\(s\)/);
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
});
