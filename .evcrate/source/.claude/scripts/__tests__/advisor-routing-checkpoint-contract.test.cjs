'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dispatcher = require('../advisor-dispatch.cjs');
const { createRoutingError } = require('../advisor-routing/errors.cjs');
const { resolveRoute } = require('../advisor-routing/resolve-route.cjs');
const {
  normalizeResult,
  validateCheckpoint
} = require('../advisor-routing/checkpoint-contract.cjs');
const {
  fakeAdapter,
  policyFor,
  temporaryHome,
  withHome
} = require('./helpers/checkpoint-routing-fixtures.cjs');

function checkpoint(activeHost = 'codex') {
  return {
    protocol: 'evcrate-advisor-checkpoint',
    version: 1,
    active_host: activeHost,
    checkpoint: 'review:step-4',
    question: 'Which safe action should follow this terminal review?',
    kind: 'review',
    task_or_phase: 'Phase 06 checkpoint integration',
    evidence: { terminal: 'tester and reviewer reached terminal results', files: ['plan.md'] },
    changed_paths: ['.claude/workflows/advisor-mentoring.md'],
    prior_counsel: 'none',
    owner_disposition: 'Fix all issues'
  };
}

async function dispatchStrict(adapter, calls, envelope = checkpoint(), options = {}) {
  const home = temporaryHome(true);
  const policyPath = path.join(home, '.evcrate', 'advisor-routing.json');
  fs.writeFileSync(policyPath, JSON.stringify({
    version: 1,
    hosts: { codex: policyFor('codex', 'claude').hosts.codex }
  }), { mode: 0o600 });
  fs.chmodSync(policyPath, 0o600);
  let pending;
  try {
    withHome(home, () => {
      pending = dispatcher.dispatchRequest({
        operation: 'dispatch',
        activeHost: 'codex',
        checkpoint: envelope
      }, {
        registry: { getAdapter: () => adapter },
        runner: { run: async () => { calls.push('run'); return { result: { stdout: '{}', stderr: '' } }; } },
        environment: { PATH: '/bin' },
        nativeAdvisor: options.nativeAdvisor
      });
    });
    return await pending;
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('strict checkpoint dispatch normalizes one external terminal result', async () => {
  const calls = [];
  const response = await dispatchStrict(fakeAdapter('claude', calls), calls);
  assert.equal(response.ok, true);
  assert.equal(response.result.protocol, 'evcrate-advisor-result');
  assert.equal(response.result.checkpoint, 'review:step-4');
  assert.equal(response.result.response, 'bounded fake result');
  assert.equal(Object.prototype.propertyIsEnumerable.call(response.result, 'response'), false);
  assert.deepEqual(calls.filter((call) => call === 'run'), ['run']);
  assert.equal(calls.filter((call) => call.endsWith(':parse')).length, 1);
});

test('external dispatch never calls an injected native advisor', async () => {
  const calls = [];
  let nativeCalls = 0;
  await dispatchStrict(fakeAdapter('claude', calls), calls, checkpoint(), {
    nativeAdvisor: () => { nativeCalls += 1; return { response: 'must not run' }; }
  });
  assert.equal(nativeCalls, 0);
});

test('checkpoint validation rejects route overrides, host mismatches, unsafe paths, and evidence leaks', () => {
  const base = checkpoint();
  assert.throws(() => validateCheckpoint({ ...base, backend: 'claude' }), (error) => error?.code === 'PROTOCOL_INVALID');
  assert.throws(() => validateCheckpoint({ ...base, active_host: 'pi' }, 'codex'), (error) => error?.code === 'PROTOCOL_INVALID');
  assert.throws(() => validateCheckpoint({ ...base, changed_paths: ['../secret.txt'] }), (error) => error?.code === 'PROTOCOL_INVALID');
  assert.throws(() => validateCheckpoint({ ...base, evidence: { ...base.evidence, files: ['.github/config'] } }),
    (error) => error?.code === 'PROTOCOL_INVALID');
  for (const metadata of ['modules', 'attributes']) {
    assert.throws(() => validateCheckpoint({ ...base, evidence: { ...base.evidence, files: [`.${'git'}${metadata}`] } }),
      (error) => error?.code === 'PROTOCOL_INVALID');
  }
  assert.throws(() => validateCheckpoint({ ...base, evidence: { ...base.evidence, terminal: 'token=secret-value' } }),
    (error) => error?.code === 'PROTOCOL_INVALID');
  assert.throws(() => validateCheckpoint({ ...base, prior_counsel: 'credential=value' }),
    (error) => error?.code === 'PROTOCOL_INVALID');
  assert.throws(() => normalizeResult({ response: 'token=secret-value' }, { checkpoint: base }),
    (error) => error?.code === 'PROTOCOL_INVALID');
});

test('native dispatch invokes one host callback, normalizes it, and never falls back', async () => {
  const calls = [];
  const home = temporaryHome(true);
  const policyPath = path.join(home, '.evcrate', 'advisor-routing.json');
  fs.writeFileSync(policyPath, JSON.stringify({ version: 1, hosts: {
    codex: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', execution: 'auto' }
  } }), { mode: 0o600 });
  let pending;
  try {
    withHome(home, () => {
      pending = dispatcher.dispatchRequest({ operation: 'dispatch', activeHost: 'codex', checkpoint: checkpoint() }, {
        nativeAdvisor: ({ checkpoint: envelope }) => {
          calls.push(`native:${envelope.checkpoint}`);
          return { response: 'native advice' };
        },
        registry: { getAdapter: () => { calls.push('external'); throw new Error('must not run'); } },
        runner: { run: async () => { calls.push('cli'); return {}; } },
        environment: { PATH: '/bin' }
      });
    });
    const response = await pending;
    assert.equal(response.descriptor.action, 'native');
    assert.equal(response.result.recommendation, 'native advice');
    assert.deepEqual(calls, ['native:review:step-4']);
    calls.length = 0;
    withHome(home, () => {
      pending = dispatcher.dispatchRequest({
        operation: 'dispatch', activeHost: 'codex', brief: JSON.stringify(checkpoint())
      }, {
        nativeAdvisor: ({ checkpoint: envelope }) => {
          calls.push(`native:${envelope.checkpoint}`);
          return { response: 'native JSON advice' };
        },
        registry: { getAdapter: () => { calls.push('external'); throw new Error('must not run'); } },
        runner: { run: async () => { calls.push('cli'); return {}; } },
        environment: { PATH: '/bin' }
      });
    });
    const jsonResponse = await pending;
    assert.equal(jsonResponse.result.recommendation, 'native JSON advice');
    assert.deepEqual(calls, ['native:review:step-4']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }

  const failureHome = temporaryHome(true);
  const failurePolicy = path.join(failureHome, '.evcrate', 'advisor-routing.json');
  fs.writeFileSync(failurePolicy, JSON.stringify({ version: 1, hosts: {
    codex: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', execution: 'auto' }
  } }), { mode: 0o600 });
  const failureCalls = [];
  try {
    withHome(failureHome, () => {
      pending = dispatcher.dispatchRequest({ operation: 'dispatch', activeHost: 'codex', checkpoint: checkpoint() }, {
        nativeAdvisor: () => { failureCalls.push('native'); throw createRoutingError('AUTH_UNAVAILABLE'); },
        registry: { getAdapter: () => { failureCalls.push('external'); return null; } },
        runner: { run: async () => { failureCalls.push('cli'); return {}; } },
        environment: { PATH: '/bin' }
      });
    });
    await assert.rejects(pending, (error) => error?.code === 'AUTH_UNAVAILABLE');
    assert.deepEqual(failureCalls, ['native']);
  } finally {
    fs.rmSync(failureHome, { recursive: true, force: true });
  }
});

test('malformed or wrong-protocol JSON briefs fail before legacy adapter lookup', async () => {
  const descriptor = resolveRoute({ activeHost: 'codex', policy: policyFor('codex', 'claude') });
  let lookups = 0;
  for (const brief of ['{ malformed', '{"protocol":"wrong"}', '[]', 'null', 'true', '"plain"', '123', 'token=secret-value']) {
    await assert.rejects(
      dispatcher.dispatchExternal({ descriptor, brief }, {
        registry: { getAdapter: () => { lookups += 1; return null; } },
        environment: { PATH: '/bin' }
      }),
      (error) => error?.code === 'PROTOCOL_INVALID'
    );
  }
  assert.equal(lookups, 0);
});

test('malformed terminal result stops the external branch without alternate work', async () => {
  const calls = [];
  const adapter = fakeAdapter('claude', calls);
  adapter.parseResult = ({ checkpoint: envelope }) => {
    calls.push('claude:parse');
    return {
      protocol: 'evcrate-advisor-result',
      version: 1,
      checkpoint: envelope.checkpoint,
      status: 'ADVICE_READY',
      recommendation: 'missing required arrays'
    };
  };
  await assert.rejects(dispatchStrict(adapter, calls), (error) => error?.code === 'PROTOCOL_INVALID');
  assert.equal(calls.filter((call) => call === 'run').length, 1);
  assert.equal(calls.filter((call) => call.endsWith(':parse')).length, 1);
  assert.equal(calls.includes('alternate'), false);
});

test('legacy adapter results normalize to the v1 terminal shape without a serialized alias', () => {
  const result = normalizeResult({ response: 'legacy advice' }, { checkpoint: checkpoint() });
  const encoded = JSON.parse(JSON.stringify(result));
  assert.equal(encoded.protocol, 'evcrate-advisor-result');
  assert.equal(encoded.checkpoint, 'review:step-4');
  assert.equal(encoded.recommendation, 'legacy advice');
  assert.equal('response' in encoded, false);
  assert.equal(result.response, 'legacy advice');
});
