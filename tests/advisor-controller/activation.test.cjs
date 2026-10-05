'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ACTIVATION_MODULE,
  createContext,
  createRun,
  createRequest,
  createPreRunHandoff,
  createSameRunHandoff,
  createIsolatedFixture,
  initializeStateFixture,
  abandonStateFixture
} = require('./activation-test-helpers.cjs');

const {
  parseAdviceArguments,
  parseActivationRequest,
  evaluateActivation
} = require(ACTIVATION_MODULE);

function assertThrowsCode(fn, expectedCode) {
  assert.throws(fn, (err) => {
    assert.equal(err.name, 'AdvisorRoutingError');
    assert.equal(err.code, expectedCode);
    return true;
  });
}


test('parseAdviceArguments handles empty and whitespace-only input', () => {
  const empty = parseAdviceArguments('');
  assert.deepEqual(empty, { mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '' });

  const spaces = parseAdviceArguments('   \t\r\n   ');
  assert.deepEqual(spaces, { mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '   \t\r\n   ' });
});

test('parseAdviceArguments strips final flag with various JS whitespace and Unicode', () => {
  // Flag alone
  assert.deepEqual(parseAdviceArguments('--advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: ''
  });

  // Flag with leading and trailing whitespace
  assert.deepEqual(parseAdviceArguments('   --advice   \t  '), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: ''
  });

  // Text before flag with ASCII whitespace stripped immediately before flag
  assert.deepEqual(parseAdviceArguments('build feature --advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'build feature'
  });
  assert.deepEqual(parseAdviceArguments('build feature   \t  --advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'build feature'
  });

  // Internal whitespace preserved
  assert.deepEqual(parseAdviceArguments('step 1\nstep 2\r\nstep 3  --advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'step 1\nstep 2\r\nstep 3'
  });

  // CRLF boundary
  assert.deepEqual(parseAdviceArguments('task\r\n--advice\r\n'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'task'
  });

  // Unicode whitespace: non-breaking space (U+00A0) and ideographic space (U+3000)
  assert.deepEqual(parseAdviceArguments('task\u00A0--advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'task'
  });
  assert.deepEqual(parseAdviceArguments('task\u3000--advice\u3000'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'task'
  });
});

test('parseAdviceArguments keeps non-final flag as ordinary text in off mode', () => {
  // Flag at start followed by text
  const start = parseAdviceArguments('--advice task description');
  assert.deepEqual(start, { mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '--advice task description' });

  // Flag in middle followed by text
  const middle = parseAdviceArguments('build --advice and test');
  assert.deepEqual(middle, { mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: 'build --advice and test' });
});

test('parseAdviceArguments treats quoted and embedded tokens as ordinary text', () => {
  // Quoted tokens
  assert.deepEqual(parseAdviceArguments('"--advice"'), {
    mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '"--advice"'
  });
  assert.deepEqual(parseAdviceArguments("'--advice'"), {
    mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: "'--advice'"
  });
  assert.deepEqual(parseAdviceArguments('`--advice`'), {
    mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '`--advice`'
  });

  // Embedded tokens
  for (const token of ['x--advice', '--advice=yes', '--advice-extra', '--Advice', '@advisor']) {
    assert.deepEqual(parseAdviceArguments(`run ${token}`), {
      mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: `run ${token}`
    });
  }

  // Quoted token followed by real final flag
  assert.deepEqual(parseAdviceArguments('task with "--advice" embedded --advice'), {
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'task with "--advice" embedded'
  });

  // Multiple quoted tokens without standalone flag
  assert.deepEqual(parseAdviceArguments('"--advice" and \'--advice\''), {
    mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: '"--advice" and \'--advice\''
  });
});

test('parseAdviceArguments enforces duplicate flag precedence over finality', () => {
  // Adjacent duplicates
  assertThrowsCode(() => parseAdviceArguments('--advice --advice'), 'ADVICE_MODE_DUPLICATE_FLAG');

  // Separated duplicates where second is final
  assertThrowsCode(() => parseAdviceArguments('task --advice other --advice'), 'ADVICE_MODE_DUPLICATE_FLAG');

  // Duplicates where neither is final
  assertThrowsCode(() => parseAdviceArguments('--advice first --advice second'), 'ADVICE_MODE_DUPLICATE_FLAG');

  // Duplicates with trailing whitespace
  assertThrowsCode(() => parseAdviceArguments('--advice   --advice \t\r\n '), 'ADVICE_MODE_DUPLICATE_FLAG');
});

test('parseAdviceArguments checks byte limits and well-formedness', () => {
  // Exactly 32768 UTF-8 bytes: valid
  const exact = 'a'.repeat(32768);
  assert.equal(parseAdviceArguments(exact).work_arguments, exact);

  // 32769 UTF-8 bytes: oversized
  const oversized = 'a'.repeat(32769);
  assertThrowsCode(() => parseAdviceArguments(oversized), 'ADVICE_MODE_OVERSIZED');

  // Non-string arguments
  assertThrowsCode(() => parseAdviceArguments(null), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseAdviceArguments(123), 'ADVICE_MODE_INVALID');

  // Lone surrogate is not well-formed
  assertThrowsCode(() => parseAdviceArguments('task \uD800 invalid'), 'ADVICE_MODE_INVALID');
});

test('parseActivationRequest rejects non-object, BOM, invalid UTF-8 and oversized inputs', () => {
  // Non-object primitives
  assertThrowsCode(() => parseActivationRequest(null), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest('not json'), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(12345), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest([]), 'ADVICE_MODE_INVALID');

  // UTF-8 BOM in Buffer and String
  const bomBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{}')]);
  assertThrowsCode(() => parseActivationRequest(bomBuffer), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest('\uFEFF{}'), 'ADVICE_MODE_INVALID');

  // Malformed UTF-8 buffer
  const badUtf8 = Buffer.from([0xFF, 0xFE, 0xFD]);
  assertThrowsCode(() => parseActivationRequest(badUtf8), 'ADVICE_MODE_INVALID');

  // Input exceeding MAX_INPUT_BYTES (65536)
  const hugeBuf = Buffer.alloc(65537, 0x20);
  assertThrowsCode(() => parseActivationRequest(hugeBuf), 'ADVICE_MODE_OVERSIZED');

  const bigStr = JSON.stringify(createRequest({ raw_arguments: 'a'.repeat(30000) })) + ' '.repeat(36000);
  assertThrowsCode(() => parseActivationRequest(bigStr), 'ADVICE_MODE_OVERSIZED');
});

test('parseActivationRequest enforces JSON document depth, duplicate keys, and trailing data', () => {
  // JSON depth > 32
  let nested = '{"protocol":"evcrate-advice-mode"}';
  for (let i = 0; i < 35; i++) nested = `{"nest":${nested}}`;
  assertThrowsCode(() => parseActivationRequest(nested), 'ADVICE_MODE_INVALID');

  // Duplicate keys in wire JSON
  const valid = createRequest();
  const validJson = JSON.stringify(valid);
  const duplicateKeyJson = validJson.replace('"protocol":"evcrate-advice-mode"', '"protocol":"evcrate-advice-mode","protocol":"evcrate-advice-mode"');
  assertThrowsCode(() => parseActivationRequest(duplicateKeyJson), 'ADVICE_MODE_INVALID');

  // Trailing data after JSON
  assertThrowsCode(() => parseActivationRequest(`${validJson} trailing`), 'ADVICE_MODE_INVALID');
});

test('parseActivationRequest validates schema keys, protocol, version, and context fields', () => {
  // Missing required keys
  assertThrowsCode(() => parseActivationRequest({ protocol: 'evcrate-advice-mode', version: 1 }), 'ADVICE_MODE_INVALID');

  // Unknown extra key
  assertThrowsCode(() => parseActivationRequest({ ...createRequest(), unknown_field: true }), 'ADVICE_MODE_INVALID');

  // Wrong protocol or version
  assertThrowsCode(() => parseActivationRequest(createRequest({ protocol: 'evcrate-other' })), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({ version: 2 })), 'ADVICE_MODE_INVALID');

  // Non-canonical command
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ command: 'invalid-command' })
  })), 'ADVICE_MODE_INVALID');

  // Non-absolute project_root or traversal
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ project_root: 'relative/path' })
  })), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ project_root: '/safe/../unsafe' })
  })), 'ADVICE_MODE_INVALID');

  // Unsafe plan_path (traversal, absolute, backslash)
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: '../outside/plan.md' })
  })), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: '/abs/plan.md' })
  })), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: 'foo\\bar' })
  })), 'ADVICE_MODE_INVALID');

  // Phase path without plan path
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: null, phase_path: 'plans/test/phase-01.md' })
  })), 'ADVICE_MODE_INVALID');

  // Metadata with control characters or lone surrogates
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ work_target: 'target\u0000bad' })
  })), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ phase_id: 'phase\u001fbad' })
  })), 'ADVICE_MODE_INVALID');
});

test('parseActivationRequest detects duplicate flags in request raw_arguments', () => {
  assertThrowsCode(() => parseActivationRequest(createRequest({
    raw_arguments: 'task --advice and more --advice'
  })), 'ADVICE_MODE_DUPLICATE_FLAG');
});

test('parseActivationRequest validates pre-run handoff and known-selection refinement', () => {
  // Pre-run with non-null run is invalid
  assertThrowsCode(() => parseActivationRequest(createRequest({
    handoff: { kind: 'pre-run', context: createContext(), run: createRun() }
  })), 'ADVICE_HANDOFF_INVALID');

  // Pre-run with root, command, or target mismatch
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ command: 'code' }),
    handoff: createPreRunHandoff({ command: 'cook' })
  })), 'ADVICE_CONTEXT_MISMATCH');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ work_target: 'target-a' }),
    handoff: createPreRunHandoff({ work_target: 'target-b' })
  })), 'ADVICE_CONTEXT_MISMATCH');

  // Pre-run known-selection refinement: null in handoff refined to known in request is allowed
  const refined = parseActivationRequest(createRequest({
    context: createContext({ plan_path: 'plans/new/plan.md', phase_path: 'plans/new/phase-01.md', phase_id: 'phase-01' }),
    handoff: createPreRunHandoff({ plan_path: null, phase_path: null, phase_id: null })
  }));
  assert.equal(refined.context.plan_path, 'plans/new/plan.md');
  assert.equal(refined.handoff.context.plan_path, null);

  // Pre-run replacing known non-null selection is rejected
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: 'plans/other/plan.md' }),
    handoff: createPreRunHandoff({ plan_path: 'plans/original/plan.md' })
  })), 'ADVICE_CONTEXT_MISMATCH');

  // Pre-run dropping known non-null selection to null is rejected
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ plan_path: null, phase_path: null, phase_id: null }),
    handoff: createPreRunHandoff({ plan_path: 'plans/original/plan.md' })
  })), 'ADVICE_CONTEXT_MISMATCH');
});

test('parseActivationRequest validates same-run handoff and exact context equality', () => {
  // Same-run with null run is invalid
  assertThrowsCode(() => parseActivationRequest(createRequest({
    handoff: { kind: 'same-run', context: createContext(), run: null }
  })), 'ADVICE_HANDOFF_INVALID');

  // Same-run with invalid Run properties
  assertThrowsCode(() => parseActivationRequest(createRequest({
    handoff: createSameRunHandoff({ task_run_id: 'not-a-uuid' })
  })), 'ADVICE_HANDOFF_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    handoff: createSameRunHandoff({ project_id: 'short-id' })
  })), 'ADVICE_HANDOFF_INVALID');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    handoff: createSameRunHandoff({ task_revision: 0 })
  })), 'ADVICE_HANDOFF_INVALID');

  // Same-run requires non-null phase_id
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ phase_id: null }),
    handoff: createSameRunHandoff({}, { phase_id: null })
  })), 'ADVICE_HANDOFF_INVALID');

  // Same-run context mismatch between request and handoff
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ work_target: 'target-a' }),
    handoff: createSameRunHandoff({}, { work_target: 'target-b' })
  })), 'ADVICE_CONTEXT_MISMATCH');
  assertThrowsCode(() => parseActivationRequest(createRequest({
    context: createContext({ phase_id: 'phase-01' }),
    handoff: createSameRunHandoff({}, { phase_id: 'phase-02' })
  })), 'ADVICE_CONTEXT_MISMATCH');

  // Valid same-run returns frozen object
  const validSameRun = parseActivationRequest(createRequest({
    handoff: createSameRunHandoff()
  }));
  assert.equal(validSameRun.handoff.kind, 'same-run');
  assert(Object.isFrozen(validSameRun));
});

test('evaluateActivation handles off, explicit, and inherited pre-run modes', () => {
  // Off mode: no final flag, no handoff
  const offReq = parseActivationRequest(createRequest({ raw_arguments: 'task description' }));
  const offRes = evaluateActivation(offReq);
  assert.deepEqual(offRes, {
    protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode: 'off', reason: 'NO_FINAL_FLAG', work_arguments: 'task description',
    context: offReq.context, run: null, error: null
  });

  // Explicit mode: final flag, no handoff
  const expReq = parseActivationRequest(createRequest({ raw_arguments: 'task description --advice' }));
  const expRes = evaluateActivation(expReq);
  assert.deepEqual(expRes, {
    protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode: 'explicit', reason: 'EXPLICIT_FINAL_FLAG', work_arguments: 'task description',
    context: expReq.context, run: null, error: null
  });

  // Pre-run mode without flag
  const preReq = parseActivationRequest(createRequest({
    raw_arguments: 'router task',
    handoff: createPreRunHandoff()
  }));
  const preRes = evaluateActivation(preReq);
  assert.deepEqual(preRes, {
    protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode: 'inherited', reason: 'INHERITED_PRE_RUN', work_arguments: 'router task',
    context: preReq.context, run: null, error: null
  });

  // Pre-run mode with final flag: strips flag, inherits pre-run
  const preFlagReq = parseActivationRequest(createRequest({
    raw_arguments: 'router task --advice',
    handoff: createPreRunHandoff()
  }));
  const preFlagRes = evaluateActivation(preFlagReq);
  assert.deepEqual(preFlagRes, {
    protocol: 'evcrate-advice-mode', version: 1, status: 'MODE_READY',
    mode: 'inherited', reason: 'INHERITED_PRE_RUN', work_arguments: 'router task',
    context: preFlagReq.context, run: null, error: null
  });
});

test('evaluateActivation with same-run checks observed state, revisions, and completion', (t) => {
  const f = createIsolatedFixture(t);
  const state = initializeStateFixture(f);

  const matchingRun = {
    task_run_id: state.task_run_id,
    project_id: state.project_id,
    task_revision: state.task_revision,
    scope_revision: state.scope_revision,
    evidence_revision: state.evidence_revision
  };

  const matchingContext = createContext({
    project_root: f.project,
    phase_id: state.phase_id
  });

  // Valid continuation without flag
  const reqNoFlag = parseActivationRequest(createRequest({
    context: matchingContext,
    handoff: { kind: 'same-run', context: matchingContext, run: matchingRun }
  }));
  const resNoFlag = evaluateActivation(reqNoFlag, state);
  assert.equal(resNoFlag.status, 'MODE_READY');
  assert.equal(resNoFlag.mode, 'inherited');
  assert.equal(resNoFlag.reason, 'INHERITED_SAME_RUN');
  assert.deepEqual(resNoFlag.run, matchingRun);

  // Valid continuation with final flag: preserves binding and strips flag
  const reqWithFlag = parseActivationRequest(createRequest({
    raw_arguments: 'continue work --advice',
    context: matchingContext,
    handoff: { kind: 'same-run', context: matchingContext, run: matchingRun }
  }));
  const resWithFlag = evaluateActivation(reqWithFlag, state);
  assert.equal(resWithFlag.mode, 'inherited');
  assert.equal(resWithFlag.reason, 'INHERITED_SAME_RUN');
  assert.equal(resWithFlag.work_arguments, 'continue work');
  assert.deepEqual(resWithFlag.run, matchingRun);

  // Stale task_revision in handoff
  const staleReq = parseActivationRequest(createRequest({
    context: matchingContext,
    handoff: { kind: 'same-run', context: matchingContext, run: { ...matchingRun, task_revision: 99 } }
  }));
  assertThrowsCode(() => evaluateActivation(staleReq, state), 'ADVICE_HANDOFF_STALE');

  // Mismatched phase_id in observed state vs context
  const wrongPhaseContext = createContext({ project_root: f.project, phase_id: 'different-phase' });
  const wrongPhaseReq = parseActivationRequest(createRequest({
    context: wrongPhaseContext,
    handoff: { kind: 'same-run', context: wrongPhaseContext, run: matchingRun }
  }));
  assertThrowsCode(() => evaluateActivation(wrongPhaseReq, state), 'ADVICE_CONTEXT_MISMATCH');

  // Mismatched project_id
  const wrongProjectRun = { ...matchingRun, project_id: 'f'.repeat(64) };
  const wrongProjReq = parseActivationRequest(createRequest({
    context: matchingContext,
    handoff: { kind: 'same-run', context: matchingContext, run: wrongProjectRun }
  }));
  assertThrowsCode(() => evaluateActivation(wrongProjReq, state), 'ADVICE_CONTEXT_MISMATCH');

  // Abandoned state (genuine completed state) must throw ADVICE_RUN_COMPLETED
  const abandonedState = abandonStateFixture(f, state);
  assert.equal(abandonedState.gate_status, 'completed');
  const abandonedRun = {
    ...matchingRun,
    task_revision: abandonedState.task_revision,
    scope_revision: abandonedState.scope_revision,
    evidence_revision: abandonedState.evidence_revision
  };
  const abandonedReq = parseActivationRequest(createRequest({
    context: matchingContext,
    handoff: { kind: 'same-run', context: matchingContext, run: abandonedRun }
  }));
  assertThrowsCode(() => evaluateActivation(abandonedReq, abandonedState), 'ADVICE_RUN_COMPLETED');
});

test('context paths reuse sensitive-path fences and enforce aggregate UTF-8 limits', () => {
  for (const plan_path of ['.git/config', 'plans/.env', 'plans/secrets.md', 'plans//plan.md', 'C:/plan.md']) {
    assertThrowsCode(() => parseActivationRequest(createRequest({
      context: createContext({ plan_path })
    })), 'ADVICE_MODE_INVALID');
  }
  const planPath = Array(4).fill('p'.repeat(200)).join('/') + '/' + 'x'.repeat(220);
  assert.equal(Buffer.byteLength(planPath), 1024);
  const request = createRequest({ context: createContext({ plan_path: planPath, work_target: '雪'.repeat(1365) + 'a' }) });
  assert.equal(parseActivationRequest(request).context.plan_path, planPath);
  assertThrowsCode(() => parseActivationRequest({ ...request,
    context: { ...request.context, plan_path: planPath + 'x' } }), 'ADVICE_MODE_INVALID');
  assertThrowsCode(() => parseActivationRequest({ ...request,
    context: { ...request.context, work_target: request.context.work_target + 'x' } }), 'ADVICE_MODE_INVALID');
  const escaped = createRequest({ raw_arguments: '\u0001'.repeat(12000) });
  assertThrowsCode(() => parseActivationRequest(escaped), 'ADVICE_MODE_OVERSIZED');
});

test('object input rejects hidden fields and getters without invoking them', () => {
  let invoked = false;
  const getter = createRequest();
  Object.defineProperty(getter, 'raw_arguments', { enumerable: true, get() { invoked = true; return ''; } });
  assertThrowsCode(() => parseActivationRequest(getter), 'ADVICE_MODE_INVALID');
  assert.equal(invoked, false);
  const hidden = createRequest();
  Object.defineProperty(hidden, 'context', { enumerable: false, value: hidden.context });
  assertThrowsCode(() => parseActivationRequest(hidden), 'ADVICE_MODE_INVALID');
  const symbol = createRequest();
  symbol[Symbol('extra')] = true;
  assertThrowsCode(() => parseActivationRequest(symbol), 'ADVICE_MODE_INVALID');
});
