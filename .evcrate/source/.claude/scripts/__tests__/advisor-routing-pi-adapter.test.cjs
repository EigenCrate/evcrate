'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const adapter = require('../advisor-routing/adapters/pi.cjs');
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const { dispatchExternal } = require('../advisor-dispatch.cjs');
const {
  DEFAULT_LIMITS,
  createInvocation,
  createRunnerFailure,
  runInvocation
} = require('../advisor-routing/runner.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'pi', 'fake-pi-cli.cjs');
const SUCCESS = fs.readFileSync(path.join(__dirname, 'fixtures', 'pi', 'result-success.jsonl'), 'utf8');

function successEvents() {
  return SUCCESS.trimEnd().split(/\r?\n/u).map((line) => JSON.parse(line));
}

function encodeEvents(events) {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

function parseResult(stdout, route) {
  return adapter.parseResult({
    execution: { stdout },
    limits: DEFAULT_LIMITS,
    descriptor: descriptor(route),
  });
}

async function waitForCapture(captures, count) {
  const deadline = Date.now() + 1_000;
  while (captures.length < count) {
    if (Date.now() >= deadline) throw new Error(`expected ${count} captures, got ${captures.length}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function descriptor({ model = 'openai-codex/gpt-5.6-sol', effort = 'high', activeHost = 'codex' } = {}) {
  return Object.freeze({
    schema: 'evcrate-advisor-route/v1',
    version: 1,
    activeHost,
    route: Object.freeze({ backend: 'pi', model, effort, execution: 'external' }),
    source: 'test',
    action: 'external',
    nativeCapability: null,
    adapter: 'pi'
  });
}

function workspaceFor({ install = true, shortProbe = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-pi-adapter-'));
  const bin = path.join(root, 'bin');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cwd, { mode: 0o700 });
  if (install) fs.symlinkSync(FIXTURE, path.join(bin, 'pi'));
  const created = [];
  const context = {
    descriptor: descriptor(),
    brief: 'Reply exactly: Pi stdin',
    cwd,
    workspaceRoot: root,
    environment: {
      PATH: install ? `${bin}${path.delimiter}${process['env'].PATH || ''}` : bin,
      HOME: root
    },
    runner: { run(invocation, options) { return runInvocation(invocation, options); } },
    createInvocation(specification) {
      created.push(specification);
      return createInvocation(shortProbe
        ? { ...specification, limits: { ...specification.limits, timeoutMs: 40, killGraceMs: 10 } }
        : specification);
    },
    created
  };
  return { root, context };
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

function fakeRunner(mode, captures = []) {
  return Object.freeze({
    async run(invocation, options = {}) {
      captures.push({ executable: invocation.executable, argv: [...invocation.argv], prompt: invocation.prompt });
      if (mode === 'executable') return runInvocation(invocation, { ...options, environment: { PATH: '' } });
      const limits = mode === 'timeout' || mode === 'cancel'
        ? { ...invocation.limits, timeoutMs: 40, killGraceMs: 10 } : invocation.limits;
      const fakeInvocation = createInvocation({
        adapter: invocation.adapter,
        executable: process.execPath,
        argv: [FIXTURE, '--mode', mode, ...invocation.argv],
        cwd: invocation.cwd,
        workspaceRoot: invocation.workspaceRoot,
        prompt: invocation.prompt,
        authKeys: [],
        limits
      });
      return runInvocation(fakeInvocation, options);
    }
  });
}

async function dispatch(mode = 'success', options = {}) {
  const fixture = workspaceFor(options);
  const captures = options.captures || [];
  try {
    return await dispatchExternal({
      descriptor: descriptor(options.route),
      brief: options.brief || 'bounded brief'
    }, {
      registry: { getAdapter: () => adapter },
      runner: fakeRunner(mode, captures),
      environment: fixture.context.environment,
      signal: options.signal
    });
  } finally {
    cleanup(fixture);
  }
}

test('exports a frozen Pi adapter with no EVCrate or credential environment keys', () => {
  assert.equal(adapter.name, 'pi');
  assert.deepEqual(adapter.authKeys, []);
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(adapter.authKeys));
  assert.deepEqual(Object.keys(adapter), [
    'name', 'authKeys', 'probeVersion', 'probeAuth', 'probeCapabilities',
    'buildInvocation', 'parseResult', 'classifyFailure'
  ]);
  const source = fs.readFileSync(path.join(__dirname, '..', 'advisor-routing', 'adapters', 'pi.cjs'), 'utf8');
  assert.doesNotMatch(source, /(?:auth\.json|settings\.json|PI_CODING_AGENT_DIR|--api-key|--credentials)/iu);
});

test('probes auth without credential output and preserves exact provider/model/thinking argv', async () => {
  const captures = [];
  const result = await dispatch('success', { captures, brief: 'Pi stdin only' });
  assert.equal(result.ok, true);
  assert.equal(result.result.response, 'PI_OK');
  assert.deepEqual(captures.map(({ argv }) => argv), [
    ['--version'],
    ['auth', 'check', '--provider', 'openai-codex', '--model', 'gpt-5.6-sol', '--json', '--no-refresh'],
    ['--help'],
    ['-p', '--mode', 'json', '--no-session', '--no-extensions', '--no-tools', '--provider', 'openai-codex', '--model', 'gpt-5.6-sol', '--thinking', 'high']
  ]);
  assert.equal(captures.at(-1).prompt, 'Pi stdin only');
  assert.ok(captures.every(({ argv }) => argv.every((arg) => !arg.includes('Pi stdin only'))));
});

test('preserves a cross-provider route without inheriting the active host selector', async () => {
  const captures = [];
  const result = await dispatch('success', {
    captures,
    route: { model: 'anthropic/claude-sonnet-4' },
    brief: 'cross-provider brief',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(captures.map(({ argv }) => argv), [
    ['--version'],
    ['auth', 'check', '--provider', 'anthropic', '--model', 'claude-sonnet-4', '--json', '--no-refresh'],
    ['--help'],
    ['-p', '--mode', 'json', '--no-session', '--no-extensions', '--no-tools', '--provider', 'anthropic', '--model', 'claude-sonnet-4', '--thinking', 'high'],
  ]);
});

test('covers the eleven adapter failure categories', async () => {
  const cases = [
    ['executable', 'EXECUTABLE_UNAVAILABLE', { install: false }],
    ['version', 'CLI_VERSION_UNSUPPORTED', {}],
    ['auth', 'AUTH_UNAVAILABLE', {}],
    ['auth-missing-model', 'MODEL_UNSUPPORTED', {}],
    ['model', 'MODEL_UNSUPPORTED', {}],
    ['effort', 'EFFORT_UNSUPPORTED', {}],
    ['read-only', 'READ_ONLY_UNSUPPORTED', {}],
    ['session', 'SESSION_UNSUPPORTED', {}],
    ['output', 'OUTPUT_UNSUPPORTED', {}],
    ['timeout', 'TIMEOUT', { shortProbe: true }]
  ];
  for (const [mode, expected, options] of cases) {
    const captures = [];
    await assert.rejects(dispatch(mode, { ...options, captures }), (error) => error?.code === expected, mode);
    if (mode === 'timeout') assert.equal(captures.length, 4);
  }
  await assert.rejects(dispatch('process'), (error) => error?.code === 'MODEL_UNSUPPORTED');
  const controller = new AbortController();
  const captures = [];
  const pending = dispatch('cancel', { shortProbe: true, signal: controller.signal, captures });
  await waitForCapture(captures, 4);
  controller.abort();
  await assert.rejects(pending, (error) => error?.code === 'CANCELLED');

  const fixture = workspaceFor();
  fixture.context.environment.EVCRATE_ADVISOR_ACTIVE = '1';
  try {
    await assert.rejects(dispatchExternal({ descriptor: descriptor(), brief: 'bounded brief' }, {
      registry: { getAdapter: () => { throw new Error('lookup must not run'); } },
      environment: fixture.context.environment
    }), (error) => error?.code === 'ADVISOR_RECURSION');
  } finally {
    cleanup(fixture);
  }
});

test('parses one bounded terminal JSON event stream and rejects unsafe or partial output', () => {
  assert.deepEqual(parseResult(SUCCESS), {
    response: 'PI_OK'
  });
  const dangerous = fs.readFileSync(path.join(__dirname, 'fixtures', 'pi', 'result-dangerous.jsonl'), 'utf8');
  assert.throws(() => parseResult(dangerous),
    (error) => error?.code === 'READ_ONLY_UNSUPPORTED');
  const stopped = fs.readFileSync(path.join(__dirname, 'fixtures', 'pi', 'result-stopped.jsonl'), 'utf8');
  assert.throws(() => parseResult(stopped),
    (error) => error?.code === 'CANCELLED');
  const lifecycleStreams = [];
  const missingStart = successEvents();
  missingStart.splice(missingStart.findIndex((event) => event.type === 'message_start'
    && event.message.role === 'assistant'), 1);
  lifecycleStreams.push(missingStart);
  const duplicateStart = successEvents();
  const assistantStartIndex = duplicateStart.findIndex((event) => event.type === 'message_start'
    && event.message.role === 'assistant');
  duplicateStart.splice(assistantStartIndex, 0, JSON.parse(JSON.stringify(duplicateStart[assistantStartIndex])));
  lifecycleStreams.push(duplicateStart);
  const duplicateEnd = successEvents();
  const assistantEndIndex = duplicateEnd.findIndex((event) => event.type === 'message_end'
    && event.message.role === 'assistant');
  duplicateEnd.splice(assistantEndIndex + 1, 0, JSON.parse(JSON.stringify(duplicateEnd[assistantEndIndex])));
  lifecycleStreams.push(duplicateEnd);
  const updateAfterEnd = successEvents();
  const update = updateAfterEnd.find((event) => event.type === 'message_update');
  updateAfterEnd.splice(updateAfterEnd.findIndex((event) => event.type === 'message_end'
    && event.message.role === 'assistant') + 1, 0, JSON.parse(JSON.stringify(update)));
  lifecycleStreams.push(updateAfterEnd);
  const missingTurnMessage = successEvents();
  delete missingTurnMessage.find((event) => event.type === 'turn_end').message;
  lifecycleStreams.push(missingTurnMessage);
  const mismatchedTurnMessage = successEvents();
  mismatchedTurnMessage.find((event) => event.type === 'turn_end').message.id = 'user-1';
  lifecycleStreams.push(mismatchedTurnMessage);
  const malformedAgentMessage = successEvents();
  malformedAgentMessage.find((event) => event.type === 'agent_end').messages[0] = null;
  lifecycleStreams.push(malformedAgentMessage);
  const unknownAgentMessage = successEvents();
  unknownAgentMessage.find((event) => event.type === 'agent_end').messages[0].id = 'unknown-1';
  lifecycleStreams.push(unknownAgentMessage);
  const duplicateAgentMessage = successEvents();
  const duplicateAgentEnd = duplicateAgentMessage.find((event) => event.type === 'agent_end');
  duplicateAgentEnd.messages.push(JSON.parse(JSON.stringify(duplicateAgentEnd.messages.at(-1))));
  lifecycleStreams.push(duplicateAgentMessage);
  for (const events of lifecycleStreams) {
    assert.throws(() => parseResult(encodeEvents(events)),
      (error) => error?.code === 'PROTOCOL_INVALID');
  }
  const mismatched = SUCCESS.split('\n');
  mismatched[mismatched.length - 2] = mismatched[mismatched.length - 2].replace('PI_OK', 'PI_OTHER');
  for (const stdout of [
    'not-json',
    SUCCESS.replace(/\n\{"type":"agent_end"[\s\S]*$/u, '\n'),
    mismatched.join('\n'),
    `${SUCCESS}${SUCCESS}`
  ]) {
    assert.throws(() => parseResult(stdout),
      (error) => error?.code === 'PROTOCOL_INVALID');
  }
  const oversized = SUCCESS.replace('PI_OK', 'x'.repeat(40 * 1024));
  assert.throws(() => parseResult(oversized),
      (error) => error?.code === 'OUTPUT_LIMIT');
});

test('requires exact terminal route metadata and rejects mismatched optional effort', () => {
  const wrongProvider = successEvents();
  wrongProvider.find((event) => event.type === 'message_end' && event.message.role === 'assistant')
    .message.provider = 'anthropic';
  assert.throws(() => parseResult(encodeEvents(wrongProvider)),
    (error) => error?.code === 'MODEL_UNSUPPORTED');

  const missingModel = successEvents();
  delete missingModel.find((event) => event.type === 'message_end' && event.message.role === 'assistant')
    .message.model;
  assert.throws(() => parseResult(encodeEvents(missingModel)),
    (error) => error?.code === 'MODEL_UNSUPPORTED');

  const wrongEffort = successEvents();
  wrongEffort.find((event) => event.type === 'message_end' && event.message.role === 'assistant')
    .message.thinkingLevel = 'low';
  assert.throws(() => parseResult(encodeEvents(wrongEffort)),
    (error) => error?.code === 'EFFORT_UNSUPPORTED');

  const wrongTurnProvider = successEvents();
  wrongTurnProvider.find((event) => event.type === 'turn_end').message.provider = 'anthropic';
  assert.throws(() => parseResult(encodeEvents(wrongTurnProvider)),
    (error) => error?.code === 'MODEL_UNSUPPORTED');

  const wrongAgentModel = successEvents();
  wrongAgentModel.find((event) => event.type === 'agent_end').messages
    .find((message) => message.role === 'assistant').model = 'other-model';
  assert.throws(() => parseResult(encodeEvents(wrongAgentModel)),
    (error) => error?.code === 'MODEL_UNSUPPORTED');

  const wrongAgentEffort = successEvents();
  wrongAgentEffort.find((event) => event.type === 'agent_end').messages
    .find((message) => message.role === 'assistant').thinkingLevel = 'low';
  assert.throws(() => parseResult(encodeEvents(wrongAgentEffort)),
    (error) => error?.code === 'EFFORT_UNSUPPORTED');
});

test('requires the reviewed Pi v3 session header and a complete agent message set', () => {
  for (const mutate of [
    (session) => { session.version = 2; },
    (session) => { delete session.id; },
    (session) => { session.timestamp = 'not-a-timestamp'; },
    (session) => { session.cwd = 'relative/workspace'; },
  ]) {
    const events = successEvents();
    mutate(events[0]);
    assert.throws(() => parseResult(encodeEvents(events)),
      (error) => error?.code === 'PROTOCOL_INVALID');
  }

  const omittedMessage = successEvents();
  omittedMessage.find((event) => event.type === 'agent_end').messages.pop();
  assert.throws(() => parseResult(encodeEvents(omittedMessage)),
    (error) => error?.code === 'PROTOCOL_INVALID');

  const changedUserPayload = successEvents();
  changedUserPayload.find((event) => event.type === 'agent_end').messages
    .find((message) => message.role === 'user').content[0].text = 'rewritten prompt';
  assert.throws(() => parseResult(encodeEvents(changedUserPayload)),
    (error) => error?.code === 'PROTOCOL_INVALID');

  const changedAssistantPayload = successEvents();
  changedAssistantPayload.find((event) => event.type === 'agent_end').messages
    .find((message) => message.role === 'assistant').stopReason = 'length';
  assert.throws(() => parseResult(encodeEvents(changedAssistantPayload)),
    (error) => error?.code === 'PROTOCOL_INVALID');
});

test('classifies lifecycle and process diagnostics without returning raw details', () => {
  for (const code of [
    'TIMEOUT', 'CANCELLED', 'ADVISOR_RECURSION', 'CLI_VERSION_UNSUPPORTED',
    'MODEL_UNSUPPORTED', 'EFFORT_UNSUPPORTED', 'READ_ONLY_UNSUPPORTED',
    'SESSION_UNSUPPORTED', 'PROTOCOL_INVALID'
  ]) assert.equal(adapter.classifyFailure(createRoutingError(code)), code);
  for (const [diagnostics, expected] of [
    [{ stderr: 'credentials not configured' }, 'AUTH_UNAVAILABLE'],
    [{ stderr: 'model unknown-model not found' }, 'MODEL_UNSUPPORTED'],
    [{ stderr: 'thinking level xhigh unsupported' }, 'EFFORT_UNSUPPORTED'],
    [{ stderr: 'write tool is disabled by no-tools' }, 'READ_ONLY_UNSUPPORTED'],
    [{ stderr: 'session persistence is required' }, 'SESSION_UNSUPPORTED']
  ]) {
    const failure = createRunnerFailure({ reason: 'nonzero-exit', ...diagnostics, exitCode: 1 });
    assert.equal(adapter.classifyFailure(failure), expected);
  }
  assert.equal(adapter.classifyFailure(new Error('private path token=hidden')), 'PROCESS_FAILED');
});
