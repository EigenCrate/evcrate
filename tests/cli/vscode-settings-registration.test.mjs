import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArguments } from '../../dist/cli/arguments.js';
import { dispatchInvocation } from '../../dist/cli/dispatch.js';
import { resolveInvocationContext } from '../../dist/context/invocation-context.js';
import { decodeJsonc } from '../../dist/distribution/jsonc.js';

test('parseArguments: parses registerVscodeSettings flags', () => {
  const invPositive = parseArguments(['publish', '--apply', '--target', 'vscode', '--register-vscode-settings']);
  assert.equal(invPositive.options.registerVscodeSettings, true);

  const invNegative = parseArguments(['publish', '--apply', '--target', 'vscode', '--no-register-vscode-settings']);
  assert.equal(invNegative.options.registerVscodeSettings, false);

  const invDefault = parseArguments(['publish', '--apply', '--target', 'vscode']);
  assert.equal(invDefault.options.registerVscodeSettings, undefined);
});

test('parseArguments: rejects duplicate or conflicting registerVscodeSettings flags', () => {
  assert.throws(
    () => parseArguments(['publish', '--apply', '--target', 'vscode', '--register-vscode-settings', '--no-register-vscode-settings']),
    (err) => err.code === 'USAGE_INVALID'
  );
  assert.throws(
    () => parseArguments(['publish', '--apply', '--target', 'vscode', '--register-vscode-settings', '--register-vscode-settings']),
    (err) => err.code === 'USAGE_INVALID'
  );
});

test('parseArguments: rejects registerVscodeSettings on non-publish commands', () => {
  assert.throws(
    () => parseArguments(['recover', '--register-vscode-settings']),
    (err) => err.code === 'USAGE_INVALID'
  );
  assert.throws(
    () => parseArguments(['resources', 'list', '--register-vscode-settings']),
    (err) => err.code === 'USAGE_INVALID'
  );
});

test('dispatchInvocation: rejects registerVscodeSettings if vscode target is not selected', async () => {
  const invocation = parseArguments(['publish', '--apply', '--target', 'claude', '--register-vscode-settings']);
  const context = resolveInvocationContext({
    ...invocation.options,
    cwd: process.cwd()
  });
  await assert.rejects(
    () => dispatchInvocation(invocation, context),
    (err) => err.code === 'USAGE_INVALID'
  );
});

test('dispatchInvocation: non-interactive mode skips settings registration by default', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-settings-test-'));
  try {
    const invocation = parseArguments(['publish', '--apply', '--target', 'vscode', '--scope', 'project', '--project-root', tempDir]);
    const context = resolveInvocationContext({
      ...invocation.options,
      cwd: tempDir
    });

    const runtime = {
      output: { isTTY: false, write: () => {} },
      vscodeSettingsConsole: {
        isInputTTY: false,
        isOutputTTY: false,
        isErrorTTY: false,
        confirm: async () => true,
        writeNotice: () => {}
      }
    };

    const outcome = await dispatchInvocation(invocation, context, runtime);
    assert.equal(outcome.exitCode, 0);

    const settingsPath = join(tempDir, '.vscode', 'settings.json');
    assert.equal(existsSync(settingsPath), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dispatchInvocation: explicit --register-vscode-settings registers without prompt even in non-TTY / json', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-settings-test-'));
  try {
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project', '--project-root', tempDir,
      '--register-vscode-settings', '--json'
    ]);
    const context = resolveInvocationContext({
      ...invocation.options,
      cwd: tempDir
    });

    let promptCalled = false;
    const runtime = {
      output: { isTTY: false, write: () => {} },
      vscodeSettingsConsole: {
        isInputTTY: false,
        isOutputTTY: false,
        isErrorTTY: false,
        confirm: async () => { promptCalled = true; return true; },
        writeNotice: () => {}
      }
    };

    const outcome = await dispatchInvocation(invocation, context, runtime);
    assert.equal(outcome.exitCode, 0);
    assert.equal(promptCalled, false);

    const settingsPath = join(tempDir, '.vscode', 'settings.json');
    assert.equal(existsSync(settingsPath), true);
    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(content['chat.pluginLocations'][join(tempDir, '.evcrate-vscode')], true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dispatchInvocation: interactive mode prompts and registers on confirmation', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-settings-test-'));
  try {
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project', '--project-root', tempDir
    ]);
    const context = resolveInvocationContext({
      ...invocation.options,
      cwd: tempDir
    });

    let promptCalled = false;
    let noticeEmitted = false;
    const runtime = {
      env: { CI: '' },
      output: { isTTY: true, write: () => {} },
      vscodeSettingsConsole: {
        isInputTTY: true,
        isOutputTTY: true,
        isErrorTTY: true,
        confirm: async (q) => {
          promptCalled = true;
          assert.ok(q.includes('chat.pluginLocations'));
          return true;
        },
        writeNotice: (n) => {
          noticeEmitted = true;
          assert.ok(n.includes('Registered'));
        }
      }
    };

    const outcome = await dispatchInvocation(invocation, context, runtime);
    assert.equal(outcome.exitCode, 0);
    assert.equal(promptCalled, true);
    assert.equal(noticeEmitted, true);

    const settingsPath = join(tempDir, '.vscode', 'settings.json');
    assert.equal(existsSync(settingsPath), true);
    const content = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.equal(content['chat.pluginLocations'][join(tempDir, '.evcrate-vscode')], true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dispatchInvocation: interactive mode prompts and skips on decline', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-settings-test-'));
  try {
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project', '--project-root', tempDir
    ]);
    const context = resolveInvocationContext({
      ...invocation.options,
      cwd: tempDir
    });

    let promptCalled = false;
    const runtime = {
      env: { CI: '' },
      output: { isTTY: true, write: () => {} },
      vscodeSettingsConsole: {
        isInputTTY: true,
        isOutputTTY: true,
        isErrorTTY: true,
        confirm: async () => {
          promptCalled = true;
          return false;
        },
        writeNotice: () => {}
      }
    };

    const outcome = await dispatchInvocation(invocation, context, runtime);
    assert.equal(outcome.exitCode, 0);
    assert.equal(promptCalled, true);

    const settingsPath = join(tempDir, '.vscode', 'settings.json');
    assert.equal(existsSync(settingsPath), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
