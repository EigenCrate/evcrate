'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const PI = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/adapters/pi.cjs'));

const CWD = '/tmp/evcrate-pi-adapter-test';
const TARGET = { model: 'openai/gpt-5.6-sol', effort: 'high' };
const USAGE = {
  input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const USER = { role: 'user', content: [{ type: 'text', text: 'Review this checkpoint.' }], timestamp: 1 };
const ASSISTANT = {
  role: 'assistant', content: [{ type: 'text', text: 'Use the smallest safe change.' }],
  api: 'openai-responses', provider: 'openai', model: 'gpt-5.6-sol', usage: USAGE,
  stopReason: 'stop', timestamp: 2,
};
const ASSISTANT_START = { ...ASSISTANT, content: [], stopReason: 'pending' };

function stream({ eventExtra, cwd = CWD, messageExtra, willRetry = false } = {}) {
  const assistantEnd = messageExtra ? { ...ASSISTANT, ...messageExtra } : ASSISTANT;
  const events = [
    { type: 'session', version: 3, id: 'session-id', timestamp: '2026-08-29T00:00:00.000Z', cwd },
    { type: 'agent_start', ...(eventExtra || {}) },
    { type: 'turn_start' },
    { type: 'message_start', message: USER },
    { type: 'message_end', message: USER },
    { type: 'message_start', message: ASSISTANT_START },
    { type: 'message_update', assistantMessageEvent: { type: 'text_start', contentIndex: 0 } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Use the smallest safe change.' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: 'Use the smallest safe change.' } },
    { type: 'message_end', message: assistantEnd },
    { type: 'turn_end', message: assistantEnd, toolResults: [] },
    { type: 'agent_end', messages: [USER, assistantEnd], willRetry },
    { type: 'agent_settled' },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n');
}

function parse(stdout, cwd = CWD) {
  return PI.parseResult({ target: TARGET, cwd, execution: { stdout } });
}

test('Pi parser accepts the qualified no-tool JSONL lifecycle', () => {
  assert.deepEqual(parse(stream()), { recommendation: 'Use the smallest safe change.' });
});

test('Pi parser rejects unknown lifecycle fields and message metadata', () => {
  assert.throws(() => parse(stream({ eventExtra: { unexpected: true } })), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(stream({ messageExtra: { metadata: 'hidden' } })), { code: 'PROTOCOL_INVALID' });
});

test('Pi parser attests the exact controller workspace and settled non-retry lifecycle', () => {
  assert.throws(() => parse(stream({ cwd: '/tmp/other-workspace' })), { code: 'CWD_UNSAFE' });
  assert.throws(() => parse(stream({ willRetry: true })), { code: 'PROTOCOL_INVALID' });
});
