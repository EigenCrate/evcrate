'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const OMP = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/adapters/omp.cjs'));
const CWD = '/tmp/evcrate-omp-adapter-test';
const TARGET = { model: 'openai-codex/gpt-5.6-sol', effort: 'high' };
const USAGE = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const USER = { role: 'user', content: [{ type: 'text', text: 'Review this checkpoint.' }], attribution: 'user', timestamp: 1 };
const ASSISTANT = {
  role: 'assistant', content: [{ type: 'text', text: 'Use the smallest safe change.' }], api: 'openai-codex-responses',
  provider: 'openai-codex', model: 'gpt-5.6-sol', usage: USAGE, stopReason: 'stop', timestamp: 2,
  responseId: 'response-id', duration: 1, ttft: 1, completedAt: 3,
};
const ASSISTANT_START = { ...ASSISTANT, content: [], stopReason: 'pending' };

function stream({ eventExtra, cwd = CWD, messageExtra, assistant = ASSISTANT, deltas = [], tool = false, willRetry } = {}) {
  const assistantEnd = messageExtra ? { ...assistant, ...messageExtra } : assistant;
  const events = [
    { type: 'session', version: 3, id: 'session-id', timestamp: '2026-08-29T00:00:00.000Z', cwd },
    { type: 'agent_start', ...(eventExtra || {}) }, { type: 'turn_start' },
    { type: 'message_start', message: USER }, { type: 'message_end', message: USER },
    { type: 'message_start', message: ASSISTANT_START },
    { type: 'message_update', assistantMessageEvent: { type: 'text_start', contentIndex: 0 } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Use the smallest safe change.' } },
    ...deltas.map((delta) => ({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta } })),
    { type: 'message_update', assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: 'Use the smallest safe change.' } },
    { type: 'message_end', message: assistantEnd },
    { type: 'turn_end', message: assistantEnd, toolResults: tool ? [{ toolCallId: 'x' }] : [] },
    { type: 'agent_end', messages: [USER, assistantEnd], isTerminal: true, ...(willRetry === undefined ? {} : { willRetry }) },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n');
}
function parse(stdout, cwd = CWD) { return OMP.parseResult({ target: TARGET, cwd, execution: { stdout } }); }

test('OMP parser accepts the qualified no-tool JSONL lifecycle', () => {
  assert.deepEqual(parse(stream()), { recommendation: 'Use the smallest safe change.' });
});

test('OMP parser rejects unexpected fields and route mismatches', () => {
  assert.throws(() => parse(stream({ eventExtra: { unexpected: true } })), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parse(stream({ cwd: '/tmp/other-workspace' })), { code: 'CWD_UNSAFE' });
  assert.throws(() => parse(stream({ messageExtra: { model: 'other-model' } })), { code: 'MODEL_UNSUPPORTED' });
  assert.throws(() => parse(stream({ messageExtra: { responseModel: 'other-model' } })), { code: 'MODEL_UNSUPPORTED' });
});

test('OMP parser rejects tool results and retries', () => {
  assert.throws(() => parse(stream({ tool: true })), { code: 'READ_ONLY_UNSUPPORTED' });
  assert.throws(() => parse(stream({ willRetry: true })), { code: 'PROTOCOL_INVALID' });
});

// Key/structure shapes recorded from real omp output; all text is synthetic.
const CODEX_18_7_0 = {
  role: 'assistant', content: ASSISTANT.content, api: 'openai-codex-responses', provider: 'openai-codex', model: 'gpt-5.6-sol',
  usage: { ...USAGE, reasoningTokens: 0, premiumRequests: 0 }, stopReason: 'stop', timestamp: 2, credentialId: 'credential-id',
  responseId: 'response-id', serviceTier: 'default', duration: 1, ttft: 1, completedAt: 3,
};
function without(object, ...keys) { return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))); }
const CODEX_18_6_3 = {
  ...without(CODEX_18_7_0, 'serviceTier'), usage: without(CODEX_18_7_0.usage, 'premiumRequests'),
};
const ANTIGRAVITY_BACKUP = {
  ...without(CODEX_18_6_3, 'responseId'), usage: without(CODEX_18_6_3.usage, 'reasoningTokens'),
};

test('OMP parser accepts recorded omp v18.7.0, v18.6.3 and antigravity message shapes', () => {
  assert.deepEqual(Object.keys(CODEX_18_7_0).sort(), ['api', 'completedAt', 'content', 'credentialId', 'duration', 'model', 'provider',
    'responseId', 'role', 'serviceTier', 'stopReason', 'timestamp', 'ttft', 'usage']);
  assert.deepEqual(Object.keys(CODEX_18_7_0.usage).sort(), ['cacheRead', 'cacheWrite', 'cost', 'input', 'output', 'premiumRequests',
    'reasoningTokens', 'totalTokens']);
  for (const assistant of [CODEX_18_7_0, CODEX_18_6_3, ANTIGRAVITY_BACKUP]) {
    // stream() reuses the same assistant in message_end, turn_end and agent_end.messages[1].
    assert.deepEqual(parse(stream({ assistant })), { recommendation: 'Use the smallest safe change.' });
  }
  assert.equal('serviceTier' in CODEX_18_6_3 || 'premiumRequests' in CODEX_18_6_3.usage, false);
  assert.equal('responseId' in ANTIGRAVITY_BACKUP || 'serviceTier' in ANTIGRAVITY_BACKUP, false);
  assert.equal('reasoningTokens' in ANTIGRAVITY_BACKUP.usage || 'premiumRequests' in ANTIGRAVITY_BACKUP.usage, false);
});

test('OMP parser validates serviceTier and premiumRequests', () => {
  for (const serviceTier of ['', 1, null, {}]) {
    assert.throws(() => parse(stream({ assistant: CODEX_18_7_0, messageExtra: { serviceTier } })), { code: 'PROTOCOL_INVALID' });
  }
  for (const premiumRequests of [-1, Number.NaN, '0', null]) {
    const usage = { ...CODEX_18_7_0.usage, premiumRequests };
    assert.throws(() => parse(stream({ assistant: CODEX_18_7_0, messageExtra: { usage } })), { code: 'PROTOCOL_INVALID' });
  }
  assert.throws(() => parse(stream({ assistant: CODEX_18_7_0, messageExtra: { foo: 'bar' } })), { code: 'PROTOCOL_INVALID' });
  const usage = { ...CODEX_18_7_0.usage, foo: 0 };
  assert.throws(() => parse(stream({ assistant: CODEX_18_7_0, messageExtra: { usage } })), { code: 'PROTOCOL_INVALID' });
});

test('OMP parser enforces the 1 MiB byte and 8192 line limits', () => {
  const MAX_BYTES = 1024 * 1024;
  const base = Buffer.byteLength(stream({ deltas: [''] }), 'utf8');
  const atLimit = stream({ deltas: ['x'.repeat(MAX_BYTES - base)] });
  assert.equal(Buffer.byteLength(atLimit, 'utf8'), MAX_BYTES);
  assert.deepEqual(parse(atLimit), { recommendation: 'Use the smallest safe change.' });
  assert.throws(() => parse(stream({ deltas: ['x'.repeat(MAX_BYTES - base + 1)] })), { code: 'OUTPUT_LIMIT' });

  const baseLines = stream().split('\n').length;
  assert.deepEqual(parse(stream({ deltas: Array(8192 - baseLines).fill('') })), { recommendation: 'Use the smallest safe change.' });
  assert.throws(() => parse(stream({ deltas: Array(8193 - baseLines).fill('') })), { code: 'PROTOCOL_INVALID' });
});

test('OMP parser rejects undocumented advisor_yielded event', () => {
  const events = [
    { type: 'session', version: 3, id: 'session-id', timestamp: '2026-08-29T00:00:00.000Z', cwd: CWD },
    { type: 'agent_start' }, { type: 'turn_start' },
    { type: 'message_start', message: USER }, { type: 'message_end', message: USER },
    { type: 'message_start', message: ASSISTANT_START },
    { type: 'message_update', assistantMessageEvent: { type: 'text_start', contentIndex: 0 } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Use the smallest safe change.' } },
    { type: 'message_update', assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: 'Use the smallest safe change.' } },
    { type: 'message_end', message: ASSISTANT },
    { type: 'turn_end', message: ASSISTANT, toolResults: [] },
    { type: 'advisor_yielded' },
    { type: 'agent_end', messages: [USER, ASSISTANT], isTerminal: true },
  ];
  const payload = events.map((e) => JSON.stringify(e)).join('\n');
  assert.throws(() => parse(payload), { code: 'PROTOCOL_INVALID' });
});

function probeContext({
  versionStdout = 'omp 0.150.1',
  usageStdout = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 2 }] }
  }),
  modelsStdout = JSON.stringify({
    models: [{
      provider: 'openai-codex',
      id: 'gpt-5.6-sol',
      selector: 'openai-codex/gpt-5.6-sol',
      thinking: ['high']
    }]
  })
} = {}) {
  const calls = [];
  const context = {
    target: TARGET,
    cwd: process.cwd(),
    workspaceRoot: process.cwd(),
    createInvocation: (inv) => ({ ...inv }),
    environment: {},
    requestDepth: 0,
    runner: {
      run: async (invocation) => {
        calls.push(invocation.argv);
        const key = invocation.argv.join(' ');
        if (key === '--version') return { stdout: versionStdout, stderr: '' };
        if (key === 'usage --help') return { stdout: 'Options:\n  --json\n  --redact\n  --provider', stderr: '' };
        if (invocation.argv[0] === 'usage') return { stdout: usageStdout, stderr: '' };
        if (key === '--help') return { stdout: 'Options:\n  -p\n  --mode json\n  --model\n  --thinking\n  --no-session\n  --no-tools\n  --no-lsp\n  --no-pty\n  --no-extensions\n  --no-skills\n  --no-rules', stderr: '' };
        if (key === 'models --help') return { stdout: 'find', stderr: '' };
        if (invocation.argv[0] === 'models' && invocation.argv[1] === 'find') return { stdout: modelsStdout, stderr: '' };
        throw new Error(`Unexpected probe invocation: ${key}`);
      }
    }
  };
  return { context, calls };
}

test('OMP probeAuth validates usable auth readiness', async () => {
  const { context } = probeContext();
  await OMP.probeVersion(context);
  assert.deepEqual(await OMP.probeAuth(context), { authenticated: true });
});

test('OMP probeAuth rejects when limits are exhausted, capacity is zero, or readiness is unproven (R2)', async () => {
  // Exhausted limit
  const exhaustedUsage = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'exhausted' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 2 }] }
  });
  const { context: ctx1 } = probeContext({ usageStdout: exhaustedUsage });
  await OMP.probeVersion(ctx1);
  await assert.rejects(() => OMP.probeAuth(ctx1), { code: 'AUTH_UNAVAILABLE' });

  // Zero capacity
  const zeroCapacity = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 0 }] }
  });
  const { context: ctx2 } = probeContext({ usageStdout: zeroCapacity });
  await OMP.probeVersion(ctx2);
  await assert.rejects(() => OMP.probeAuth(ctx2), { code: 'AUTH_UNAVAILABLE' });

  // Empty limits
  const emptyLimits = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 2 }] }
  });
  const { context: ctx3 } = probeContext({ usageStdout: emptyLimits });
  await OMP.probeVersion(ctx3);
  await assert.rejects(() => OMP.probeAuth(ctx3), { code: 'AUTH_UNAVAILABLE' });

  // Mixed ok and exhausted limits
  const mixedLimits = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }, { status: 'exhausted' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: 2 }] }
  });
  const { context: ctx4 } = probeContext({ usageStdout: mixedLimits });
  await OMP.probeVersion(ctx4);
  await assert.rejects(() => OMP.probeAuth(ctx4), { code: 'AUTH_UNAVAILABLE' });

  // Disabled credential with absent capacity
  const disabledNoCap = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [{ provider: 'openai-codex' }],
    capacity: {}
  });
  const { context: ctx5 } = probeContext({ usageStdout: disabledNoCap });
  await OMP.probeVersion(ctx5);
  await assert.rejects(() => OMP.probeAuth(ctx5), { code: 'AUTH_UNAVAILABLE' });

  // Malformed string remainingAccounts
  const stringRemaining = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'openai-codex': [{ remainingAccounts: '2' }] }
  });
  const { context: ctx6 } = probeContext({ usageStdout: stringRemaining });
  await OMP.probeVersion(ctx6);
  await assert.rejects(() => OMP.probeAuth(ctx6), { code: 'AUTH_UNAVAILABLE' });

  // Otherwise-valid readiness with empty capacity
  const emptyCapacity = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: {}
  });
  const { context: ctx7 } = probeContext({ usageStdout: emptyCapacity });
  await OMP.probeVersion(ctx7);
  await assert.rejects(() => OMP.probeAuth(ctx7), { code: 'AUTH_UNAVAILABLE' });

  // Capacity with only an unrelated provider
  const unrelatedCapacity = JSON.stringify({
    generatedAt: 1788801919525,
    reports: [{ provider: 'openai-codex', fetchedAt: 1788801906529, limits: [{ status: 'ok' }] }],
    accountsWithoutUsage: [],
    disabledCredentials: [],
    capacity: { 'unrelated-provider': [{ remainingAccounts: 2 }] }
  });
  const { context: ctx8 } = probeContext({ usageStdout: unrelatedCapacity });
  await OMP.probeVersion(ctx8);
  await assert.rejects(() => OMP.probeAuth(ctx8), { code: 'AUTH_UNAVAILABLE' });
});

test('OMP buildInvocation merges explicit generation limits', async () => {
  const { context } = probeContext();
  await OMP.probeVersion(context);
  await OMP.probeAuth(context);
  await OMP.probeCapabilities(context);
  delete context.createInvocation;
  context.prompt = '{"checkpoint":"test"}';
  context.limits = { mode: 'generation', warnAfterMs: 120000 };
  const invocation = OMP.buildInvocation(context);
  assert.equal(invocation.adapter, 'omp');
  assert.equal(invocation.limits.mode, 'generation');
  assert.equal(invocation.limits.warnAfterMs, 120000);
  assert.equal(invocation.limits.timeoutMs, undefined);
  assert.ok(invocation.argv.includes('--no-session'));
  assert.ok(invocation.argv.includes('--no-tools'));
});


test('OMP classifyFailure preserves structured transient and lifecycle errors', () => {
  const { createRoutingError } = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/errors.cjs'));
  assert.equal(OMP.classifyFailure(createRoutingError('TRANSIENT_PROVIDER_ERROR')), 'TRANSIENT_PROVIDER_ERROR');
  assert.equal(OMP.classifyFailure(createRoutingError('READ_ONLY_UNSUPPORTED')), 'READ_ONLY_UNSUPPORTED');
  assert.equal(OMP.classifyFailure(createRoutingError('OUTPUT_LIMIT')), 'OUTPUT_LIMIT');
  assert.equal(OMP.classifyFailure(new Error('arbitrary exit')), 'PROCESS_FAILED');
});
