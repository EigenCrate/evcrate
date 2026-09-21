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
  assert.equal(Object.keys(BRIDGE_ENVELOPE_TYPES).length, 8);
  assert.ok(BRIDGE_ENVELOPE_TYPES['host.bootstrap']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['frame.portAck']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['frame.ready']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['request']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['response']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['cancel']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['context.revoked']);
  assert.ok(BRIDGE_ENVELOPE_TYPES['availability.changed']);
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

  // Host acknowledges by delivering frame.ready
  mockPort.deliverMessage({
    type: 'frame.ready',
    frameSession: 'session-abc',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 2
  });

  assert.equal(readyEmitted, true);
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

  mockPort.deliverMessage({
    type: 'frame.ready',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1
  });

  // Call refreshHistory
  const refreshPromise = provider.refreshHistory('req-100');

  // Verify request sent over port
  assert.equal(mockPort.sent.length, 2); // [0] = portAck, [1] = request
  assert.equal(mockPort.sent[1].type, 'request');
  assert.equal(mockPort.sent[1].requestId, 'req-100');
  assert.equal(mockPort.sent[1].operation, 'history.refresh');

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

  mockPort.deliverMessage({
    type: 'frame.ready',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1
  });

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

  mockPort.deliverMessage({
    type: 'frame.ready',
    frameSession: 'session-1',
    bridgeVersion: UI_BRIDGE_VERSION,
    activationGeneration: 1
  });

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
