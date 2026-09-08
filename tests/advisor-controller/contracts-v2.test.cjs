'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateCheckpointV2,
  validateResultV2,
  validateAttemptOutcome,
  validateEnvelopeV2,
  validateTaskStateV1,
  validateHistoryExecutionV1,
  validateHistoryOutcomeV1,
  CHECKPOINT_PROTOCOL_V2,
  CHECKPOINT_VERSION_V2,
  RESULT_PROTOCOL_V2,
  RESULT_VERSION_V2,
  CONTROLLER_PROTOCOL_V2,
  CONTROLLER_VERSION_V2,
  STATE_PROTOCOL_V1,
  STATE_VERSION_V1,
  HISTORY_PROTOCOL_V1,
  HISTORY_VERSION_V1
} = require('../../.evcrate/source/.evcrate/bin/lib/advisor/contracts-v2.cjs');

const VALID_CHECKPOINT_V2 = Object.freeze({
  protocol: CHECKPOINT_PROTOCOL_V2,
  version: CHECKPOINT_VERSION_V2,
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  checkpoint_id: 'chk-001',
  phase_id: 'phase-01',
  task_revision: 1,
  evidence_revision: 1,
  checkpoint: 'review:step-4',
  kind: 'review',
  question: 'Is this contract transition safe and backward-compatible?',
  task: {
    goal: 'Freeze v2 contracts',
    non_goals: ['paid model inference'],
    authorized_paths: ['src/protocol/advisor-contracts.ts'],
    scope_rationale: 'Phase 01 requires freezing v2 contracts.',
    invariants: ['Zero dist/ imports from CJS controller'],
    success_criteria: ['TS/CJS parity verified']
  },
  proposal: {
    next_action: 'Proceed to code review gate',
    rationale: 'All tests pass',
    intended_changed_paths: ['src/protocol/advisor-contracts.ts']
  },
  evidence: {
    summary: '139 tests passing across all suites',
    files: [
      {
        path: 'src/protocol/advisor-contracts.ts',
        excerpt: 'export const CHECKPOINT_VERSION_V2 = 2;',
        digest: 'a'.repeat(64)
      }
    ],
    validation_results: [
      {
        suite: 'protocol',
        command: 'node --test tests/protocol/*.test.mjs',
        status: 'passed',
        passed: 21,
        failed: 0,
        details: null
      }
    ],
    artifacts: [
      {
        id: 'art-001',
        path: 'src/protocol/advisor-contracts.ts',
        digest: 'c'.repeat(64),
        description: 'V2 contracts definition'
      }
    ]
  },
  prior: {
    prior_consultation_id: null,
    prior_counsel: null,
    prior_disposition: null,
    observed_outcome: null
  }
});

const VALID_RESULT_V2 = Object.freeze({
  protocol: RESULT_PROTOCOL_V2,
  version: RESULT_VERSION_V2,
  checkpoint: 'review:step-4',
  status: 'ADVICE_READY',
  recommendation: 'Proceed with phase completion.',
  rationale: 'All invariants satisfied.',
  must_fix: [],
  cautions: ['Ensure phase 02 consumes timing types'],
  assumptions: ['No paid model credentials active in test environment'],
  success_checks: ['npm run test:protocol passes'],
  unresolved_questions: []
});

const VALID_ATTEMPT = Object.freeze({
  attempt_id: 'att-001',
  slot: 'primary',
  route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
  phase: 'model',
  model_started: true,
  elapsed_ms: 1500,
  terminal_classification: 'success',
  retry_delay_ms: null,
  cleanup_outcome: 'confirmed'
});

const VALID_ENVELOPE_SUCCESS = Object.freeze({
  protocol: CONTROLLER_PROTOCOL_V2,
  version: CONTROLLER_VERSION_V2,
  correlation_id: '01234567-89ab-4cde-8f01-23456789abcd',
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  checkpoint_id: 'chk-001',
  task_revision: 1,
  evidence_revision: 1,
  checkpoint_digest: 'a'.repeat(64),
  status: 'ADVICE_READY',
  receipt: {
    backend: 'codex',
    model: 'gpt-5.6-sol',
    effort: 'high',
    controller_version: CONTROLLER_VERSION_V2,
    adapter_version: '0.150.1',
    build_identity: 'sha256:build-id-123',
    elapsed_ms: 1500
  },
  attempts: [VALID_ATTEMPT],
  result: VALID_RESULT_V2,
  audit_status: 'recorded'
});

const VALID_TASK_STATE = Object.freeze({
  schema_version: STATE_VERSION_V1,
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  project_id: 'a'.repeat(64),
  task_revision: 1,
  phase_id: 'phase-01',
  gate_status: 'open',
  unresolved_episode_id: null,
  correction_count: 0,
  pending_consultation_id: null,
  last_consultation_id: null,
  disposition: null,
  outcome: null,
  task: VALID_CHECKPOINT_V2.task,
  initial_baseline: [{ path: 'src/protocol/advisor-contracts.ts', digest: 'a'.repeat(64), status: 'file', git: null }],
  scope_revision: 0,
  scope: { authorized_paths: VALID_CHECKPOINT_V2.task.authorized_paths, rationale: VALID_CHECKPOINT_V2.task.scope_rationale, added_baseline: [] },
  evidence_revision: 0,
  current_baseline: [{ path: 'src/protocol/advisor-contracts.ts', digest: 'a'.repeat(64), status: 'file', git: null }],
  pending: null,
  last_terminal: null,
  correction: null,
  episode_validation_command: null,
  human_continuation: null,
  operation_ledger: [{
    operation_id: '01234567-89ab-4cde-8f01-23456789ef01', operation: 'init', digest: 'b'.repeat(64),
    revision: 1, consultation_id: null, action_id: null, episode_id: null, outcome_result: null,
    validation_command: null, checkpoint_digest: null, result_digest: null
  }],
  human_decisions: []
});

const VALID_HISTORY_EXECUTION = Object.freeze({
  schema_version: HISTORY_VERSION_V1,
  consultation_id: '01234567-89ab-4cde-8f01-23456789ef01',
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  project_id: 'evcrate-project',
  checkpoint_digest: 'b'.repeat(64),
  route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
  attempts: [VALID_ATTEMPT],
  status: 'ADVICE_READY',
  result: VALID_RESULT_V2,
  error: null,
  started_at: 1700000000000,
  completed_at: 1700000001500
});

const VALID_HISTORY_OUTCOME = Object.freeze({
  schema_version: HISTORY_VERSION_V1,
  consultation_id: '01234567-89ab-4cde-8f01-23456789ef01',
  task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
  disposition: 'Approved recommendation with non-blocking checks.',
  actual_changes_revision: 2,
  validation_reference: 'git:sha256:abc123',
  outcome: 'resolved',
  correction_number: 1,
  recorded_at: 1700000002000
});

test('validateCheckpointV2 validates and freezes valid v2 checkpoint', () => {
  const validated = validateCheckpointV2(VALID_CHECKPOINT_V2);
  assert.deepEqual(validated, VALID_CHECKPOINT_V2);
  assert.equal(Object.isFrozen(validated), true);
});

test('validateCheckpointV2 rejects duplicate paths in authorized_paths, proposal, and files', () => {
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    task: { ...VALID_CHECKPOINT_V2.task, authorized_paths: ['a.txt', 'a.txt'] }
  }));

  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    proposal: { ...VALID_CHECKPOINT_V2.proposal, intended_changed_paths: ['b.txt', 'b.txt'] }
  }));

  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      files: [
        { path: 'c.txt', excerpt: 'x', digest: 'c'.repeat(64) },
        { path: 'c.txt', excerpt: 'y', digest: 'd'.repeat(64) }
      ]
    }
  }));
});

test('validateCheckpointV2 enforces aggregate evidence text budget of 16 KiB across all fields', () => {
  // Summary + files excerpts exceed
  const oversizedFiles = {
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(10_000),
      files: [
        {
          path: 'src/protocol/advisor-contracts.ts',
          excerpt: 'y'.repeat(7_000),
          digest: 'a'.repeat(64)
        }
      ]
    }
  };
  assert.throws(() => validateCheckpointV2(oversizedFiles));

  // Validation details exceed aggregate budget
  const oversizedDetails = {
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(8_000),
      files: [
        {
          path: 'src/protocol/advisor-contracts.ts',
          excerpt: 'y'.repeat(5_000),
          digest: 'a'.repeat(64)
        }
      ],
      validation_results: [
        {
          suite: 'protocol',
          command: 'test',
          status: 'passed',
          passed: 1,
          failed: 0,
          details: 'z'.repeat(4_000)
        }
      ]
    }
  };
  assert.throws(() => validateCheckpointV2(oversizedDetails));

  // Artifact description exceeds aggregate budget
  const oversizedArtifact = {
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(15_500),
      artifacts: [
        {
          id: 'art-002',
          path: 'src/protocol/advisor-contracts.ts',
          digest: 'b'.repeat(64),
          description: 'w'.repeat(1_000)
        }
      ]
    }
  };
  assert.throws(() => validateCheckpointV2(oversizedArtifact));

  // Suite text independently exceeds aggregate budget
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(16_300),
      validation_results: [
        {
          suite: 's'.repeat(100),
          command: 'c',
          status: 'passed',
          passed: 1,
          failed: 0,
          details: null
        }
      ]
    }
  }));

  // Command text independently exceeds aggregate budget
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(16_300),
      validation_results: [
        {
          suite: 's',
          command: 'c'.repeat(100),
          status: 'passed',
          passed: 1,
          failed: 0,
          details: null
        }
      ]
    }
  }));

  // Artifact ID independently exceeds aggregate budget
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    evidence: {
      ...VALID_CHECKPOINT_V2.evidence,
      summary: 'x'.repeat(16_300),
      artifacts: [
        {
          id: 'art-' + 'i'.repeat(100),
          path: 'src/protocol/advisor-contracts.ts',
          digest: 'b'.repeat(64),
          description: 'd'
        }
      ]
    }
  }));
});

test('validateCheckpointV2 rejects sensitive patterns in text fields', () => {
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    question: 'token=secretvalue'
  }));

  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    task: { ...VALID_CHECKPOINT_V2.task, goal: 'Bearer abcdef1234567890' }
  }));
});

test('revisions must be safe non-negative integers', () => {
  assert.throws(() => validateCheckpointV2({
    ...VALID_CHECKPOINT_V2,
    task_revision: 2 ** 53
  }));
  assert.throws(() => validateTaskStateV1({
    ...VALID_TASK_STATE,
    task_revision: 2 ** 53
  }));
  assert.throws(() => validateHistoryOutcomeV1({
    ...VALID_HISTORY_OUTCOME,
    actual_changes_revision: 2 ** 53
  }));
});

test('validateResultV2 validates valid result and rejects missing lists', () => {
  const validated = validateResultV2(VALID_RESULT_V2);
  assert.deepEqual(validated, VALID_RESULT_V2);
  assert.equal(Object.isFrozen(validated), true);

  assert.throws(() => validateResultV2({
    ...VALID_RESULT_V2,
    must_fix: 'not an array'
  }));
});

test('validateEnvelopeV2 validates success and failure envelopes with sanitized errors', () => {
  const success = validateEnvelopeV2(VALID_ENVELOPE_SUCCESS);
  assert.deepEqual(success, VALID_ENVELOPE_SUCCESS);

  const failure = validateEnvelopeV2({
    protocol: CONTROLLER_PROTOCOL_V2,
    version: CONTROLLER_VERSION_V2,
    correlation_id: '01234567-89ab-4cde-8f01-23456789abcd',
    task_run_id: '01234567-89ab-4cde-8f01-23456789abcd',
    checkpoint_id: 'chk-001',
    task_revision: 1,
    evidence_revision: 1,
    checkpoint_digest: 'a'.repeat(64),
    status: 'FAILED',
    receipt: VALID_ENVELOPE_SUCCESS.receipt,
    attempts: [VALID_ATTEMPT],
    error: {
      code: 'ROUTE_UNAVAILABLE',
      category: 'route',
      action: 'Ensure at least one configured route is installed and authenticated.',
      message: 'Configured advisor routes are unavailable'
    },
    audit_status: 'degraded'
  });
  assert.equal(failure.status, 'FAILED');
  assert.equal(failure.audit_status, 'degraded');

  // Rejects arbitrary unsanitized failure error fields
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    error: { raw_stderr: 'stack trace', token: 'secret' }
  }));

  // Rejects unknown error codes
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    error: {
      code: 'UNKNOWN_CUSTOM_ERROR',
      category: 'route',
      action: 'Check route',
      message: 'Unknown'
    }
  }));

  // Rejects array-coerced error codes
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    error: {
      code: ['ROUTE_UNAVAILABLE'],
      category: 'route',
      action: 'Ensure at least one configured route is installed and authenticated.',
      message: 'Configured advisor routes are unavailable'
    }
  }));

  // Rejects modified action independently
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    error: {
      code: 'ROUTE_UNAVAILABLE',
      category: 'route',
      action: 'Modified action text',
      message: 'Configured advisor routes are unavailable'
    }
  }));

  // Rejects modified message independently
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    error: {
      code: 'ROUTE_UNAVAILABLE',
      category: 'route',
      action: 'Ensure at least one configured route is installed and authenticated.',
      message: 'Modified message text'
    }
  }));

  // Rejects success envelope without confirmed cleanup
  assert.throws(() => validateEnvelopeV2({
    ...VALID_ENVELOPE_SUCCESS,
    attempts: [{ ...VALID_ATTEMPT, cleanup_outcome: 'unconfirmed' }]
  }));

  // Rejects more than 5 model-started attempts
  assert.throws(() => validateEnvelopeV2({
    ...failure,
    attempts: [
      { ...VALID_ATTEMPT, attempt_id: 'att-1', model_started: true },
      { ...VALID_ATTEMPT, attempt_id: 'att-2', model_started: true },
      { ...VALID_ATTEMPT, attempt_id: 'att-3', model_started: true },
      { ...VALID_ATTEMPT, attempt_id: 'att-4', model_started: true },
      { ...VALID_ATTEMPT, attempt_id: 'att-5', model_started: true },
      { ...VALID_ATTEMPT, attempt_id: 'att-6', model_started: true }
    ]
  }));
});

test('validateTaskStateV1 validates task state and enforces bounds', () => {
  const state = validateTaskStateV1(VALID_TASK_STATE);
  assert.deepEqual(state, VALID_TASK_STATE);

  assert.throws(() => validateTaskStateV1({
    ...VALID_TASK_STATE,
    correction_count: 4
  }));
});

test('durable state rejects legacy records and broken nested authority relationships', () => {
  const legacyKeys = [
    'schema_version', 'task_run_id', 'project_id', 'task_revision', 'phase_id', 'gate_status',
    'unresolved_episode_id', 'correction_count', 'pending_consultation_id', 'last_consultation_id', 'disposition', 'outcome'
  ];
  assert.throws(() => validateTaskStateV1(Object.fromEntries(legacyKeys.map((key) => [key, VALID_TASK_STATE[key]]))),
    { code: 'STATE_INVALID' });
  for (const change of [
    (state) => { state.scope.authorized_paths.push('src/unapproved.ts'); },
    (state) => { state.current_baseline[0].digest = null; },
    (state) => { state.current_baseline[0].git = { status: '??' }; },
    (state) => { state.pending_consultation_id = '01234567-89ab-4cde-8f01-23456789ef01'; },
    (state) => { state.gate_status = 'completed'; },
    (state) => { state.correction_count = 1; },
    (state) => { state.operation_ledger = []; },
    (state) => { state.task.allowed = true; }
  ]) {
    const state = structuredClone(VALID_TASK_STATE);
    change(state);
    assert.throws(() => validateTaskStateV1(state), { code: 'STATE_INVALID' });
  }
});

test('validateHistoryExecutionV1 supports started and terminal states', () => {
  const exec = validateHistoryExecutionV1(VALID_HISTORY_EXECUTION);
  assert.deepEqual(exec, VALID_HISTORY_EXECUTION);

  // Started execution record
  const started = validateHistoryExecutionV1({
    ...VALID_HISTORY_EXECUTION,
    status: 'started',
    result: null,
    error: null,
    completed_at: null
  });
  assert.equal(started.status, 'started');

  // Started record cannot have result or error
  assert.throws(() => validateHistoryExecutionV1({
    ...started,
    result: VALID_RESULT_V2
  }));

  const outcome = validateHistoryOutcomeV1(VALID_HISTORY_OUTCOME);
  assert.deepEqual(outcome, VALID_HISTORY_OUTCOME);

  assert.throws(() => validateHistoryOutcomeV1({
    ...VALID_HISTORY_OUTCOME,
    outcome: 'invalid_outcome_status'
  }));
});
