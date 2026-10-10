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
const skillFiles = [
  'SKILL.md',
  'references/sonar-cli-commands.md',
  'references/full-scan-workflow.md',
  'references/testing-and-coverage.md',
  'references/remediation-and-handoff.md',
  'references/report-formats.md',
  'references/worktree-remediation.md',
  'scripts/convert-sonar-report.mjs',
  'scripts/fetch-sonar-issues.ps1',
  'scripts/calculate-jacoco-coverage.ps1'
];
const skillRoot = project => path.join(project, '.agents', 'skills', 'sonarqube-test-quality');
const planFor = project => planInstallation({ sourceDir: packageRoot, target: 'agents', directory: project });

function assertNoRegistration(project) {
  for (const file of [
    '.claude', '.vscode', 'plugin.json', 'settings.json', '.agents/plugin.json', '.agents/settings.json',
    '.agents/skills/sonarqube-test-quality/plugin.json', '.agents/skills/sonarqube-test-quality/settings.json'
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
    assert.equal(result.committed.length, skillFiles.length);
    for (const file of skillFiles) {
      assert.ok(fs.readFileSync(path.join(skillRoot(project), file)).equals(fs.readFileSync(path.join(packageRoot, file))));
    }
    const repeated = executeInstallation(planFor(project));
    assert.equal(repeated.committed.length, 0);
    assert.equal(repeated.unchanged.length, skillFiles.length);
    assert.deepEqual(fs.readdirSync(project), ['.agents']);
    assert.deepEqual(fs.readdirSync(path.join(project, '.agents')), ['skills']);
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
    assert.deepEqual(result.additions, skillFiles.map(file => `skills/sonarqube-test-quality/${file}`));
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
    assert.throws(() => executeInstallation(plan, { force: true }), /requires confirmation/);
    assert.throws(() => executeInstallation(plan, { yes: true }), /without --force/);
    for (const flags of [[], ['--force'], ['--yes']]) {
      const result = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, ...flags], {
        cwd: tempRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Destination files differ|requires confirmation|without --force/);
      assert.equal(fs.readFileSync(destination, 'utf8'), 'user-owned change');
    }
    execFileSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--force', '--yes']);
    assert.ok(fs.readFileSync(destination).equals(fs.readFileSync(path.join(packageRoot, 'SKILL.md'))));
    assert.equal(fs.readFileSync(unrelated, 'utf8'), 'unrelated evidence');
    assert.equal(fs.readFileSync(existingInstallation, 'utf8'), 'pre-existing user installation');
  });

  test('rejects removed or missing targets and missing project roots without writing', () => {
    const project = path.join(tempRoot, 'project');
    fs.writeFileSync(path.join(tempRoot, 'unrelated.txt'), 'keep');
    for (const target of ['claude', 'directory', 'vscode', 'codex', '', undefined]) {
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
      const outside = path.join(tempRoot, 'outside');
      const destination = path.join(project, relativePath);
      const isFile = relativePath.endsWith('SKILL.md');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (isFile) fs.writeFileSync(outside, 'outside evidence');
      else fs.mkdirSync(outside);
      try {
        fs.symlinkSync(outside, destination, isFile ? 'file' : 'junction');
      } catch (error) {
        t.skip(`Symlinks are unavailable: ${error.code}`);
        return;
      }
      const plan = planFor(project);
      assert.ok(plan.blockers.length > 0);
      assert.throws(() => executeInstallation(plan, { force: true, yes: true }), /Installation blocked/);
      const result = spawnSync(process.execPath, [cliPath, '--target', 'agents', '--directory', project, '--force', '--yes'], {
        cwd: tempRoot, encoding: 'utf8'
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /unsafe destination/);
      if (isFile) assert.equal(fs.readFileSync(outside, 'utf8'), 'outside evidence');
      else assert.deepEqual(fs.readdirSync(outside), []);
      assert.ok(fs.lstatSync(destination).isSymbolicLink());
      assert.ok(!fs.existsSync(path.join(skillRoot(project), 'references')));
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
});
