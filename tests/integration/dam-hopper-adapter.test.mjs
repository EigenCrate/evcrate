import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  DamHopperClientError,
  DamHopperConflictError,
  DamHopperSubprocessClient
} from './dam-hopper-adapter.mjs';

function createDummyCli(script) {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-dh-adapter-test-'));
  const cliPath = join(root, 'dummy-cli.js');
  writeFileSync(cliPath, script, { mode: 0o755 });
  return {
    root, cliPath,
    cleanup() { rmSync(root, { recursive: true, force: true }); }
  };
}

test('adapter parses successful resource envelope', () => {
  const payload = {
    protocol: 'evcrate-resource-control', protocolVersion: 1,
    requestId: 'test-01', status: 'ok',
    payload: { resources: [], nextCursor: null, registryRevision: 1 }
  };
  const dummy = createDummyCli(`console.log(${JSON.stringify(JSON.stringify(payload))});`);
  try {
    const client = new DamHopperSubprocessClient({ cliPath: dummy.cliPath, cwd: dummy.root });
    const result = client.resourcesList();
    assert.equal(result.status, 'ok');
    assert.equal(result.payload.registryRevision, 1);
  } finally {
    dummy.cleanup();
  }
});

test('adapter parses qualification health diagnostic envelope', () => {
  const payload = {
    protocol: 'evcrate-advisor-diagnostic', protocolVersion: 1,
    requestId: 'test-02', status: 'QUALIFIED',
    target: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    probes: {
      version: { status: 'passed', value: '1.0.0' },
      auth: { status: 'passed' },
      capabilities: { status: 'passed', model: 'gpt-5.6-sol', effort: 'high', noninteractive: true, session: 'isolated', tools: 'none', output: 'json' }
    }
  };
  const dummy = createDummyCli(`console.log(${JSON.stringify(JSON.stringify(payload))});`);
  try {
    const client = new DamHopperSubprocessClient({ cliPath: dummy.cliPath, cwd: dummy.root });
    const result = client.health();
    assert.equal(result.status, 'QUALIFIED');
    assert.equal(result.target.backend, 'codex');
  } finally {
    dummy.cleanup();
  }
});

test('adapter throws DamHopperConflictError on CAS conflict', () => {
  const payload = {
    protocol: 'evcrate-resource-control', protocolVersion: 1,
    requestId: 'test-03', status: 'conflict',
    error: { code: 'CAS_CONFLICT', category: 'conflict', action: 'Refresh and retry', message: 'Stale revision' },
    conflict: {
      expectedRevision: { registryRevision: 1 },
      actualRevision: { registryRevision: 2 },
      retryable: true
    }
  };
  const dummy = createDummyCli(`console.log(${JSON.stringify(JSON.stringify(payload))});`);
  try {
    const client = new DamHopperSubprocessClient({ cliPath: dummy.cliPath, cwd: dummy.root });
    assert.throws(
      () => client.scopesAssign({ resourceId: 'agent:agents/foo.md', expectedRevision: 1 }),
      (err) => {
        assert.ok(err instanceof DamHopperConflictError);
        assert.equal(err.code, 'CAS_CONFLICT');
        assert.equal(err.retryable, true);
        assert.deepEqual(err.conflict.actualRevision, { registryRevision: 2 });
        return true;
      }
    );
  } finally {
    dummy.cleanup();
  }
});

test('adapter rejects counsel or checkpoint fields in response', () => {
  const payload = {
    protocol: 'evcrate-resource-control', protocolVersion: 1,
    requestId: 'test-04', status: 'ok',
    payload: { question: 'Forbidden proxy counsel' }
  };
  const dummy = createDummyCli(`console.log(${JSON.stringify(JSON.stringify(payload))});`);
  try {
    const client = new DamHopperSubprocessClient({ cliPath: dummy.cliPath, cwd: dummy.root });
    assert.throws(
      () => client.resourcesList(),
      (err) => err instanceof DamHopperClientError && err.code === 'COUNSEL_PROXY_FORBIDDEN'
    );
  } finally {
    dummy.cleanup();
  }
});

test('adapter fails closed on malformed JSON or empty output', () => {
  const malformed = createDummyCli(`console.log("not-json-content");`);
  const empty = createDummyCli(`process.exit(0);`);
  try {
    const clientMalformed = new DamHopperSubprocessClient({ cliPath: malformed.cliPath, cwd: malformed.root });
    assert.throws(
      () => clientMalformed.resourcesList(),
      (err) => err instanceof DamHopperClientError && err.code === 'MALFORMED_ENVELOPE'
    );
    const clientEmpty = new DamHopperSubprocessClient({ cliPath: empty.cliPath, cwd: empty.root });
    assert.throws(
      () => clientEmpty.resourcesList(),
      (err) => err instanceof DamHopperClientError && err.code === 'EMPTY_OUTPUT'
    );
  } finally {
    malformed.cleanup();
    empty.cleanup();
  }
});

test('adapter fails closed on timeout', () => {
  const sleepCli = createDummyCli(`setTimeout(() => {}, 5000);`);
  try {
    const client = new DamHopperSubprocessClient({
      cliPath: sleepCli.cliPath, cwd: sleepCli.root, timeoutMs: 100
    });
    assert.throws(
      () => client.resourcesList(),
      (err) => err instanceof DamHopperClientError && err.code === 'TIMEOUT'
    );
  } finally {
    sleepCli.cleanup();
  }
});
