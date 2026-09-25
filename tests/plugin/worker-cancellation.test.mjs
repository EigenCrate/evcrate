/**
 * @file worker-cancellation.test.mjs
 * Cancellation lifecycle, acknowledgement, deadline enforcement,
 * and settlement race tests for framed Node worker (Phase E02).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const {
  RUNNER_PROTOCOL_VERSION
} = pluginRequire('@dam-hopper/plugin-sdk');

import { WorkerContextTable } from '../../plugin/backend/context-table.cjs';
import { WorkerRequestTable } from '../../plugin/backend/request-table.cjs';
import { WorkerDispatcher } from '../../plugin/backend/dispatcher.cjs';

function createTempDir(prefix = 'evcrate-cancel-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

test('Worker Cancellation: in-flight request cancellation delivers accepted ack and CANCELLED error', async () => {
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
        actorSubject: 'actor-cancel',
        installationId: 'inst-cancel',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });
    const contextId = openRes.result.contextId;

    // Start a long-running simulated request through requestTable
    let aborted = false;
    const invokePromise = requestTable.admitAndExecute({
      requestId: 'req-slow-1',
      contextId,
      operation: 'history.refresh',
      execute: async (signal) => {
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(signal.reason);
          });
        });
      }
    });

    // Cancel in flight
    const cancelRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'cancel-1',
      method: 'request.cancel',
      params: { contextId, requestId: 'req-slow-1' }
    });

    assert.equal(cancelRes.result.outcome, 'accepted');
    assert.equal(aborted, true);

    await assert.rejects(async () => {
      await invokePromise;
    }, (err) => {
      return err.code === 'CANCELLED';
    });

    // Cancelling again returns alreadySettled
    const cancelAgainRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'cancel-2',
      method: 'request.cancel',
      params: { contextId, requestId: 'req-slow-1' }
    });
    assert.equal(cancelAgainRes.result.outcome, 'alreadySettled');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('Worker Cancellation: already settled request returns alreadySettled', async () => {
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
        actorSubject: 'actor-cancel',
        installationId: 'inst-cancel',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });
    const contextId = openRes.result.contextId;

    // Fast request that settles immediately
    const invokeRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'fast-req-1',
      method: 'plugin.invoke',
      params: { contextId, operation: 'history.refresh', payload: {} }
    });
    assert.equal(invokeRes.error, undefined);

    // Cancel on already settled request returns alreadySettled
    const cancelRes = await dispatcher.dispatch({
      jsonrpc: '2.0',
      id: 'cancel-fast',
      method: 'request.cancel',
      params: { contextId, requestId: 'fast-req-1' }
    });
    assert.equal(cancelRes.result.outcome, 'alreadySettled');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('Worker Cancellation: unknown request returns unknown outcome', async () => {
  const contextTable = new WorkerContextTable();
  const requestTable = new WorkerRequestTable();
  const dispatcher = new WorkerDispatcher({ contextTable, requestTable });

  await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'h1',
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  });

  const cancelRes = await dispatcher.dispatch({
    jsonrpc: '2.0',
    id: 'cancel-unknown',
    method: 'request.cancel',
    params: { contextId: 'ctx-any', requestId: 'non-existent-req' }
  });
  assert.equal(cancelRes.result.outcome, 'unknown');
});

test('Worker Cancellation: deadline expiration aborts operation with DEADLINE_EXCEEDED', async () => {
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
        actorSubject: 'actor-cancel',
        installationId: 'inst-cancel',
        configuredProjectTarget: tmpDir,
        allowedOperations: ['history.refresh'],
        apiConnectionEpoch: 1,
        activationGeneration: 1
      }
    });
    const contextId = openRes.result.contextId;

    // Admit request with a short 25ms deadline that will expire
    await assert.rejects(async () => {
      await requestTable.admitAndExecute({
        requestId: 'req-deadline-1',
        contextId,
        operation: 'history.refresh',
        deadlineMs: 25,
        execute: async (signal) => {
          return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          });
        }
      });
    }, (err) => {
      return err.code === 'DEADLINE_EXCEEDED';
    });
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('Worker Cancellation: queued requests cancelled before starting settle immediately as CANCELLED', async () => {
  const tmpDir = createTempDir();
  try {
    const requestTable = new WorkerRequestTable({ maxWorkerOps: 1 });
    const contextId = 'ctx-queue-cancel';

    // 1. Start a blocking request that holds the only worker op slot
    let unblockFirst;
    const firstPromise = requestTable.admitAndExecute({
      requestId: 'req-slot-holder',
      contextId,
      operation: 'history.refresh',
      execute: async () => new Promise((resolve) => { unblockFirst = resolve; })
    });

    // 2. Submit second request which enters admission queue
    const queuedPromise = requestTable.admitAndExecute({
      requestId: 'req-in-queue',
      contextId,
      operation: 'history.summary',
      execute: async () => ({ ok: true })
    });

    assert.equal(requestTable.queuedCount, 1);

    // 3. Cancel the queued request
    const cancelOutcome = requestTable.cancelRequest('req-in-queue', contextId);
    assert.equal(cancelOutcome, 'accepted');
    assert.equal(requestTable.queuedCount, 0);

    await assert.rejects(async () => {
      await queuedPromise;
    }, (err) => err.code === 'CANCELLED');

    unblockFirst({ ok: true });
    await firstPromise;
  } finally {
    cleanupTempDir(tmpDir);
  }
});
