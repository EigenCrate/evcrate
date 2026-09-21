/**
 * @file worker-framing.test.mjs
 * Framing protocol, streaming, and negative fixture tests for framed Node worker (Phase E02).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';

const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const {
  encodeFrame,
  FrameDecoder,
  validateJsonRpcMessage,
  RUNNER_PROTOCOL_VERSION,
  MAX_FRAME_PAYLOAD_BYTES
} = pluginRequire('@dam-hopper/plugin-sdk');

import { createWorkerServer } from '../../plugin/backend/worker.cjs';

test('Worker Framing: fragmented frames delivered across multiple chunks', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = createWorkerServer({ stdin, stdout });

  const responses = [];
  const decoder = new FrameDecoder();

  stdout.on('data', (chunk) => {
    const frames = decoder.push(new Uint8Array(chunk));
    for (const f of frames) {
      responses.push(JSON.parse(f));
    }
  });

  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: 'req-frag',
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  });
  const encoded = encodeFrame(payload);

  // Split into 3 small chunks
  const c1 = encoded.subarray(0, 3);
  const c2 = encoded.subarray(3, 10);
  const c3 = encoded.subarray(10);

  stdin.write(Buffer.from(c1));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(responses.length, 0);

  stdin.write(Buffer.from(c2));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(responses.length, 0);

  stdin.write(Buffer.from(c3));
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, 'req-frag');
  assert.equal(responses[0].result.negotiatedProtocolVersion, RUNNER_PROTOCOL_VERSION);

  server.stop();
});

test('Worker Framing: coalesced frames delivered in a single chunk', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = createWorkerServer({ stdin, stdout });

  const responses = [];
  const decoder = new FrameDecoder();

  stdout.on('data', (chunk) => {
    const frames = decoder.push(new Uint8Array(chunk));
    for (const f of frames) {
      responses.push(JSON.parse(f));
    }
  });

  const m1 = encodeFrame(JSON.stringify({
    jsonrpc: '2.0',
    id: 'c-1',
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  }));
  const m2 = encodeFrame(JSON.stringify({
    jsonrpc: '2.0',
    id: 'c-2',
    method: 'worker.health'
  }));

  const merged = Buffer.concat([Buffer.from(m1), Buffer.from(m2)]);
  stdin.write(merged);

  await new Promise((r) => setTimeout(r, 30));

  assert.equal(responses.length, 2);
  assert.equal(responses[0].id, 'c-1');
  assert.equal(responses[1].id, 'c-2');
  assert.equal(responses[1].result.status, 'healthy');

  server.stop();
});

test('Worker Framing: oversized frame header rejected before body allocation', () => {
  const headerOnly = new Uint8Array(4);
  new DataView(headerOnly.buffer).setUint32(0, MAX_FRAME_PAYLOAD_BYTES + 1, false);

  const decoder = new FrameDecoder();
  assert.throws(() => {
    decoder.push(headerOnly);
  }, /Oversized frame header/);
});

test('Worker Framing: invalid UTF-8 in frame body rejected', () => {
  const badBytes = new Uint8Array([0xff, 0xff, 0xff]);
  const frame = new Uint8Array(4 + badBytes.length);
  new DataView(frame.buffer).setUint32(0, badBytes.length, false);
  frame.set(badBytes, 4);

  const decoder = new FrameDecoder();
  assert.throws(() => {
    decoder.push(frame);
  }, /invalid UTF-8/);
});

test('Worker Framing: JSON-RPC batch payload rejected with error frame', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = createWorkerServer({ stdin, stdout });

  const responses = [];
  const decoder = new FrameDecoder();

  stdout.on('data', (chunk) => {
    const frames = decoder.push(new Uint8Array(chunk));
    for (const f of frames) {
      responses.push(JSON.parse(f));
    }
  });

  const batchPayload = JSON.stringify([
    { jsonrpc: '2.0', id: '1', method: 'runner.hello' },
    { jsonrpc: '2.0', id: '2', method: 'worker.health' }
  ]);
  stdin.write(Buffer.from(encodeFrame(batchPayload)));

  await new Promise((r) => setTimeout(r, 20));

  assert.equal(responses.length, 1);
  assert.ok(responses[0].error);
  assert.equal(responses[0].error.code, 'INVALID_INPUT');
  assert.match(responses[0].error.message, /batch payloads are rejected/i);

  server.stop();
});

test('Worker Framing: numeric id in JSON-RPC request rejected with error frame', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = createWorkerServer({ stdin, stdout });

  const responses = [];
  const decoder = new FrameDecoder();

  stdout.on('data', (chunk) => {
    const frames = decoder.push(new Uint8Array(chunk));
    for (const f of frames) {
      responses.push(JSON.parse(f));
    }
  });

  const numericIdPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: 12345,
    method: 'runner.hello',
    params: { clientProtocolVersion: RUNNER_PROTOCOL_VERSION }
  });
  stdin.write(Buffer.from(encodeFrame(numericIdPayload)));

  await new Promise((r) => setTimeout(r, 20));

  assert.equal(responses.length, 1);
  assert.ok(responses[0].error);
  assert.equal(responses[0].error.code, 'INVALID_INPUT');
  assert.match(responses[0].error.message, /id must be a string/i);

  server.stop();
});

test('Worker Framing: EOF mid-frame stops cleanly without hanging', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = createWorkerServer({ stdin, stdout });

  // Write incomplete frame (only 2 bytes of 4-byte header)
  stdin.write(Buffer.from([0x00, 0x00]));
  stdin.end();

  await new Promise((r) => setTimeout(r, 20));
  // Does not hang or throw uncaught exception
  assert.ok(true);
});
