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
    '--target=omp', '--protocol-version', '1', '--timeout', '1234', '--json', 'health'
  ]);
  assert.deepEqual(invocation.command, { kind: 'health' });
  assert.deepEqual(invocation.options.targets, ['copilot', 'omp']);
  assert.equal(invocation.options.source, '/tmp/source');
  assert.equal(invocation.options.home, '/tmp/home');
  assert.equal(invocation.options.stateHome, '/tmp/state');
  assert.equal(invocation.options.projectId, 'project-1');
  assert.equal(invocation.options.projectRoot, '/tmp/project');
  assert.equal(invocation.options.timeoutMs, 1234);
  assert.equal(invocation.options.json, true);
});

test('accepts request files without a positional command', () => {
  const invocation = parseArguments(['--request-file', 'request.json', '--json']);
  assert.deepEqual(invocation.command, { kind: 'request-file' });
  assert.equal(invocation.options.requestFile, 'request.json');
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
  assert.deepEqual(parseArguments(['publish', '--apply', '--target=omp']).command, {
    kind: 'publish', action: 'apply'
  });
  assert.deepEqual(parseArguments(['recover', '--json']).command, { kind: 'recover' });
  assert.equal(codeOf(() => parseArguments(['publish'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--apply'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['publish', '--dry-run', '--dry-run'])), 'USAGE_INVALID');
  assert.equal(codeOf(() => parseArguments(['recover', '--apply'])), 'USAGE_INVALID');
});
