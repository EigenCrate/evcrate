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
    { type: 'message_start', message: { ...assistant, content: [], stopReason: 'pending' } },
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

// Shape recorded from omp 18.8.4 with provider anthropic (anthropic/claude-opus-5-5); all text and ids are synthetic.
const ANTHROPIC_TARGET = { model: 'anthropic/claude-opus-5-5', effort: 'high' };
const ADVICE_BODY = {
  recommendation: 'Proceed with the smallest safe change.', rationale: 'The intended paths are inside the authorized paths.',
  must_fix: ['Add the missing disposition.'], cautions: ['Keep the move mechanical.'], assumptions: ['Checkpoint data is accurate.'],
  success_checks: ['Run the focused tests.'], unresolved_questions: [],
};
const ANTHROPIC_18_8_4 = {
  role: 'assistant', api: 'anthropic-messages', provider: 'anthropic', model: 'claude-opus-5-5',
  content: [{ type: 'thinking', thinking: 'Synthetic reasoning.', thinkingSignature: '' }, { type: 'text', text: JSON.stringify(ADVICE_BODY) }],
  usage: { input: 4, output: 8, cacheRead: 0, cacheWrite: 9740, totalTokens: 9752,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cttl: { ephemeral1h: 9740 } },
  stopReason: 'stop', timestamp: 2,
  requestControls: { messageIndex: 1, tools: { declared: [], deferred: [], active: [] }, effort: { topLevel: 'high', tail: 'high' } },
  responseId: 'response-id', credentialId: 24, duration: 1, ttft: 1, completedAt: 3,
};
function parseAnthropic(messageExtra, assistant = ANTHROPIC_18_8_4, checkpoint) {
  return OMP.parseResult({ target: ANTHROPIC_TARGET, cwd: CWD, checkpoint, execution: { stdout: stream({ assistant, messageExtra }) } });
}

test('OMP parser accepts anthropic requestControls and usage.cttl across message_start, message_end, turn_end and agent_end', () => {
  assert.deepEqual(Object.keys(ANTHROPIC_18_8_4).sort(), ['api', 'completedAt', 'content', 'credentialId', 'duration', 'model', 'provider',
    'requestControls', 'responseId', 'role', 'stopReason', 'timestamp', 'ttft', 'usage']);
  assert.deepEqual(Object.keys(ANTHROPIC_18_8_4.usage).sort(), ['cacheRead', 'cacheWrite', 'cost', 'cttl', 'input', 'output', 'totalTokens']);
  // stream() embeds the same assistant (including both new fields) in message_start (content-less), message_end, turn_end and agent_end.
  const stdout = stream({ assistant: ANTHROPIC_18_8_4 });
  const events = stdout.split('\n').map((line) => JSON.parse(line));
  const copies = [events.find((e) => e.type === 'message_start' && e.message.role === 'assistant').message,
    events.find((e) => e.type === 'message_end' && e.message.role === 'assistant').message,
    events.find((e) => e.type === 'turn_end').message, events.find((e) => e.type === 'agent_end').messages[1]];
  for (const copy of copies) assert.deepEqual([copy.requestControls, copy.usage.cttl], [ANTHROPIC_18_8_4.requestControls, { ephemeral1h: 9740 }]);
  assert.deepEqual(parseAnthropic(), { recommendation: JSON.stringify(ADVICE_BODY) });
  assert.deepEqual(parseAnthropic(undefined, ANTHROPIC_18_8_4, { version: 2 }), ADVICE_BODY);
});

test('OMP parser keeps requestControls and usage.cttl optional', () => {
  const noControls = without(ANTHROPIC_18_8_4, 'requestControls');
  const noCttl = { ...ANTHROPIC_18_8_4, usage: without(ANTHROPIC_18_8_4.usage, 'cttl') };
  const bare = { ...noControls, usage: noCttl.usage };
  for (const assistant of [noControls, noCttl, bare]) {
    assert.deepEqual(parseAnthropic(undefined, assistant, { version: 2 }), ADVICE_BODY);
  }
  // Existing providers are unaffected: the fields are accepted but never required.
  assert.deepEqual(parse(stream({ assistant: CODEX_18_7_0 })), { recommendation: 'Use the smallest safe change.' });
});

test('OMP parser rejects malformed requestControls', () => {
  const nested = (depth) => Array.from({ length: depth }).reduce((inner) => ({ inner }), {});
  const malformed = [
    null, true, 1, 'effort=high', [], [{ messageIndex: 1 }],
    { blob: 'x'.repeat(4096) }, // over the 4096-byte serialized bound
    nested(8), // over the depth bound
    { items: Array.from({ length: 300 }, (_, index) => index) }, // over the node bound
  ];
  for (const requestControls of malformed) {
    assert.throws(() => parseAnthropic({ requestControls }), { code: 'PROTOCOL_INVALID' });
  }
  assert.deepEqual(parseAnthropic({ requestControls: nested(5) }, ANTHROPIC_18_8_4, { version: 2 }), ADVICE_BODY);
  assert.deepEqual(parseAnthropic({ requestControls: {} }, ANTHROPIC_18_8_4, { version: 2 }), ADVICE_BODY);
});

test('OMP parser rejects malformed usage.cttl', () => {
  const malformed = [null, 5, 'ephemeral1h', [], [1], { ephemeral1h: '9740' }, { ephemeral1h: null }, { ephemeral1h: -1 },
    { ephemeral1h: true }, { ephemeral1h: { tokens: 1 } }, { ephemeral1h: 1, ephemeral5m: 'x' },
    Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`bucket${index}`, 1]))];
  for (const cttl of malformed) {
    const usage = { ...ANTHROPIC_18_8_4.usage, cttl };
    assert.throws(() => parseAnthropic({ usage }), { code: 'PROTOCOL_INVALID' });
  }
  const usage = { ...ANTHROPIC_18_8_4.usage, cttl: { ephemeral1h: 9740, ephemeral5m: 0 } };
  assert.deepEqual(parseAnthropic({ usage }, ANTHROPIC_18_8_4, { version: 2 }), ADVICE_BODY);
});

test('OMP parser still rejects unknown keys alongside requestControls and usage.cttl', () => {
  assert.throws(() => parseAnthropic({ unexpected: true }), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parseAnthropic({ requestControl: {} }), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parseAnthropic({ usage: { ...ANTHROPIC_18_8_4.usage, ctt: {} } }), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parseAnthropic({ usage: { ...ANTHROPIC_18_8_4.usage, foo: 0 } }), { code: 'PROTOCOL_INVALID' });
  assert.throws(() => parseAnthropic({ provider: 'openai-codex' }), { code: 'MODEL_UNSUPPORTED' });
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
        if (key === 'usage --help') return { stdout: 'Options:\n  --json\n  --redact\n  --provider\n  --no-extensions', stderr: '' };
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

test('OMP network probes finish beyond five seconds but remain bounded by the shared deadline', { timeout: 45000 }, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const RUNNER = require(path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor/runner.cjs'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-omp-network-probe-'));
  const { context } = probeContext();
  const fixtureRunner = context.runner;
  const execution = RUNNER.createRunner();
  const outcomes = [];
  const scriptPath = path.join(cwd, 'probe-response.cjs');
  const deadline = Date.now() + 30000;
  context.cwd = cwd;
  context.workspaceRoot = cwd;
  context.createInvocation = (invocation) => ({ ...invocation });
  context.runner = RUNNER.createProbeRunner({
    deadline,
    now: Date.now,
    runner: {
      async run(invocation) {
        const response = await fixtureRunner.run(invocation);
        const networked = (invocation.argv[0] === 'usage' && !invocation.argv.includes('--help'))
          || (invocation.argv[0] === 'models' && invocation.argv[1] === 'find');
        // Real child-process latency exercises timeout/cleanup, not just the
        // adapter's limit values. CLI responses stand in for the external OMP.
        fs.writeFileSync(scriptPath,
          `setTimeout(() => process.stdout.write(${JSON.stringify(response.stdout)}), ${networked ? 6000 : 0});\n`);
        const result = await execution.run(RUNNER.createInvocation({
          ...invocation,
          executable: process.execPath,
          argv: [scriptPath],
        }), { environment: {} });
        outcomes.push(result);
        return result;
      },
    },
  });
  try {
    await OMP.probeVersion(context);
    assert.deepEqual(await OMP.probeAuth(context), { authenticated: true });
    assert.equal((await OMP.probeCapabilities(context)).model, TARGET.model);

    context.runner = RUNNER.createProbeRunner({
      runner: context.runner,
      deadline: Date.now() + 250,
      now: Date.now,
    });
    await assert.rejects(() => OMP.probeAuth(context), (error) => OMP.classifyFailure(error) === 'TIMEOUT');
    assert.equal(outcomes.find((result) => result.error?.code === 'TIMEOUT').cleanupOutcome, 'confirmed');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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
