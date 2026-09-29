/**
 * @file ui-bridge.test.mjs
 * Unit and contract tests for DamHopper Advisor UI Bridge (Phase E03).
 *
 * Validates:
 * - D00 UI Bridge envelope format and strict validation
 * - Single-use nonce acknowledgement and handshake sequence
 * - Request/response mapping and error propagation
 * - Cancellation forwarding and settled request handling
 * - Late response and mismatched generation suppression
 * - Context revocation and port teardown
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_BRIDGE_VERSION,
  BRIDGE_ENVELOPE_TYPES,
  validateBridgeMessage,
  validateAdvisorWorkspaceContext,
  BridgeProtocolError
} from '../../viewer/src/providers/bridge-contract.ts';
import { DamHopperPortProvider } from '../../viewer/src/providers/dam-hopper-port-provider.ts';

// Mock MessagePort for Node.js test environment
class MockMessagePort {
  constructor() {
    this.sent = [];
    this.closed = false;
    this.onmessage = null;
    this.onmessageerror = null;
  }

  postMessage(data) {
    if (this.closed) throw new Error('Cannot postMessage on closed port');
    this.sent.push(JSON.parse(JSON.stringify(data)));
  }

  close() {
    this.closed = true;
  }

  // Helper for test to simulate incoming message
  deliverMessage(data) {
    if (this.closed) return;
    if (this.onmessage) {
      this.onmessage({ data: JSON.parse(JSON.stringify(data)) });
    }
  }
}

test('UI Bridge Contract: UI_BRIDGE_VERSION is pinned to 1.0.0', () => {
  assert.equal(UI_BRIDGE_VERSION, '1.0.0');
});

test('UI Bridge Contract: envelope types are frozen and complete', () => {
  assert.equal(Object.keys(BRIDGE_ENVELOPE_TYPES).length, 11);
  assert.ok(BRIDGE_ENVELOPE_TYPES['host.bootstrap']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['frame.portAck']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['frame.ready']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['request']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['response']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['cancel']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['context.revoked']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['availability.changed']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['host.contextReady']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['host.workspaceChanged']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['frame.uiIntent']);
});

test('validateBridgeMessage: rejects invalid messages and malformed types', () => {
  assert.throws(() => validateBridgeMessage(null), BridgeProtocolError);
  assert.throws(() => validateBridgeMessage('string'), BridgeProtocolError);
  assert.throws(() => validateBridgeMessage([]), BridgeProtocolError);
  assert.throws(() => validateBridgeMessage({ type: 'unknown.type' }), BridgeProtocolError);
  assert.throws(() => validateBridgeMessage({ type: 'host.bootstrap' }), BridgeProtocolError);
  assert.throws(() => validateBridgeMessage({
    type: 'host.bootstrap',
    frameSession: '',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'n-1',
    pluginId: 'evcrate.advisor',
    capabilities: []
  }), BridgeProtocolError);
});

test('validateBridgeMessage: validates valid host.bootstrap and frame.portAck envelopes', () => {
  const bootstrap = validateBridgeMessage({
    type: 'host.bootstrap',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-12345',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh', 'history.summary']
  });
  assert.equal(bootstrap.type, 'host.bootstrap');

  const ack = validateBridgeMessage({
    type: 'frame.portAck',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-12345'
  });
  assert.equal(ack.type, 'frame.portAck');
});
test('validateAdvisorWorkspaceContext: validates conformant workspace context and rejects malformed', () => {
  const validContext = {
    revision: 1,
    authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    project: {
      projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      label: 'Main Project'
    },
    historyScope: 'history-root',
    contextScope: 'history-root',
    allowedOperations: ['history.refresh', 'history.summary']
  };

  const validated = validateAdvisorWorkspaceContext(validContext);
  assert.equal(validated.revision, 1);
  assert.equal(validated.authorityKey, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  assert.equal(validated.project.projectId, 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210');
  assert.equal(validated.project.label, 'Main Project');

  // Rejects missing/malformed fields
  assert.throws(() => validateAdvisorWorkspaceContext(null), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, revision: 0 }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, authorityKey: 'not-hex' }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, project: null }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, project: { projectId: 'bad', label: null } }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, historyScope: 'invalid' }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, contextScope: 'invalid' }), BridgeProtocolError);
  assert.throws(() => validateAdvisorWorkspaceContext({ ...validContext, extraField: 'forbidden' }), BridgeProtocolError);
});

test('validateBridgeMessage: validates host.contextReady, host.workspaceChanged, and frame.uiIntent', () => {
  const validContext = {
    revision: 1,
    authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    project: {
      projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      label: null
    },
    historyScope: 'project',
    contextScope: 'project',
    allowedOperations: ['history.summary']
  };

  const contextReady = validateBridgeMessage({
    type: 'host.contextReady',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    workspaceContext: validContext
  });
  assert.equal(contextReady.type, 'host.contextReady');

  const workspaceChanged = validateBridgeMessage({
    type: 'host.workspaceChanged',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    workspaceContext: { ...validContext, revision: 2 }
  });
  assert.equal(workspaceChanged.type, 'host.workspaceChanged');

  const uiIntent = validateBridgeMessage({
    type: 'frame.uiIntent',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    intent: 'dismiss'
  });
  assert.equal(uiIntent.type, 'frame.uiIntent');
  assert.equal(uiIntent.intent, 'dismiss');

  assert.throws(() => validateBridgeMessage({
    type: 'frame.uiIntent',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    intent: 'invalid'
  }), BridgeProtocolError);
});

test('DamHopperPortProvider: completes nonce handshake and transitions to ready', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  assert.equal(provider.descriptor.isAvailable, false);

  let readyEmitted = false;
  provider.subscribe((evt) => {
    if (evt.type === 'ready') readyEmitted = true;
  });

  // Host sends bootstrap with transferred port and single-use nonce
  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-abc',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    nonce: 'cryptographic-nonce-999',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh', 'history.summary', 'policy.readCurrent']
  }, mockPort);

  // Provider must immediately send frame.portAck containing the exact nonce
  assert.equal(mockPort.sent.length, 1);
  assert.deepEqual(mockPort.sent[0], {
    type: 'frame.portAck',
    frameSession: 'session-abc',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2,
    nonce: 'cryptographic-nonce-999'
  });

  // Port acknowledgement completes the bootstrap handshake.

  assert.equal(readyEmitted, true);
  assert.equal(mockPort.sent.length, 1);
  assert.equal(provider.descriptor.isAvailable, true);
  assert.equal(provider.descriptor.frameSession, 'session-abc');
  assert.equal(provider.descriptor.activationGeneration, 2);
  assert.equal(provider.descriptor.hasHistorySource, true);
  assert.equal(provider.descriptor.hasPolicySource, true);
});

test('DamHopperPortProvider: dispatches request and settles on response', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-1',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh']
  }, mockPort);


  // Call refreshHistory
  const refreshPromise = provider.refreshHistory('req-100');

  // Verify request sent over port
  assert.equal(mockPort.sent.length, 2); // [0] = portAck, [1] = request
  assert.equal(mockPort.sent[1].type, 'request');
  assert.equal(mockPort.sent[1].requestId, 'req-100');
  assert.equal(mockPort.sent[1].operation, 'history.refresh');
  assert.deepEqual(mockPort.sent[1].payload, {});

  // Simulate host response
  mockPort.deliverMessage({
    type: 'response',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    requestId: 'req-100',
    result: {
      state: 'fresh',
      snapshot_id: 'snap-remote-1',
      observed_at: Date.now(),
      scan: { status: 'complete', accepted_records: 5, invalid_records: 0 },
      stale_reason: null
    }
  });

  const res = await refreshPromise;
  assert.equal(res.state, 'fresh');
  assert.equal(res.snapshot_id, 'snap-remote-1');
});

test('DamHopperPortProvider: discards late responses from mismatched generation', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-1',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh']
  }, mockPort);


  let settled = false;
  const req = provider.refreshHistory('req-late').then(() => { settled = true; });

  // Simulate host response with mismatched generation (e.g. generation 0 or session-old)
  mockPort.deliverMessage({
    type: 'response',
    frameSession: 'session-old',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 0,
    requestId: 'req-late',
    result: { state: 'fresh', snapshot_id: 'snap-late' }
  });

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false, 'Late response from mismatched generation must not settle request');

  // Deliver correct response
  mockPort.deliverMessage({
    type: 'response',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    requestId: 'req-late',
    result: { state: 'fresh', snapshot_id: 'snap-valid' }
  });

  await req;
  assert.equal(settled, true);
});

test('DamHopperPortProvider: handles context.revoked and aborts pending requests', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-1',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh']
  }, mockPort);


  const pendingReq = provider.refreshHistory('req-revoked');

  let revokeReason = null;
  provider.subscribe((evt) => {
    if (evt.type === 'revoked') revokeReason = evt.reason;
  });

  // Host revokes context
  mockPort.deliverMessage({
    type: 'context.revoked',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    reason: 'Profile switched by user'
  });

  assert.equal(revokeReason, 'Profile switched by user');
  assert.equal(provider.descriptor.isAvailable, false);
  assert.equal(mockPort.closed, true);

  await assert.rejects(pendingReq, /Operation cancelled: Profile switched by user/);
});
test('DamHopperPortProvider: extension handshake queues requests until host.contextReady', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  let readyEmitted = false;
  provider.subscribe((evt) => {
    if (evt.type === 'ready') readyEmitted = true;
  });

  const workspaceContext = {
    revision: 1,
    authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    project: {
      projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      label: 'Main Project'
    },
    historyScope: 'history-root',
    contextScope: 'history-root',
    allowedOperations: ['history.refresh']
  };

  // Bootstrap with extension
  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-ext-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-ext',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh'],
    extensions: ['workspace-advisor-v1'],
    workspaceContext
  }, mockPort);

  // portAck was sent, but NOT ready yet
  assert.equal(mockPort.sent.length, 1);
  assert.equal(mockPort.sent[0].type, 'frame.portAck');
  assert.equal(readyEmitted, false);
  assert.equal(provider.descriptor.isAvailable, false);

  // Invoke while awaiting ready - should be queued
  const reqPromise = provider.refreshHistory('req-queued-1');
  assert.equal(mockPort.sent.length, 1); // Not sent yet

  // Host sends contextReady
  mockPort.deliverMessage({
    type: 'host.contextReady',
    frameSession: 'session-ext-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext
  });

  // Now provider is ready and queued request is flushed to port
  assert.equal(readyEmitted, true);
  assert.equal(provider.descriptor.isAvailable, true);
  assert.deepEqual(provider.descriptor.workspaceContext, workspaceContext);
  assert.equal(mockPort.sent.length, 2);
  assert.equal(mockPort.sent[1].type, 'request');
  assert.equal(mockPort.sent[1].requestId, 'req-queued-1');

  // Settle request
  mockPort.deliverMessage({
    type: 'response',
    frameSession: 'session-ext-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    requestId: 'req-queued-1',
    result: { state: 'fresh' }
  });

  const result = await reqPromise;
  assert.deepEqual(result, { state: 'fresh' });
});

test('DamHopperPortProvider: host.workspaceChanged updates context and emits event', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  const initialContext = {
    revision: 1,
    authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    project: {
      projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      label: 'Main Project'
    },
    historyScope: 'history-root',
    contextScope: 'history-root',
    allowedOperations: ['history.refresh']
  };

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-ext-2',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-ext-2',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh'],
    extensions: ['workspace-advisor-v1'],
    workspaceContext: initialContext
  }, mockPort);

  mockPort.deliverMessage({
    type: 'host.contextReady',
    frameSession: 'session-ext-2',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext: initialContext
  });

  let changedContext = null;
  provider.subscribe((evt) => {
    if (evt.type === 'workspace-project-changed') {
      changedContext = evt.workspaceContext;
    }
  });

  const updatedContext = {
    ...initialContext,
    revision: 2,
    project: {
      projectId: '1111111111111111111111111111111111111111111111111111111111111111',
      label: 'Project Two'
    }
  };

  mockPort.deliverMessage({
    type: 'host.workspaceChanged',
    frameSession: 'session-ext-2',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext: updatedContext
  });

  assert.deepEqual(changedContext, updatedContext);
  assert.deepEqual(provider.descriptor.workspaceContext, updatedContext);

  // Lower revision or mismatched authorityKey revokes session
  mockPort.deliverMessage({
    type: 'host.workspaceChanged',
    frameSession: 'session-ext-2',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext: { ...updatedContext, revision: 1 } // Lower revision!
  });

  assert.equal(provider.descriptor.isAvailable, false);
});

test('DamHopperPortProvider: sendUiIntent posts frame.uiIntent to port', () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-ui',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 3,
    nonce: 'nonce-ui',
    pluginId: 'evcrate.advisor',
    capabilities: []
  }, mockPort);

  provider.sendUiIntent('activate');
  provider.sendUiIntent('dismiss');

  assert.equal(mockPort.sent.length, 3); // [0] = portAck, [1] = activate, [2] = dismiss
  assert.deepEqual(mockPort.sent[1], {
    type: 'frame.uiIntent',
    frameSession: 'session-ui',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 3,
    intent: 'activate'
  });
  assert.deepEqual(mockPort.sent[2], {
    type: 'frame.uiIntent',
    frameSession: 'session-ui',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 3,
    intent: 'dismiss'
  });
});
test('validateBridgeMessage: rejects inherited prototype properties', () => {
  assert.throws(() => validateBridgeMessage({
    type: 'toString',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1
  }), BridgeProtocolError);
});

test('DamHopperPortProvider: cancel removes and rejects queued requests before ready', async () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-queued-cancel',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-qc',
    pluginId: 'evcrate.advisor',
    capabilities: ['history.refresh'],
    extensions: ['workspace-advisor-v1'],
    workspaceContext: {
      revision: 1,
      authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      project: { projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', label: null },
      historyScope: 'history-root',
      contextScope: 'history-root',
      allowedOperations: ['history.refresh']
    }
  }, mockPort);

  // Invoke request while awaiting ready
  const reqPromise = provider.refreshHistory('req-cancel-queued');

  // Cancel it while still queued
  provider.cancel('req-cancel-queued');

  await assert.rejects(reqPromise, /Operation cancelled by user/);

  // Now deliver contextReady - the cancelled request should NOT be flushed
  mockPort.deliverMessage({
    type: 'host.contextReady',
    frameSession: 'session-queued-cancel',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext: {
      revision: 1,
      authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      project: { projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', label: null },
      historyScope: 'history-root',
      contextScope: 'history-root',
      allowedOperations: ['history.refresh']
    }
  });

  // Only portAck was sent; the cancelled request was never flushed to port!
  assert.equal(mockPort.sent.length, 1);
});

test('DamHopperPortProvider: sendUiIntent is ignored when not ready', () => {
  const provider = new DamHopperPortProvider(false);
  const mockPort = new MockMessagePort();

  provider.handleBootstrap({
    type: 'host.bootstrap',
    frameSession: 'session-ui-guard',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    nonce: 'nonce-ug',
    pluginId: 'evcrate.advisor',
    capabilities: [],
    extensions: ['workspace-advisor-v1'],
    workspaceContext: {
      revision: 1,
      authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      project: { projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', label: null },
      historyScope: 'history-root',
      contextScope: 'history-root',
      allowedOperations: []
    }
  }, mockPort);

  // Still in awaiting-ready: sendUiIntent must be ignored
  provider.sendUiIntent('activate');
  assert.equal(mockPort.sent.length, 1); // Only portAck sent

  // Now deliver contextReady
  mockPort.deliverMessage({
    type: 'host.contextReady',
    frameSession: 'session-ui-guard',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1,
    workspaceContext: {
      revision: 1,
      authorityKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      project: { projectId: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210', label: null },
      historyScope: 'history-root',
      contextScope: 'history-root',
      allowedOperations: []
    }
  });

  // Now in ready state: sendUiIntent works
  provider.sendUiIntent('activate');
  assert.equal(mockPort.sent.length, 2);
  assert.equal(mockPort.sent[1].type, 'frame.uiIntent');
});
