import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeJsonc, MANAGED_PI_PACKAGES, planManagedJson, planPiSettings
} from '../../dist/index.js';

const bytes = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(value);

const managedFragment = bytes(JSON.stringify({
  includeCoAuthoredBy: true,
  effortLevel: 'high',
  statusLine: { type: 'command', command: 'evcrate status' }
}));

test('managed JSONC changes only declared keys and preserves document bytes', () => {
  const existing = bytes('\ufeff{\r\n  // user-owned setting\r\n  "unrelated": 7,\r\n  "includeCoAuthoredBy": false,\r\n  "effortLevel": "low",\r\n  "statusLine": { "type": "path", },\r\n}\r\n');
  const plan = planManagedJson(existing, managedFragment, {
    managedKeys: ['includeCoAuthoredBy', 'effortLevel', 'statusLine']
  });
  assert.equal(plan.action, 'update');
  const result = text(plan.result);
  assert.ok(result.startsWith('\ufeff{\r\n'));
  assert.match(result, /user-owned setting/u);
  assert.match(result, /"unrelated": 7/u);
  assert.match(result, /"includeCoAuthoredBy": true/u);
  assert.match(result, /"effortLevel": "high"/u);
  assert.match(result, /"command":"evcrate status"/u);
  const parsed = decodeJsonc(plan.result, 'managed result').value;
  assert.deepEqual(parsed, {
    unrelated: 7,
    includeCoAuthoredBy: true,
    effortLevel: 'high',
    statusLine: { type: 'command', command: 'evcrate status' }
  });
  const repeated = planManagedJson(plan.result, managedFragment, {
    managedKeys: ['includeCoAuthoredBy', 'effortLevel', 'statusLine']
  });
  assert.equal(repeated.action, 'noop');
  assert.throws(() => planManagedJson(existing, bytes(JSON.stringify({
    includeCoAuthoredBy: 'wrong', effortLevel: 'high', statusLine: {}
  })), { managedKeys: ['includeCoAuthoredBy', 'effortLevel', 'statusLine'] }));
});

test('managed JSONC creates a canonical document and requires exact fragment keys', () => {
  const plan = planManagedJson(null, bytes('\ufeff{"a":1,"b":false}'), { managedKeys: ['a', 'b'] });
  assert.equal(plan.action, 'create');
  assert.equal(text(plan.result), '\ufeff{\n  "a": 1,\n  "b": false\n}\n');
  assert.throws(() => planManagedJson(null, bytes('{"a":1}'), { managedKeys: ['a', 'b'] }));
});

test('JSONC parsing enforces depth and node-count bounds', () => {
  let deep = '0';
  for (let index = 0; index < 40; index += 1) deep = `[${deep}]`;
  assert.throws(() => decodeJsonc(bytes(deep), 'deep JSONC'), /complex|deep/u);
  const manyKeys = `{${Array.from({ length: 100_001 }, (_, index) => `"k${index}":0`).join(',')}}`;
  assert.throws(() => planManagedJson(bytes(manyKeys), bytes('{"k0":0}'), { managedKeys: ['k0'] }), /complex/u);
});
test('JSONC rejects numbers that overflow finite JSON values', () => {
  assert.throws(() => decodeJsonc(bytes('{"value":1e999}'), 'overflow JSONC'), /finite|invalid/u);
  assert.throws(() => planManagedJson(null, bytes('{"value":1e999}'), { managedKeys: ['value'] }), /finite|invalid/u);
});

const piFragment = bytes(JSON.stringify({ packages: [...MANAGED_PI_PACKAGES] }));

test('Pi settings merge preserves unrelated packages and rejects pi-code conflicts', () => {
  const existing = bytes(JSON.stringify({ theme: 'dark', packages: [
    'npm:other@1.0.0', 'npm:pi-subagents@0.1.0',
    'npm:@juicesharp/rpiv-ask-user-question@2.0.0'
  ] }));
  const plan = planPiSettings(existing, piFragment);
  assert.equal(plan.action, 'merge-update');
  assert.deepEqual(JSON.parse(text(plan.result)), {
    theme: 'dark',
    packages: ['npm:other@1.0.0', ...MANAGED_PI_PACKAGES]
  });
  assert.equal(planPiSettings(plan.result, piFragment).action, 'noop');
  const conflict = planPiSettings(bytes(JSON.stringify({ packages: ['npm:pi-code@1.0.0'] })), piFragment);
  assert.equal(conflict.action, 'conflict');
  assert.equal(conflict.result, null);
  assert.throws(() => planPiSettings(existing, bytes('{"packages":["npm:wrong@1"]}')));
});
