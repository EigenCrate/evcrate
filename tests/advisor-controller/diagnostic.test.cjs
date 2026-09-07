'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const FIXTURES = path.join(__dirname, 'fixtures');
const {
  parseDiagnosticRequest,
  serializeDiagnosticRequest,
  validateDiagnosticRequest,
  runQualificationDiagnostic
} = require('../../.evcrate/source/.evcrate/bin/lib/advisor/controller.cjs');
const { createRoutingError } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/errors.cjs');

const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'diagnostic.json'), 'utf8'));
const negatives = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'diagnostic-negative.json'), 'utf8'));

function policy() {
  return {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
}
function adapter(calls, overrides = {}) {
  return {
    name: 'codex', authKeys: [],
    probeVersion: async () => { calls.push('version'); return '0.150.1'; },
    probeAuth: async () => { calls.push('auth'); return { authenticated: true }; },
    probeCapabilities: async () => {
      calls.push('capabilities');
      return { model: 'gpt-5.6-sol', effort: 'high', noninteractive: true,
        session: 'isolated', tools: 'none', output: 'jsonl' };
    },
    buildInvocation: () => { throw new Error('buildInvocation must not run'); },
    parseResult: () => { throw new Error('parseResult must not run'); },
    ...overrides
  };
}
function dependencies(calls, overrides = {}) {
  return {
    loadGlobalPolicy: async () => policy(),
    getAdapter: () => adapter(calls),
    environment: { PATH: process.env.PATH || '', HOME: process.env.HOME || '' },
    monotonicMilliseconds: () => 1000,
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    ...overrides
  };
}

test('diagnostic request has exact keys and canonical serialization', () => {
  assert.deepEqual(Object.keys(fixture.request), [
    'protocol', 'protocolVersion', 'requestId', 'operation'
  ]);
  assert.deepEqual(parseDiagnosticRequest(JSON.stringify(fixture.request)), fixture.request);
  assert.equal(serializeDiagnosticRequest(fixture.request), JSON.stringify(fixture.request));
  for (const value of negatives) assert.throws(() => validateDiagnosticRequest(value), /invalid/i);
});

test('qualification probes selected adapter once without counsel execution', async () => {
  const calls = [];
  const value = await runQualificationDiagnostic(JSON.stringify(fixture.request), dependencies(calls));
  assert.deepEqual(value, fixture.result);
  assert.deepEqual(calls, ['version', 'auth', 'capabilities']);
});

test('probe failure is sanitized and later probes remain not-run', async () => {
  const calls = [];
  const value = await runQualificationDiagnostic(JSON.stringify(fixture.request), dependencies(calls, {
    getAdapter: () => adapter(calls, { probeAuth: async () => {
      calls.push('auth'); throw new Error('credential=do-not-leak');
    } })
  }));
  assert.equal(value.status, 'FAILED');
  assert.deepEqual(Object.keys(value), [
    'protocol', 'protocolVersion', 'requestId', 'status', 'target', 'probes', 'error'
  ]);
  assert.deepEqual(value.probes, {
    version: { status: 'passed', value: '0.150.1' },
    auth: { status: 'not-run' }, capabilities: { status: 'not-run' }
  });
  assert.equal(value.error.code, 'PROCESS_FAILED');
  assert.equal(value.error.message, 'Advisor CLI process failed');
  assert.equal(JSON.stringify(value).includes('do-not-leak'), false);
  assert.deepEqual(calls, ['version', 'auth']);
});

test('missing policy returns a bounded diagnostic failure', async () => {
  const value = await runQualificationDiagnostic(JSON.stringify(fixture.request), {
    loadGlobalPolicy: async () => { throw createRoutingError('ROUTE_POLICY_REQUIRED'); },
    getAdapter: () => { throw new Error('adapter must not run'); },
    monotonicMilliseconds: () => 1000
  });
  assert.equal(value.status, 'FAILED');
  assert.equal(value.target, null);
  assert.equal(value.error.code, 'ROUTE_POLICY_REQUIRED');
});
