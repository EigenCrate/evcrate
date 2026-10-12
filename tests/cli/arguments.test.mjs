import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments } from '../../dist/cli/arguments.js';

function codeOf(callback) {
  try { callback(); } catch (error) { return error.code; }
  return undefined;
}

test('parses commands and all supported scalar options', () => {
  const invocation = parseArguments([
    '--source', '/tmp/source', '--home=/tmp/home', '--state-home', '/tmp/state',
    '--project-id', 'project-1', '--project-root', '/tmp/project', '--target', 'copilot',
    '--target=omp', '--protocol-version', '1', '--timeout', '1234', '--json', 'version'
  ]);
  assert.deepEqual(invocation.command, { kind: 'version' });
  assert.deepEqual(invocation.options.targets, ['copilot', 'omp']);
  assert.equal(invocation.options.source, '/tmp/source');
  assert.equal(invocation.options.home, '/tmp/home');
  assert.equal(invocation.options.stateHome, '/tmp/state');
  assert.equal(invocation.options.projectId, 'project-1');
  assert.equal(invocation.options.projectRoot, '/tmp/project');
  assert.equal(invocation.options.timeoutMs, 1234);
  assert.equal(invocation.options.json, true);
  assert.equal(invocation.options.debug, false);
});

test('accepts request files without a positional command', () => {
  const invocation = parseArguments(['--request-file', 'request.json', '--json']);
  assert.deepEqual(invocation.command, { kind: 'request-file' });
  assert.equal(invocation.options.requestFile, 'request.json');
});

test('accepts --debug flag and rejects duplicate', () => {
  const invocation = parseArguments(['version', '--debug']);
  assert.equal(invocation.options.debug, true);
  assert.equal(codeOf(() => parseArguments(['version', '--debug', '--debug'])), 'USAGE_INVALID');
});

test('rejects duplicate, unknown, invalid, and incompatible options', () => {
  assert.equal(codeOf(() => parseArguments(['version', '--json', '--json'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--home', '/tmp/a', '--home', '/tmp/b'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--unknown'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--protocol-version', '2'])), 'PROTOCOL_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--timeout', '0'])), 'VALIDATION_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--timeout', '900001'])), 'VALIDATION_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--target', 'omp', '--target', 'omp'])), 'VALIDATION_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--target', 'agy', '--target', 'antigravity'])), 'VALIDATION_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--request-file', 'request.json'])), 'USAGE_INVALID');
});

test('normalizes agy only at the input boundary', () => {
  const invocation = parseArguments(['version', '--target', 'agy']);
  assert.deepEqual(invocation.options.targets, ['antigravity']);
  assert.equal(codeOf(() => parseArguments(['version', '--target', 'unknown'])), 'CAPABILITY_UNSUPPORTED');
});
test('parses exact publication and recovery command grammar', () => {
  assert.deepEqual(parseArguments(['publish', '--dry-run', '--target', 'omp', '--json']).command, {
    kind: 'publish', action: 'dry-run'
  });
  assert.equal(parseArguments(['publish', '--dry-run']).options.scope, 'home');
  assert.equal(parseArguments(['publish', '--dry-run', '--scope', 'project']).options.scope, 'project');
  assert.deepEqual(parseArguments(['publish', '--apply', '--target=omp']).command, {
    kind: 'publish', action: 'apply'
  });
  assert.equal(parseArguments(['recover', '--scope=project']).options.scope, 'project');
  assert.deepEqual(parseArguments(['recover', '--json']).command, { kind: 'recover' });
  assert.equal(codeOf(() => parseArguments(['publish'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--apply'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--dry-run'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['recover', '--apply'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--scope', 'home'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['distribute', 'build', '--scope', 'project'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--scope', 'other'])), 'VALIDATION_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--scope', 'home', '--scope', 'project'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['--request-file', 'request.json', '--scope', 'project'])), 'USAGE_INVALID');
  for (const action of ['publish', 'all', 'recover']) {
    assert.equal(parseArguments(['distribute', action, '--scope', 'project']).options.scope, 'project');
  }
  for (const action of ['build', 'check']) {
    assert.equal(codeOf(() => parseArguments(['distribute', action, '--scope', 'home'])), 'USAGE_INVALID');
  }
  assert.equal(codeOf(() => parseArguments(['distribute', 'publish', '--scope', 'home', '--scope', 'project'])), 'USAGE_INVALID');
});


test('retired commands and options fail ordinary usage parsing', () => {
  for (const argv of [['health'], ['advisor', 'settings', 'get'], ['advisor', 'settings', 'preview'],
    ['advisor', 'settings', 'apply'], ['version', '--advice'], ['version', '--agent']]) {
    assert.equal(codeOf(() => parseArguments(argv)), 'USAGE_INVALID');
  }
});

test('parses companion installation flags and scalar options', () => {
  const invPositive = parseArguments(['publish', '--apply', '--target', 'vscode', '--install-vscode-companion']);
  assert.equal(invPositive.options.installVscodeCompanion, true);

  const invNegative = parseArguments(['publish', '--apply', '--target', 'vscode', '--no-install-vscode-companion']);
  assert.equal(invNegative.options.installVscodeCompanion, false);

  const invFull = parseArguments([
    'publish', '--apply', '--target', 'vscode', '--install-vscode-companion',
    '--vscode-editor', '/usr/bin/code', '--vscode-profile', 'test-profile'
  ]);
  assert.equal(invFull.options.installVscodeCompanion, true);
  assert.equal(invFull.options.vscodeEditor, '/usr/bin/code');
  assert.equal(invFull.options.vscodeProfile, 'test-profile');

  const invDefault = parseArguments(['publish', '--apply', '--target', 'vscode']);
  assert.equal(invDefault.options.installVscodeCompanion, undefined);
  assert.equal(invDefault.options.vscodeEditor, undefined);
  assert.equal(invDefault.options.vscodeProfile, undefined);
});

test('rejects duplicate or conflicting companion flags', () => {
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--install-vscode-companion', '--no-install-vscode-companion'])),
    'USAGE_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--install-vscode-companion', '--install-vscode-companion'])),
    'USAGE_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--no-install-vscode-companion', '--no-install-vscode-companion'])),
    'USAGE_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-editor', '/bin/code1', '--vscode-editor', '/bin/code2'])),
    'USAGE_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-profile', 'p1', '--vscode-profile', 'p2'])),
    'USAGE_INVALID'
  );
});

test('rejects companion options on non-eligible commands', () => {
  assert.equal(codeOf(() => parseArguments(['recover', '--install-vscode-companion'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['version', '--vscode-editor', '/bin/code'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['resources', 'list', '--vscode-profile', 'p1'])), 'USAGE_INVALID');
});

test('rejects companion options when target does not include vscode', () => {
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'claude', '--install-vscode-companion'])),
    'VALIDATION_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'omp', '--vscode-editor', '/bin/code'])),
    'VALIDATION_INVALID'
  );
});

test('rejects invalid --vscode-editor and --vscode-profile values', () => {
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-editor', 'relative/code'])),
    'VALIDATION_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-editor', '/usr/bin/../code'])),
    'VALIDATION_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-editor', '/usr/bin/code\0'])),
    'VALIDATION_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-profile', 'bad\nprofile'])),
    'VALIDATION_INVALID'
  );
  assert.equal(
    codeOf(() => parseArguments(['publish', '--apply', '--target', 'vscode', '--vscode-profile', 'bad/profile'])),
    'VALIDATION_INVALID'
  );
});
