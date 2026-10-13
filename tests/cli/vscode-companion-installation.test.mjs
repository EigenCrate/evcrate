import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { parseArguments } from '../../dist/cli/arguments.js';
import { dispatchInvocation } from '../../dist/cli/dispatch.js';
import { resolveInvocationContext } from '../../dist/context/invocation-context.js';
import { coordinateVscodeCompanionInstallation } from '../../dist/cli/vscode-companion-installation.js';
import { resolveVscodeEditorLaunchTarget } from '../../dist/cli/vscode-editor-launcher.js';
import { validateCompanionInstallNotice } from '../../dist/adapters/vscode/companion-cli-contracts.js';

function createMockPublication(tempDir, options = {}) {
  const pluginDir = join(tempDir, '.evcrate-vscode');
  const companionDir = join(pluginDir, 'evcrate', 'companion');
  mkdirSync(companionDir, { recursive: true });

  const vsixBytes = options.vsixBytes ?? Buffer.from('mock-vsix-content-for-companion');
  const vsixSha256 = createHash('sha256').update(vsixBytes).digest('hex');
  const version = options.version ?? '2.11.0';
  const vsixName = `evcrate-model-bindings-${version}.vsix`;
  writeFileSync(join(companionDir, vsixName), vsixBytes);

  const descriptor = {
    schema: 'evcrate-vscode-companion-descriptor-v1',
    extensionId: 'eigencrate.evcrate-model-bindings',
    version,
    buildIdentity: options.buildIdentity ?? 'a'.repeat(64),
    vsixRelativePath: `evcrate/companion/${vsixName}`,
    vsixSha256: options.tamperedDescriptorHash ?? vsixSha256,
    supportedHost: {
      vscodeVersion: '1.140.0',
      vscodeCommit: '07f806f999227108933c2e30515b26eecc1fda74',
      copilotChatVersion: '0.68.0',
      apiProposal: 'chatPromptFiles',
      extensionKind: ['workspace']
    },
    intentSchema: 'evcrate-vscode-agent-intent-v1'
  };
  writeFileSync(join(companionDir, 'package.json'), JSON.stringify(descriptor, null, 2));

  return { pluginDir, companionDir, descriptor, vsixSha256 };
}

function createFakeResourceResult(operation = 'publish.apply', status = 'published') {
  return {
    protocol: 'evcrate-resource-control',
    protocolVersion: 1,
    requestId: 'req-1',
    operation,
    status,
    payload: {
      action: 'published',
      scope: 'project',
      bindings: []
    }
  };
}

test('coordinateVscodeCompanionInstallation: skips when vscode target is not selected', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    const invocation = parseArguments(['publish', '--apply', '--target', 'claude']);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();
    const outcome = await coordinateVscodeCompanionInstallation(invocation, context, result, {}, 'req-1');
    assert.equal(outcome, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: skips when publication status is preview/dry-run', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    const invocation = parseArguments(['publish', '--dry-run', '--target', 'vscode', '--install-vscode-companion']);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult('publish.dry-run', 'preview');
    const outcome = await coordinateVscodeCompanionInstallation(invocation, context, result, {}, 'req-1');
    assert.equal(outcome, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: explicit-skip flag emits skipped notice without probing', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--no-install-vscode-companion'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    let runnerCalled = false;
    const runtime = {
      vscodeCompanionConsole: {
        isOutputTTY: false,
        confirm: async () => false,
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async () => {
          runnerCalled = true;
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, undefined);
    assert.equal(runnerCalled, false);
    assert.ok(noticeOutput.includes('skipped'));
    const parsedNotice = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsedNotice);
    assert.equal(parsedNotice.status, 'skipped');
    assert.equal(parsedNotice.requested, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: non-interactive environment skips by default', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project', '--project-root', tempDir
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        isInputTTY: false,
        isOutputTTY: false,
        isErrorTTY: false,
        confirm: async () => false,
        writeStderr: (t) => { noticeOutput += t; }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, undefined);
    assert.ok(noticeOutput.includes('skipped'));
    const parsed = JSON.parse(noticeOutput);
    assert.equal(parsed.status, 'skipped');
    assert.equal(parsed.requested, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: unsupported remote context rejects with exit 5 when requested', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      env: { SSH_CONNECTION: '192.168.1.1 1234 192.168.1.2 22' },
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'manual-setup-required');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 5);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: rejects tampered VSIX hash with exit 5 when requested', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir, { tamperedDescriptorHash: 'b'.repeat(64) });
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 5);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: succeeds with explicit install and processRunner', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code', '--vscode-profile', 'test-prof'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const executedCommands = [];
    let installed = false;
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          executedCommands.push({ executable: opts.executable, args: opts.args });
          if (opts.args.includes('--version')) {
            return { exitCode: 0, signal: null, stdout: '1.140.0\ncommit\nx64', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--list-extensions')) {
            const stdout = installed
              ? 'other.extension@1.0.0\neigencrate.evcrate-model-bindings@2.11.0\n'
              : 'other.extension@1.0.0\n';
            return { exitCode: 0, signal: null, stdout, stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--install-extension')) {
            installed = true;
            return { exitCode: 0, signal: null, stdout: 'Extension installed successfully\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, undefined);
    assert.equal(executedCommands.length, 4);
    assert.deepEqual(executedCommands[0].args, ['--version']);
    assert.deepEqual(executedCommands[1].args, ['--profile', 'test-prof', '--list-extensions', '--show-versions']);
    assert.equal(executedCommands[2].args[0], '--profile');
    assert.equal(executedCommands[2].args[1], 'test-prof');
    assert.equal(executedCommands[2].args[2], '--install-extension');
    // Verify staged path is used, not published path
    assert.ok(executedCommands[2].args[3].includes('evcrate-companion-stage-'));
    // Post-install verification command
    assert.deepEqual(executedCommands[3].args, ['--profile', 'test-prof', '--list-extensions', '--show-versions']);

    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'installed');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: detects already-installed with verified build identity', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    const buildIdentity = 'c'.repeat(64);
    createMockPublication(tempDir, { buildIdentity });

    // Create extensions directory with matching package.json
    const extensionsDir = join(tempDir, 'mock-extensions');
    const installedExtDir = join(extensionsDir, 'eigencrate.evcrate-model-bindings-2.11.0');
    mkdirSync(installedExtDir, { recursive: true });
    writeFileSync(join(installedExtDir, 'package.json'), JSON.stringify({ buildIdentity }));

    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    let installAttempted = false;
    const runtime = {
      extensionsDirectory: extensionsDir,
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) {
            return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--list-extensions')) {
            return { exitCode: 0, signal: null, stdout: 'eigencrate.evcrate-model-bindings@2.11.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--install-extension')) {
            installAttempted = true;
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, undefined);
    assert.equal(installAttempted, false);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'already-installed');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: matching version with unverified build identity reports manual-setup-required (exit 5)', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    const buildIdentity = 'd'.repeat(64);
    createMockPublication(tempDir, { buildIdentity });

    // Empty extensions dir (build identity cannot be verified)
    const extensionsDir = join(tempDir, 'empty-extensions');
    mkdirSync(extensionsDir, { recursive: true });

    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      extensionsDirectory: extensionsDir,
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) {
            return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--list-extensions')) {
            return { exitCode: 0, signal: null, stdout: 'eigencrate.evcrate-model-bindings@2.11.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'manual-setup-required');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 5);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: user declines prompt in interactive mode', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    let promptQuestion = '';
    const runtime = {
      env: { CI: '' },
      vscodeCompanionConsole: {
        isInputTTY: true,
        isOutputTTY: true,
        isErrorTTY: true,
        confirm: async (q) => {
          promptQuestion = q;
          return false; // User declines
        },
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--list-extensions')) return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, undefined);
    assert.ok(promptQuestion.includes('Companion Extension: eigencrate.evcrate-model-bindings'));
    assert.ok(promptQuestion.includes('--enable-proposed-api=eigencrate.evcrate-model-bindings'));
    assert.ok(noticeOutput.includes('declined'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: processRunner install failure returns exit 5 when requested', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--list-extensions')) return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--install-extension')) {
            return { exitCode: 1, signal: null, stdout: '', stderr: 'Error: corrupt VSIX archive\n', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.equal(parsed.requested, true);
    assert.equal(parsed.exitCode, 5);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: post-install verification failure fails closed with exit 5', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          // Both pre-install and post-install return empty list (extension not found after install)
          if (opts.args.includes('--list-extensions')) return { exitCode: 0, signal: null, stdout: 'unrelated@1.0.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--install-extension')) return { exitCode: 0, signal: null, stdout: 'Installed\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.ok(parsed.reason.includes('not detected in target extensions list'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: list-extensions failure fails closed with exit 5', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--list-extensions')) {
            return { exitCode: 1, signal: null, stdout: '', stderr: 'mock list error', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.ok(parsed.reason.includes('Failed to list extensions'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: uncaught exception guard prevents process crash and preserves exit 5', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async () => {
          throw new Error('Unexpected fatal runner crash');
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.ok(parsed.reason.includes('Unexpected fatal runner crash'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: post-install non-zero exit or timeout fails closed with exit 5', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir);
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    let installDone = false;
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--list-extensions')) {
            if (installDone) {
              // Post-install re-probe fails with error/timeout
              return { exitCode: 1, signal: null, stdout: '', stderr: 're-probe failure', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
            }
            return { exitCode: 0, signal: null, stdout: 'other@1.0.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--install-extension')) {
            installDone = true;
            return { exitCode: 0, signal: null, stdout: 'Installed\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.ok(parsed.reason.includes('Post-install verification re-probe failed'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: post-install older version match fails closed with exit 5', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-comp-test-'));
  try {
    createMockPublication(tempDir); // version is 2.11.0
    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', '/mock/bin/code'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    let installDone = false;
    const runtime = {
      vscodeCompanionConsole: {
        writeStderr: (t) => { noticeOutput += t; }
      },
      processRunner: {
        run: async (opts) => {
          if (opts.args.includes('--version')) return { exitCode: 0, signal: null, stdout: '1.140.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          if (opts.args.includes('--list-extensions')) {
            if (installDone) {
              // Returns older version 2.10.0 instead of 2.11.0
              return { exitCode: 0, signal: null, stdout: 'eigencrate.evcrate-model-bindings@2.10.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
            }
            return { exitCode: 0, signal: null, stdout: 'other@1.0.0\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          if (opts.args.includes('--install-extension')) {
            installDone = true;
            return { exitCode: 0, signal: null, stdout: 'Installed\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
          return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
        }
      }
    };

    const exitCode = await coordinateVscodeCompanionInstallation(invocation, context, result, runtime, 'req-1');
    assert.equal(exitCode, 5);
    const parsed = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(parsed);
    assert.equal(parsed.status, 'failed');
    assert.ok(parsed.reason.includes('eigencrate.evcrate-model-bindings@2.11.0 was not detected'));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: resolves Windows code.cmd on host-native filesystem paths', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-win-cmd-'));
  try {
    createMockPublication(tempDir);

    // 1. Versioned layout with spaces in directory path
    const versionedInstallRoot = join(tempDir, 'Program Files', 'Microsoft VS Code');
    const versionedBinDir = join(versionedInstallRoot, 'bin');
    const versionedCliDir = join(versionedInstallRoot, '07f806f999', 'resources', 'app', 'out');
    mkdirSync(versionedBinDir, { recursive: true });
    mkdirSync(versionedCliDir, { recursive: true });
    const versionedExe = join(versionedInstallRoot, 'Code.exe');
    const versionedCliJs = join(versionedCliDir, 'cli.js');
    const versionedCmd = join(versionedBinDir, 'code.cmd');
    writeFileSync(versionedExe, 'MZ-mock-exe');
    writeFileSync(versionedCliJs, '// mock cli.js');
    writeFileSync(
      versionedCmd,
      '@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0..\\Code.exe" "%~dp0..\\07f806f999\\resources\\app\\out\\cli.js" %*\r\nendlocal\r\n'
    );

    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', versionedCmd, '--vscode-profile', 'prof-alpha'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
    const result = createFakeResourceResult();

    let noticeOutput = '';
    const calls = [];
    let installed = false;
    const exitCode = await coordinateVscodeCompanionInstallation(
      invocation,
      context,
      result,
      {
        platform: 'win32',
        vscodeCompanionConsole: { writeStderr: (t) => { noticeOutput += t; } },
        processRunner: {
          run: async (opts) => {
            calls.push(opts);
            if (opts.args.includes('--version')) {
              return { exitCode: 0, signal: null, stdout: '1.140.0\n07f806f999227108933c2e30515b26eecc1fda74\nx64', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
            }
            if (opts.args.includes('--list-extensions')) {
              return { exitCode: 0, signal: null, stdout: installed ? 'eigencrate.evcrate-model-bindings@2.11.0\n' : '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
            }
            if (opts.args.includes('--install-extension')) {
              installed = true;
              return { exitCode: 0, signal: null, stdout: 'Installed\n', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
            }
            return { exitCode: 0, signal: null, stdout: '', stderr: '', stdoutBytes: new Uint8Array(), stderrBytes: new Uint8Array(), termination: 'completed', timedOut: false, aborted: false };
          }
        }
      },
      'req-win-1'
    );
    assert.equal(exitCode, undefined, noticeOutput);
    assert.equal(calls.length, 4);
    for (const call of calls) {
      assert.equal(call.executable, versionedExe, JSON.stringify(call));
      assert.equal(call.args[0], versionedCliJs, JSON.stringify(call));
      assert.equal(call.env?.ELECTRON_RUN_AS_NODE, '1', JSON.stringify(call));
      assert.equal(call.allowElectronRunAsNode, true, JSON.stringify(call));
    }
    assert.deepEqual(calls[0].args, [versionedCliJs, '--version']);
    for (const call of calls.slice(1)) {
      assert.deepEqual(call.args.slice(1, 3), ['--profile', 'prof-alpha'], JSON.stringify(call));
    }
    const versionedNotice = JSON.parse(noticeOutput);
    validateCompanionInstallNotice(versionedNotice);
    assert.equal(versionedNotice.status, 'installed', noticeOutput);


    const brokenRoot = join(tempDir, 'BrokenCode');
    mkdirSync(join(brokenRoot, 'bin'), { recursive: true });
    const brokenCmd = join(brokenRoot, 'bin', 'code.cmd');
    writeFileSync(brokenCmd, '@echo off\r\n"%~dp0..\\Missing.exe" %*\r\n');
    const brokenInv = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', tempDir, '--install-vscode-companion',
      '--vscode-editor', brokenCmd
    ]);
    let brokenNotice = '';
    let brokenProcessCalls = 0;
    const brokenExit = await coordinateVscodeCompanionInstallation(
      brokenInv,
      context,
      result,
      {
        platform: 'win32',
        vscodeCompanionConsole: { writeStderr: (text) => { brokenNotice += text; } },
        processRunner: {
          run: async () => {
            brokenProcessCalls += 1;
            throw new Error('unexpected process invocation for missing layout');
          }
        }
      },
      'req-win-2'
    );
    assert.equal(brokenExit, 5, brokenNotice);
    assert.equal(brokenProcessCalls, 0, brokenNotice);
    const parsedBrokenNotice = JSON.parse(brokenNotice);
    validateCompanionInstallNotice(parsedBrokenNotice);
    assert.equal(parsedBrokenNotice.status, 'failed', brokenNotice);
    assert.ok(parsedBrokenNotice.reason.includes('could not be resolved'), brokenNotice);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveVscodeEditorLaunchTarget: handles forward and mixed separators in versioned Windows wrappers', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-win-separators-'));
  try {
    const installRoot = join(tempDir, 'Microsoft VS Code');
    const binDir = join(installRoot, 'bin');
    const cliDir = join(installRoot, '07f806f999', 'resources', 'app', 'out');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(cliDir, { recursive: true });
    const executable = join(installRoot, 'Code.exe');
    const cliJs = join(cliDir, 'cli.js');
    const wrapper = join(binDir, 'code.cmd');
    writeFileSync(executable, 'MZ-mock-exe');
    writeFileSync(cliJs, '// mock cli.js');

    const variants = [
      {
        name: 'forward-slash',
        executablePath: '../Code.exe',
        cliPath: '../07f806f999/resources/app/out/cli.js'
      },
      {
        name: 'mixed-separator',
        executablePath: '..\\Code.exe',
        cliPath: '../07f806f999\\resources/app\\out/cli.js'
      }
    ];
    for (const variant of variants) {
      writeFileSync(
        wrapper,
        `@echo off\r\n"%~dp0${variant.executablePath}" "%~dp0${variant.cliPath}" %*\r\n`
      );
      const target = resolveVscodeEditorLaunchTarget(wrapper, 'win32');
      assert.equal(target.ok, true, `${variant.name}: ${JSON.stringify(target)}`);
      assert.equal(target.executable, executable, variant.name);
      assert.deepEqual(target.prefixArgs, [cliJs], variant.name);
      assert.deepEqual(target.envOverrides, { ELECTRON_RUN_AS_NODE: '1' }, variant.name);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveVscodeEditorLaunchTarget: resolves unversioned Windows wrapper and fallback layouts', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-win-unversioned-'));
  try {
    const installRoot = join(tempDir, 'Microsoft VS Code');
    const binDir = join(installRoot, 'bin');
    const cliDir = join(installRoot, 'resources', 'app', 'out');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(cliDir, { recursive: true });
    const executable = join(installRoot, 'Code.exe');
    const cliJs = join(cliDir, 'cli.js');
    const wrapper = join(binDir, 'code.cmd');
    writeFileSync(executable, 'MZ-mock-exe');
    writeFileSync(cliJs, '// mock cli.js');

    writeFileSync(
      wrapper,
      '@echo off\r\n"%~dp0..\\Code.exe" "%~dp0..\\resources\\app\\out\\cli.js" %*\r\n'
    );
    let target = resolveVscodeEditorLaunchTarget(wrapper, 'win32');
    assert.equal(target.ok, true, JSON.stringify(target));
    assert.equal(target.executable, executable);
    assert.deepEqual(target.prefixArgs, [cliJs]);
    assert.deepEqual(target.envOverrides, { ELECTRON_RUN_AS_NODE: '1' });

    writeFileSync(wrapper, '@echo off\r\nrem no supported operands\r\n');
    target = resolveVscodeEditorLaunchTarget(wrapper, 'win32');
    assert.equal(target.ok, true, JSON.stringify(target));
    assert.equal(target.executable, executable);
    assert.deepEqual(target.prefixArgs, [cliJs]);
    assert.deepEqual(target.envOverrides, { ELECTRON_RUN_AS_NODE: '1' });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('coordinateVscodeCompanionInstallation: fails closed on Windows wrapper traversal and missing layouts', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-cli-win-traversal-'));
  try {
    createMockPublication(tempDir);
    const outsideExe = join(tempDir, 'OutsideCode.exe');
    const outsideCli = join(tempDir, 'resources', 'app', 'out', 'cli.js');
    mkdirSync(join(tempDir, 'resources', 'app', 'out'), { recursive: true });
    writeFileSync(outsideExe, 'MZ-outside-exe');
    writeFileSync(outsideCli, '// outside cli.js');
    const result = createFakeResourceResult();

    const scenarios = [
      {
        name: 'executable-escape-forward',
        executablePath: '../../OutsideCode.exe',
        cliPath: '../resources/app/out/cli.js',
        createInternalExecutable: false,
        createInternalCli: true
      },
      {
        name: 'cli-escape-forward',
        executablePath: '../Code.exe',
        cliPath: '../../resources/app/out/cli.js',
        createInternalExecutable: true,
        createInternalCli: false
      },
      {
        name: 'executable-escape-backslash',
        executablePath: '..\\..\\OutsideCode.exe',
        cliPath: '..\\resources\\app\\out\\cli.js',
        createInternalExecutable: false,
        createInternalCli: true
      },
      {
        name: 'cli-escape-mixed-separators',
        executablePath: '..\\Code.exe',
        cliPath: '..\\..\\resources/app\\out/cli.js',
        createInternalExecutable: true,
        createInternalCli: false
      },
      {
        name: 'missing-layout',
        executablePath: '../Missing.exe',
        cliPath: null,
        createInternalExecutable: false,
        createInternalCli: false
      }
    ];
    for (const scenario of scenarios) {
      const installRoot = join(tempDir, scenario.name);
      const binDir = join(installRoot, 'bin');
      mkdirSync(binDir, { recursive: true });
      if (scenario.createInternalExecutable) {
        writeFileSync(join(installRoot, 'Code.exe'), 'MZ-internal-exe');
      }
      if (scenario.createInternalCli) {
        const internalCli = join(installRoot, 'resources', 'app', 'out', 'cli.js');
        mkdirSync(join(installRoot, 'resources', 'app', 'out'), { recursive: true });
        writeFileSync(internalCli, '// internal cli.js');
      }
      const wrapper = join(binDir, 'code.cmd');
      const wrapperBody = scenario.cliPath
        ? `@echo off\r\n"%~dp0${scenario.executablePath}" "%~dp0${scenario.cliPath}" %*\r\n`
        : `@echo off\r\n"%~dp0${scenario.executablePath}" %*\r\n`;
      writeFileSync(wrapper, wrapperBody);
      const invocation = parseArguments([
        'publish', '--apply', '--target', 'vscode', '--scope', 'project',
        '--project-root', tempDir, '--install-vscode-companion',
        '--vscode-editor', wrapper
      ]);
      const context = resolveInvocationContext({ ...invocation.options, projectRoot: tempDir });
      let noticeOutput = '';
      let processCalls = 0;
      const exitCode = await coordinateVscodeCompanionInstallation(
        invocation,
        context,
        result,
        {
          platform: 'win32',
          vscodeCompanionConsole: { writeStderr: (text) => { noticeOutput += text; } },
          processRunner: {
            run: async () => {
              processCalls += 1;
              throw new Error(`unexpected process invocation for ${scenario.name}`);
            }
          }
        },
        `req-win-${scenario.name}`
      );
      assert.equal(exitCode, 5, noticeOutput);
      assert.equal(processCalls, 0, noticeOutput);
      const notice = JSON.parse(noticeOutput);
      validateCompanionInstallNotice(notice);
      assert.equal(notice.status, 'failed', noticeOutput);
      assert.ok(notice.reason.includes('could not be resolved'), noticeOutput);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
