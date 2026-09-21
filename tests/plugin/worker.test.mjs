/**
 * @file worker.test.mjs
 * Unit and contract tests for framed Node worker handshake, context lifecycle,
 * and method dispatch (Phase E02).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const {
  encodeFrame,
  FrameDecoder,
  validateJsonRpcMessage,
  RUNNER_PROTOCOL_VERSION,
  WORKER_SDK_VERSION
} = pluginRequire('@dam-hopper/plugin-sdk');
import { WorkerContextTable } from '../../plugin/backend/context-table.cjs';
import { WorkerRequestTable } from '../../plugin/backend/request-table.cjs';
import { WorkerDispatcher, SUPPORTED_CAPABILITIES } from '../../plugin/backend/dispatcher.cjs';
import { createWorkerServer, verifyNodeRuntime } from '../../plugin/backend/worker.cjs';

function createTempDir(prefix = 'evcrate-worker-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('verifyNodeRuntime: validates current Node version and rejects invalid', () => {
  assert.equal(verifyNodeRuntime('v22.19.0'), true);
  assert.equal(verifyNodeRuntime('v22.20.1'), true);
  assert.equal(verifyNodeRuntime('v24.0.0'), true);
  assert.equal(verifyNodeRuntime('v22.18.9'), false);
  assert.equal(verifyNodeRuntime('v20.10.0'), false);
  assert.equal(verifyNodeRuntime('invalid-string'), false);
  assert.equal(verifyNodeRuntime('v22.invalid.0'), false);
});

test('WorkerDispatcher: handshake requires runner.hello before any operation', async () => {
  const contextTable = new WorkerContextTable();
  const requestTable = new WorkerRequestTable();
  const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

  // Calling context.open before runner.hello must fail with INCOMPATIBLE
  const preHelloResponse = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'req-1',
    method: 'context.open',
    params: {}
  });

  assert.ok(preHelloResponse);
  assert.equal(preHelloResponse.id, 'req-1');
  assert.ok(preHelloResponse.error);
  assert.equal(preHelloResponse.error.code, 'INCOMPATIBLE');

  // Incompatible protocol major version rejects
  const badHelloResponse = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'req-2',
    method: 'runner.hello',
    params: { clientProtocolVersion: '99.0.0' }
  });
  assert.equal(badHelloResponse.error.code, 'INCOMPATIBLE');

  // Valid handshake succeeds
  const helloResponse = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'req-3',
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  });

  assert.equal(helloResponse.error, undefined);
  assert.equal(helloResponse.result.negotiatedProtocolVersion, RUNNER_PROTOCOL_VERSION);
  assert.deepEqual(helloResponse.result.supportedCapabilities, [...SUPPORTED_CAPABILITIES]);
});

test('WorkerContextTable & Dispatcher: context lifecycle, authorization and limits', async () => {
  const tmpDir = createTempDir();
  try {
    const contextTable = new WorkerContextTable({ maxContexts: 2, maxOpsPerContext: 2 });
    const requestTable = new WorkerRequestTable();
    const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

    // Complete handshake
    await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'h1',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    });

    // 1. Open context
    const openRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'c1',
      method: 'context.open',
      params: {
        actorSubject: 'actor-owner',
        installationId: 'inst-1',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh', 'history.summary'],
        allowCurrentAccountPolicy: false,
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });

    assert.equal(openRes.error, undefined);
    const contextId = openRes.result.contextId;
    assert.ok(contextId.startsWith('ctx-'));
    assert.equal(openRes.result.activationGeneration, 1);

    // 2. Invoke allowed operation
    const invokeRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'i1',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'history.refresh',
        payload: {}
      }
    });
    assert.equal(invokeRes.error, undefined);
    assert.ok(invokeRes.result.result);
    assert.equal(invokeRes.result.result.state, 'fresh');

    // 3. Invoke disallowed operation (not in allowedOperations)
    const disallowRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'i2',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'history.detail',
        payload: { snapshot_id: invokeRes.result.result.snapshot_id, record_ref: 'ref-1' }
      }
    });
    assert.ok(disallowRes.error);
    assert.equal(disallowRes.error.code, 'FORBIDDEN');

    // 4. Invoke policy.readCurrent when allowCurrentAccountPolicy is false
    const policyRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'i3',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'policy.readCurrent',
        payload: {}
      }
    });
    assert.ok(policyRes.error);
    assert.equal(policyRes.error.code, 'FORBIDDEN');

    // 5. Exceed context capacity (maxContexts = 2)
    await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'c2',
      method: 'context.open',
      params: {
        actorSubject: 'actor-owner',
        installationId: 'inst-1',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });

    const overflowRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'c3',
      method: 'context.open',
      params: {
        actorSubject: 'actor-owner',
        installationId: 'inst-1',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });
    assert.ok(overflowRes.error);
    assert.equal(overflowRes.error.code, 'OVERLOADED');

    // 6. Close context
    const closeRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'close-1',
      method: 'context.close',
      params: { contextId }
    });
    assert.equal(closeRes.result.closed, true);

    // 7. Invoke on closed context fails with CONTEXT_REVOKED
    const closedInvokeRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'i4',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'history.refresh',
        payload: {}
      }
    });
    assert.ok(closedInvokeRes.error);
    assert.equal(closedInvokeRes.error.code, 'CONTEXT_REVOKED');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('WorkerDispatcher: worker.health and worker.shutdown', async () => {
  const contextTable = new WorkerContextTable();
  const requestTable = new WorkerRequestTable();
  const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

  await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'h0',
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  });

  const health = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'h1',
    method: 'worker.health'
  });
  assert.equal(health.result.status, 'healthy');
  assert.equal(health.result.workerSdkVersion, WORKER_SDK_VERSION);

  const shutdown = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'h2',
    method: 'worker.shutdown'
  });
  assert.equal(shutdown.result.status, 'shutting_down');
});

test('createWorkerServer: full stream framing round-trip over PassThrough streams', async () => {
  const tmpDir = createTempDir();
  try {
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    const server = createWorkerServer({ stdin, stdout });
    const decoder = new FrameDecoder();
    const responses = [];

    stdout.on('data', (chunk) => {
      const frames = decoder.push(new Uint8Array(chunk));
      for (const f of frames) {
        responses.push(JSON.parse(f));
      }
    });

    // Send runner.hello
    stdin.write(encodeFrame(JSON.stringify({
      jsonrpc: '2.0',
      id: 'stream-hello',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    })));

    // Send context.open
    stdin.write(encodeFrame(JSON.stringify({
      jsonrpc: '2.0',
      id: 'stream-open',
      method: 'context.open',
      params: {
        actorSubject: 'actor-stream',
        installationId: 'inst-stream',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    })));

    // Wait for responses
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(responses.length, 2);
    assert.equal(responses[0].id, 'stream-hello');
    assert.equal(responses[0].result.negotiatedProtocolVersion, RUNNER_PROTOCOL_VERSION);
    assert.equal(responses[1].id, 'stream-open');
    assert.ok(responses[1].result.contextId);

    server.stop();
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('WorkerDispatcher: reconnect teardown revokes prior contexts', async () => {
  const tmpDir = createTempDir();
  try {
    const contextTable = new WorkerContextTable();
    const requestTable = new WorkerRequestTable();
    const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

    // Initial handshake
    await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'h1',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    });

    const openRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'c1',
      method: 'context.open',
      params: {
        actorSubject: 'actor-rec',
        installationId: 'inst-rec',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });
    const contextId = openRes.result.contextId;
    assert.equal(contextTable.size, 1);

    // Reconnect handshake
    await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'h2',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    });

    // All prior contexts must be revoked
    assert.equal(contextTable.size, 0);

    const invokeAfterReconnect = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-rec',
      method: 'plugin.invoke',
      params: { contextId, operation: 'history.refresh', payload: {} }
    });
    assert.equal(invokeAfterReconnect.error.code, 'CONTEXT_REVOKED');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('WorkerDispatcher: invoke verifies activationGeneration, bindingRevision, grantRevision', async () => {
  const tmpDir = createTempDir();
  try {
    const contextTable = new WorkerContextTable();
    const requestTable = new WorkerRequestTable();
    const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

    await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'h1',
      method: 'runner.hello',
      params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
    });

    const openRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'c1',
      method: 'context.open',
      params: {
        actorSubject: 'actor-rev',
        installationId: 'inst-rev',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 2,
        bindingRevision: 3,
        grantRevision: 4
      }
    });
    const contextId = openRes.result.contextId;

    // Matching revisions succeed
    const okInvoke = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-ok',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'history.refresh',
        payload: {},
        activationGeneration: 2,
        bindingRevision: 3,
        grantRevision: 4
      }
    });
    assert.equal(okInvoke.error, undefined);

    // Mismatched activationGeneration revokes context
    const badGen = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'inv-bad-gen',
      method: 'plugin.invoke',
      params: {
        contextId,
        operation: 'history.refresh',
        payload: {},
        activationGeneration: 99
      }
    });
    assert.equal(badGen.error.code, 'CONTEXT_REVOKED');
  } finally {
    cleanupTempDir(tmpDir);
  }
});
