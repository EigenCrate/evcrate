'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ADVISOR_DIR = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const {
  isWindows,
  canonicalWindowsEnvironmentContext,
  canonicalizeWindowsEnvironment,
  resolveWindowsLaunchRecord,
  verifyWindowsLaunchRecord,
  resolveWindowsExecutable,
  captureFileIdentity,
  verifyFileIdentity,
  SUPPORTED_BACKEND_PACKAGES
} = require(path.join(ADVISOR_DIR, 'windows-platform.cjs'));
const { createRunner, createInvocation } = require(path.join(ADVISOR_DIR, 'runner.cjs'));
const { runController } = require(path.join(ADVISOR_DIR, 'controller.cjs'));

function makeTempDir(prefix = 'evcrate-launch-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('Step 3.1: Four-provider package layouts and sibling rejection', async (t) => {
  if (process.platform !== 'win32') return;

  await t.test('Layout 1: Scoped npm layout for Codex with CMD-only resolves JS entrypoint', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'npm-global');
      const pkgDir = path.join(binDir, 'node_modules/@openai/codex');
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: 'bin/codex.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/codex.js'), 'console.log("codex-js");');
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.notEqual(record, null, 'Should resolve codex launch record');
      assert.equal(record.targetType, 'node-script');
      assert.equal(record.launcherPath.toLowerCase(), process.execPath.toLowerCase());
      assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin/codex.js')).toLowerCase());
      assert.equal(verifyWindowsLaunchRecord(record), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 2: Scoped npm layout for Codex with shell sibling rejects shell and resolves JS entrypoint', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'npm-global');
      const pkgDir = path.join(binDir, 'node_modules/@openai/codex');
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: 'bin/codex.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/codex.js'), 'console.log("codex-js");');
      // Create BOTH extensionless shell sibling AND .cmd
      fs.writeFileSync(path.join(binDir, 'codex'), '#!/bin/sh\nexec node "$0/../node_modules/@openai/codex/bin/codex.js" "$@"\n');
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\nnode "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.notEqual(record, null, 'Should resolve codex launch record');
      assert.equal(record.targetType, 'node-script');
      assert.notEqual(record.scriptPath.toLowerCase(), path.join(binDir, 'codex').toLowerCase(), 'Must NOT resolve to shell script');
      assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin/codex.js')).toLowerCase());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 3: Scoped npm layout for Claude with native bin resolves native target', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'npm-global');
      const pkgDir = path.join(binDir, 'node_modules/@anthropic-ai/claude-code');
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@anthropic-ai/claude-code',
        version: '2.1.283',
        bin: { claude: 'bin/claude.exe' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/claude.exe'), 'MZfake-binary-content');
      fs.writeFileSync(path.join(binDir, 'claude.cmd'), '@ECHO off\r\n"%~dp0\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*\r\n');

      const record = resolveWindowsLaunchRecord('claude', binDir);
      assert.notEqual(record, null);
      assert.equal(record.targetType, 'native');
      assert.equal(fs.realpathSync.native(record.launcherPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin/claude.exe')).toLowerCase());
      assert.equal(record.scriptPath, null);
      assert.equal(verifyWindowsLaunchRecord(record), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 4: Native standalone executable in PATH takes precedence', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, 'claude.exe'), 'MZfake-standalone-claude');

      const record = resolveWindowsLaunchRecord('claude', binDir);
      assert.notEqual(record, null);
      assert.equal(record.targetType, 'native');
      assert.equal(fs.realpathSync.native(record.launcherPath).toLowerCase(), fs.realpathSync.native(path.join(binDir, 'claude.exe')).toLowerCase());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 5: Pi scoped layout with cli.js entrypoint resolves correctly', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'current');
      const pkgDir = path.join(binDir, 'node_modules/@earendil-works/pi-coding-agent');
      fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@earendil-works/pi-coding-agent',
        version: '0.84.1',
        bin: { pi: 'dist/cli.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'dist/cli.js'), 'console.log("pi-cli");');
      fs.writeFileSync(path.join(binDir, 'pi'), '#!/bin/sh\nexec node dist/cli.js "$@"\n');
      fs.writeFileSync(path.join(binDir, 'pi.cmd'), '@ECHO off\r\nnode "%~dp0\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js" %*\r\n');

      const record = resolveWindowsLaunchRecord('pi', binDir);
      assert.notEqual(record, null);
      assert.equal(record.targetType, 'node-script');
      assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'dist/cli.js')).toLowerCase());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 6: Deprecated Pi namespace (@mariozechner/pi-coding-agent) is supported', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'current');
      const pkgDir = path.join(binDir, 'node_modules/@mariozechner/pi-coding-agent');
      fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@mariozechner/pi-coding-agent',
        version: '0.73.1',
        bin: { pi: 'dist/cli.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'dist/cli.js'), 'console.log("deprecated-pi");');
      fs.writeFileSync(path.join(binDir, 'pi.cmd'), '@ECHO off\r\nnode "%~dp0\\node_modules\\@mariozechner\\pi-coding-agent\\dist\\cli.js" %*\r\n');

      const record = resolveWindowsLaunchRecord('pi', binDir);
      assert.notEqual(record, null);
      assert.equal(record.targetType, 'node-script');
      assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'dist/cli.js')).toLowerCase());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Layout 7: Local node_modules/.bin layout resolves package from parent node_modules', () => {
    const root = makeTempDir();
    try {
      const nodeModules = path.join(root, 'node_modules');
      const binDir = path.join(nodeModules, '.bin');
      const pkgDir = path.join(nodeModules, '@openai/codex');
      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: 'bin/codex.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/codex.js'), 'console.log("local-codex");');
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\nnode "%~dp0\\..\\@openai\\codex\\bin\\codex.js" %*\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.notEqual(record, null);
      assert.equal(record.targetType, 'node-script');
      assert.equal(fs.realpathSync.native(record.scriptPath).toLowerCase(), fs.realpathSync.native(path.join(pkgDir, 'bin/codex.js')).toLowerCase());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Out-of-package bin path traversal is rejected', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'npm-global');
      const pkgDir = path.join(binDir, 'node_modules/@openai/codex');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(root, 'malicious.js'), 'console.log("escaped");');
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: '../../malicious.js' }
      }));
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.equal(record, null, 'Escaping bin target must be rejected');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Absolute path to non-executable is rejected', () => {
    const root = makeTempDir();
    try {
      const jsonFile = path.join(root, 'package.json');
      fs.writeFileSync(jsonFile, '{"name": "test"}');
      const record = resolveWindowsLaunchRecord(jsonFile);
      assert.equal(record, null, 'Arbitrary json file must not be accepted as executable');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Paths with spaces and non-ASCII characters resolve safely', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'Program Files (x86)', 'Tëst スペース');
      const pkgDir = path.join(binDir, 'node_modules/@openai/codex');
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: 'bin/codex.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/codex.js'), 'console.log("unicode-ok");');
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.notEqual(record, null);
      assert.equal(verifyWindowsLaunchRecord(record), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('Step 3.2: Environment alias resolution, conflicts, and absent vs empty PATH', async (t) => {
  if (process.platform !== 'win32') return;

  await t.test('Plain-object with Path canonicalizes to PATH without ambient fallback', () => {
    const ctx = canonicalWindowsEnvironmentContext({
      Path: 'C:\\test\\bin',
      home: 'C:\\Users\\test'
    }, { commonKeys: ['PATH', 'HOME'] });

    assert.equal(ctx.canonicalEnv.PATH, 'C:\\test\\bin');
    assert.equal(ctx.canonicalPath, 'C:\\test\\bin');
    assert.equal(ctx.hasExplicitPath, true);
  });

  await t.test('Conflicting aliases throw INVOCATION_INVALID', () => {
    assert.throws(() => {
      canonicalWindowsEnvironmentContext({
        Path: 'C:\\dir1',
        PATH: 'C:\\dir2'
      });
    }, (err) => err.code === 'INVOCATION_INVALID');

    assert.throws(() => {
      canonicalWindowsEnvironmentContext({
        My_Var: 'val1',
        MY_VAR: 'val2'
      });
    }, (err) => err.code === 'INVOCATION_INVALID');
  });

  await t.test('Identical alias values deduplicate without error', () => {
    const ctx = canonicalWindowsEnvironmentContext({
      Path: 'C:\\same',
      PATH: 'C:\\same'
    }, { commonKeys: ['PATH'] });

    assert.equal(ctx.canonicalEnv.PATH, 'C:\\same');
  });

  await t.test('Explicitly empty PATH does not fallback to ambient PATH', () => {
    const ctx = canonicalWindowsEnvironmentContext({
      PATH: ''
    }, { commonKeys: ['PATH'] });

    assert.equal(ctx.hasExplicitPath, true);
    assert.equal(ctx.canonicalPath, '');
    assert.equal(ctx.canonicalEnv.PATH, '');

    // Resolving a command with empty PATH must return null, not search ambient PATH
    const record = resolveWindowsLaunchRecord('node', ctx.canonicalEnv);
    assert.equal(record, null, 'Empty PATH must not find ambient node');
  });

  await t.test('Absent PATH in custom object does not search ambient PATH', () => {
    const ctx = canonicalWindowsEnvironmentContext({
      OTHER: 'foo'
    }, { commonKeys: ['PATH'] });

    assert.equal(ctx.hasExplicitPath, false);
    assert.equal(ctx.canonicalPath, null);
    assert.equal(ctx.canonicalEnv.PATH, undefined);

    const record = resolveWindowsLaunchRecord('node', ctx.canonicalEnv);
    assert.equal(record, null, 'Absent PATH in custom env must not search ambient PATH');
  });
});

test('Step 3.3: Immutable identity binding and same-path replacement drift detection', async (t) => {
  if (process.platform !== 'win32') return;

  await t.test('File replacement at same path is detected and rejected', () => {
    const root = makeTempDir();
    try {
      const scriptPath = path.join(root, 'script.js');
      fs.writeFileSync(scriptPath, 'console.log("original");');
      const identity = captureFileIdentity(scriptPath);
      assert.equal(verifyFileIdentity(identity), true);

      // Overwrite with different content
      fs.writeFileSync(scriptPath, 'console.log("tampered-content");');
      assert.equal(verifyFileIdentity(identity), false, 'Modified file must fail identity verification');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('File deletion at path is detected and rejected', () => {
    const root = makeTempDir();
    try {
      const scriptPath = path.join(root, 'script.js');
      fs.writeFileSync(scriptPath, 'console.log("original");');
      const identity = captureFileIdentity(scriptPath);
      fs.unlinkSync(scriptPath);
      assert.equal(verifyFileIdentity(identity), false, 'Deleted file must fail identity verification');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Package metadata replacement invalidates launch record', () => {
    const root = makeTempDir();
    try {
      const binDir = path.join(root, 'npm-global');
      const pkgDir = path.join(binDir, 'node_modules/@openai/codex');
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
      const pkgJson = path.join(pkgDir, 'package.json');
      fs.writeFileSync(pkgJson, JSON.stringify({
        name: '@openai/codex',
        version: '0.157.1',
        bin: { codex: 'bin/codex.js' }
      }));
      fs.writeFileSync(path.join(pkgDir, 'bin/codex.js'), 'console.log("ok");');
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@ECHO off\r\n');

      const record = resolveWindowsLaunchRecord('codex', binDir);
      assert.notEqual(record, null);
      assert.equal(verifyWindowsLaunchRecord(record), true);

      // Tamper package.json
      fs.writeFileSync(pkgJson, JSON.stringify({
        name: '@openai/codex',
        version: '0.157.2-tampered',
        bin: { codex: 'bin/codex.js' }
      }));
      assert.equal(verifyWindowsLaunchRecord(record), false, 'Tampered package.json must invalidate launch record');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Runner rejects invocation when launch record identity drifts', async () => {
    const root = makeTempDir();
    try {
      const scriptPath = path.join(root, 'codex.js');
      fs.writeFileSync(scriptPath, 'console.log("v1");');
      const runner = createRunner();
      const invocation = createInvocation({
        adapter: 'codex',
        executable: scriptPath,
        argv: ['--version'],
        cwd: root,
        workspaceRoot: root,
        prompt: '',
        authKeys: [],
        limits: { timeoutMs: 5000 }
      });

      const launchRecord = resolveWindowsLaunchRecord(scriptPath);
      assert.notEqual(launchRecord, null);
      assert.equal(verifyWindowsLaunchRecord(launchRecord), true);

      // Tamper script before running
      fs.writeFileSync(scriptPath, 'console.log("tampered-v2");');

      await assert.rejects(async () => {
        await runner.run(invocation, { launchRecord });
      }, (err) => err.code === 'EXECUTABLE_UNAVAILABLE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Controller fails with EXECUTABLE_UNAVAILABLE when script is replaced on disk before generation', async () => {
    const root = makeTempDir();
    const home = path.join(root, 'home');
    const tmp = path.join(root, 'tmp');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(path.join(home, '.evcrate'), { recursive: true });
    fs.mkdirSync(tmp, { recursive: true });
    fs.mkdirSync(bin, { recursive: true });

    const policy = {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
        backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
      history: { retention_days: 30, max_bytes: 104857600 }
    };
    fs.writeFileSync(path.join(home, '.evcrate/advisor-routing.json'), JSON.stringify(policy));

    const FAKE_CODEX = path.resolve(__dirname, 'fixtures/fake-codex.cjs');
    const codexScript = path.join(bin, 'codex.cjs');
    fs.copyFileSync(FAKE_CODEX, codexScript);
    fs.writeFileSync(path.join(home, '.evcrate/fake-codex-mode'), 'success\n');

    const env = {
      ...process.env,
      HOME: home,
      TMPDIR: tmp
    };
    delete env.Path;
    delete env.PATH;
    delete env.EVCRATE_ADVISOR_ACTIVE;
    delete env.EVCRATE_ADVISOR_DEPTH;
    env.PATH = `${bin}${path.delimiter}${process.env.PATH || ''}`;

    const CHECKPOINT = JSON.stringify({
      protocol: 'evcrate-advisor-checkpoint',
      version: 2,
      task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
      checkpoint_id: 'chk-001',
      phase_id: 'phase-01',
      task_revision: 1,
      evidence_revision: 1,
      checkpoint: 'review:step-4',
      kind: 'review',
      question: 'Is this contract transition safe and backward-compatible?',
      task: {
        goal: 'Freeze v2 contracts',
        non_goals: ['paid model inference'],
        authorized_paths: ['src/protocol/advisor-contracts.ts'],
        scope_rationale: 'Phase 01 requires freezing v2 contracts.',
        invariants: ['Zero dist/ imports from CJS controller'],
        success_criteria: ['TS/CJS parity verified']
      },
      proposal: {
        next_action: 'Proceed to code review gate',
        rationale: 'All tests pass',
        intended_changed_paths: ['src/protocol/advisor-contracts.ts']
      },
      evidence: {
        summary: '139 tests passing across all suites',
        files: [],
        validation_results: [],
        artifacts: []
      },
      prior: {
        prior_consultation_id: null,
        prior_counsel: null,
        prior_disposition: null,
        observed_outcome: null
      }
    });

    try {
      let tampered = false;
      const { getAdapter } = require(path.join(ADVISOR_DIR, 'adapter-registry.cjs'));
      const result = await runController(CHECKPOINT, {
        environment: env,
        createGenerationRunner: ({ runner, wait, now }) => {
          if (!tampered) {
            tampered = true;
            fs.writeFileSync(codexScript, 'console.log("malicious-replacement");');
          }
          const { createGenerationRunner } = require(path.join(ADVISOR_DIR, 'runner.cjs'));
          return createGenerationRunner({ runner, wait, now });
        },
        getAdapter: (name) => {
          if (name === 'omp') {
            return {
              name: 'omp',
              authKeys: [],
              probeVersion: async () => { throw new Error('omp-disabled'); },
              probeAuth: async () => {},
              probeCapabilities: async () => {},
              buildInvocation: () => {},
              parseResult: () => {},
              classifyFailure: () => 'AUTH_UNAVAILABLE'
            };
          }
          return getAdapter(name);
        }
      });

      assert.equal(result.status, 'FAILED');
      assert.equal(result.attempts.length >= 1, true);
      assert.equal(result.attempts[0].slot, 'primary');
      assert.equal(result.attempts[0].phase, 'preflight');
      assert.equal(result.attempts[0].terminal_classification, 'skipped');
      assert.equal(result.attempts[0].model_started, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

test('Step 3.4: Codex tool guard under physical launch and actual launch smoke', async (t) => {
  if (process.platform !== 'win32') return;

  await t.test('Codex tool guard catches forbidden tool event under node-script physical prefix', async () => {
    const root = makeTempDir();
    try {
      const scriptPath = path.join(root, 'fake-codex-tool.js');
      // A script that outputs a forbidden command_execution tool event
      fs.writeFileSync(scriptPath, [
        'console.log(JSON.stringify({ type: "item.started", item: { type: "command_execution", id: "item-1" } }));',
        'console.log(JSON.stringify({ type: "turn.completed" }));'
      ].join('\n'));

      const runner = createRunner();
      const invocation = createInvocation({
        adapter: 'codex',
        executable: scriptPath,
        argv: ['exec', '--json'],
        cwd: root,
        workspaceRoot: root,
        prompt: '',
        authKeys: [],
        limits: { timeoutMs: 5000 }
      });

      const launchRecord = resolveWindowsLaunchRecord(scriptPath);
      assert.notEqual(launchRecord, null);

      const result = await runner.run(invocation, { launchRecord });
      assert.notEqual(result.error, null);
      assert.equal(result.error.code, 'READ_ONLY_UNSUPPORTED', 'Forbidden tool call must be caught by stdoutGuard');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('Actual harmless Node execution through launch record succeeds with confirmed cleanup', async () => {
    const root = makeTempDir();
    try {
      const scriptPath = path.join(root, 'harmless.js');
      fs.writeFileSync(scriptPath, 'console.log("smoke-launch-success");');

      const runner = createRunner();
      const invocation = createInvocation({
        adapter: 'codex',
        executable: scriptPath,
        argv: ['--version'],
        cwd: root,
        workspaceRoot: root,
        prompt: '',
        authKeys: [],
        limits: { timeoutMs: 5000 }
      });

      const launchRecord = resolveWindowsLaunchRecord(scriptPath);
      assert.notEqual(launchRecord, null);

      const result = await runner.run(invocation, { launchRecord });
      assert.equal(result.error, undefined);
      assert.equal(result.result.stdout.trim(), 'smoke-launch-success');
      assert.equal(result.result.exitCode, 0);
      assert.equal(result.cleanupOutcome, 'confirmed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
