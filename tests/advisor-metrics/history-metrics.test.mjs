import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHistoryRecord,
  normalizeHistoryFilter,
  filterHistoryRecords,
  nearestRankPercentile,
  calculateHistoryMetrics
} from '../../dist/protocol/advisor-metrics.js';
import {
  createRawExecution,
  createRawOutcome
} from '../fixtures/advisor-history/history-fixtures.mjs';

test('nearestRankPercentile calculates deterministic percentiles', () => {
  assert.equal(nearestRankPercentile([], 0.5), null);
  assert.equal(nearestRankPercentile([42], 0.5), 42);
  assert.equal(nearestRankPercentile([42], 0.95), 42);

  // 4 items: [100, 200, 300, 400]
  // p50: max(1, ceil(0.5 * 4)) - 1 = max(1, 2) - 1 = 1 -> index 1 -> 200
  // p95: max(1, ceil(0.95 * 4)) - 1 = max(1, 4) - 1 = 3 -> index 3 -> 400
  const four = [400, 100, 300, 200];
  assert.equal(nearestRankPercentile(four, 0.5), 200);
  assert.equal(nearestRankPercentile(four, 0.95), 400);

  // 5 items: [10, 20, 30, 40, 50]
  // p50: max(1, ceil(0.5 * 5)) - 1 = max(1, 3) - 1 = 2 -> index 2 -> 30
  // p95: max(1, ceil(0.95 * 5)) - 1 = max(1, 5) - 1 = 4 -> index 4 -> 50
  const five = [50, 10, 40, 20, 30];
  assert.equal(nearestRankPercentile(five, 0.5), 30);
  assert.equal(nearestRankPercentile(five, 0.95), 50);
});

test('normalizeHistoryRecord enforces lowercase IDs and categorizes outcomes', () => {
  const pId = 'a'.repeat(64);
  const tId = '01234567-89AB-4CDE-8F01-23456789ABCD';
  const cId = '01234567-89AB-4CDE-8F01-23456789EF01';

  const ex = createRawExecution({
    project_id: pId,
    task_run_id: tId,
    consultation_id: cId,
    status: 'ADVICE_READY',
    started_at: 1000,
    completed_at: 2500,
    receipt: {
      backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2,
      adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: 1500
    },
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    attempts: [{
      attempt_id: 'att-001', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'model', model_started: true, elapsed_ms: 1500, terminal_classification: 'success',
      retry_delay_ms: null, cleanup_outcome: 'confirmed'
    }],
    result: {
      protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:step-4', status: 'ADVICE_READY',
      recommendation: 'Good', rationale: 'Passes', must_fix: [], cautions: [], assumptions: [],
      success_checks: [], unresolved_questions: []
    },
    error: null
  });

  // Missing outcome
  const normMissing = normalizeHistoryRecord(ex, null, { kind: 'controller', relative_path: 'history/run1' });
  assert.equal(normMissing.project_id, pId.toLowerCase());
  assert.equal(normMissing.task_run_id, tId.toLowerCase());
  assert.equal(normMissing.consultation_id, cId.toLowerCase());
  assert.equal(normMissing.outcome_state, 'missing');
  assert.equal(normMissing.outcome_result, null);
  assert.equal(normMissing.receipt_elapsed_ms, 1500);
  assert.equal(Object.isFrozen(normMissing), true);

  // Valid outcome
  const oc = createRawOutcome({ project_id: pId, task_run_id: tId, consultation_id: cId, outcome: 'resolved' });
  const normValid = normalizeHistoryRecord(ex, oc, { kind: 'controller', relative_path: 'history/run1' });
  assert.equal(normValid.outcome_state, 'valid');
  assert.equal(normValid.outcome_result, 'resolved');

  // Explicit unknown outcome is valid
  const ocUnknown = createRawOutcome({ project_id: pId, task_run_id: tId, consultation_id: cId, outcome: 'unknown' });
  const normUnknown = normalizeHistoryRecord(ex, ocUnknown, { kind: 'controller', relative_path: 'history/run1' });
  assert.equal(normUnknown.outcome_state, 'valid');
  assert.equal(normUnknown.outcome_result, 'unknown');

  // Mismatched outcome identity -> invalid
  const ocMismatch = createRawOutcome({ project_id: 'b'.repeat(64), task_run_id: tId, consultation_id: cId, outcome: 'resolved' });
  const normInvalid = normalizeHistoryRecord(ex, ocMismatch, { kind: 'controller', relative_path: 'history/run1' });
  assert.equal(normInvalid.outcome_state, 'invalid');
  assert.equal(normInvalid.outcome_result, null);
});

test('normalizeHistoryFilter validates exact 10 keys and bounds', () => {
  const defaultFilters = normalizeHistoryFilter(null);
  assert.deepEqual(defaultFilters, {
    statuses: null, outcome_states: null, outcome_results: null, backends: null,
    models: null, efforts: null, prompt_identities: null, build_identities: null,
    started_at_from: null, started_at_to: null
  });
  assert.equal(Object.isFrozen(defaultFilters), true);

  const custom = normalizeHistoryFilter({
    statuses: ['ADVICE_READY', 'FAILED'],
    outcome_states: ['valid'],
    outcome_results: ['resolved'],
    backends: ['codex', 'omp'],
    models: ['gpt-5.6-sol'],
    efforts: ['high'],
    prompt_identities: ['prompt-v2'],
    build_identities: ['build-v2'],
    started_at_from: 1000,
    started_at_to: 5000
  });
  assert.equal(custom.statuses.length, 2);
  assert.equal(custom.started_at_from, 1000);
  assert.equal(custom.started_at_to, 5000);

  // Rejects inverted timestamps
  assert.throws(() => normalizeHistoryFilter({
    statuses: null, outcome_states: null, outcome_results: null, backends: null,
    models: null, efforts: null, prompt_identities: null, build_identities: null,
    started_at_from: 5000, started_at_to: 1000
  }), RangeError);

  // Rejects duplicate elements in categorical filter
  assert.throws(() => normalizeHistoryFilter({
    statuses: ['ADVICE_READY', 'ADVICE_READY'], outcome_states: null, outcome_results: null, backends: null,
    models: null, efforts: null, prompt_identities: null, build_identities: null,
    started_at_from: null, started_at_to: null
  }), TypeError);

  // Rejects extra unexpected keys
  assert.throws(() => normalizeHistoryFilter({
    statuses: null, outcome_states: null, outcome_results: null, backends: null,
    models: null, efforts: null, prompt_identities: null, build_identities: null,
    started_at_from: null, started_at_to: null, extra_key: true
  }), TypeError);
});

test('calculateHistoryMetrics computes exact hand-calculated metrics', () => {
  const p1 = '1'.repeat(64), p2 = '2'.repeat(64);
  const t1 = '01234567-89ab-4cde-8f01-234567890001';
  const t2 = '01234567-89ab-4cde-8f01-234567890002';
  const t3 = '01234567-89ab-4cde-8f01-234567890003';

  // Record 1: Started
  const exStarted = createRawExecution({
    project_id: p1, task_run_id: t1, consultation_id: '11111111-1111-4000-8000-000000000001',
    status: 'started', started_at: 1000, completed_at: null, receipt: null,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    attempts: [{
      attempt_id: 'att-1', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'preflight', model_started: false, elapsed_ms: 100, terminal_classification: 'skipped',
      retry_delay_ms: null, cleanup_outcome: 'not_needed'
    }],
    result: null, error: null
  });

  // Record 2: ADVICE_READY, resolved outcome, 1500ms
  const exReadyResolved = createRawExecution({
    project_id: p1, task_run_id: t1, consultation_id: '11111111-1111-4000-8000-000000000002',
    status: 'ADVICE_READY', started_at: 2000, completed_at: 3500,
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: 1500 },
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    attempts: [{
      attempt_id: 'att-2', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'model', model_started: true, elapsed_ms: 1500, terminal_classification: 'success',
      retry_delay_ms: null, cleanup_outcome: 'confirmed'
    }],
    result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:step-4', status: 'ADVICE_READY', recommendation: 'ok', rationale: 'ok', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: [] },
    error: null
  });
  const ocResolved = createRawOutcome({ project_id: p1, task_run_id: t1, consultation_id: '11111111-1111-4000-8000-000000000002', outcome: 'resolved' });

  // Record 3: ADVICE_READY, unknown outcome, 2500ms
  const exReadyUnknown = createRawExecution({
    project_id: p1, task_run_id: t2, consultation_id: '11111111-1111-4000-8000-000000000003',
    status: 'ADVICE_READY', started_at: 4000, completed_at: 6500,
    receipt: { backend: 'omp', model: 'm1', effort: 'medium', controller_version: 2, adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: 2500 },
    route: { backend: 'omp', model: 'm1', effort: 'medium' },
    attempts: [{
      attempt_id: 'att-3', slot: 'primary', route: { backend: 'omp', model: 'm1', effort: 'medium' },
      phase: 'model', model_started: true, elapsed_ms: 2500, terminal_classification: 'success',
      retry_delay_ms: null, cleanup_outcome: 'confirmed'
    }],
    result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:step-4', status: 'ADVICE_READY', recommendation: 'ok', rationale: 'ok', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: [] },
    error: null
  });
  const ocUnknown = createRawOutcome({ project_id: p1, task_run_id: t2, consultation_id: '11111111-1111-4000-8000-000000000003', outcome: 'unknown' });

  // Record 4: FAILED, backup model used, retry used, 3000ms
  const exFailed = createRawExecution({
    project_id: p2, task_run_id: t3, consultation_id: '22222222-2222-4000-8000-000000000004',
    status: 'FAILED', started_at: 7000, completed_at: 10000,
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.1.0', build_identity: 'build-v2', elapsed_ms: 3000 },
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    attempts: [
      { attempt_id: 'att-4a', slot: 'primary', route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, phase: 'model', model_started: true, elapsed_ms: 1000, terminal_classification: 'transient', retry_delay_ms: 1000, cleanup_outcome: 'not_needed' },
      { attempt_id: 'att-4b', slot: 'backup', route: { backend: 'omp', model: 'm1', effort: 'high' }, phase: 'model', model_started: true, elapsed_ms: 2000, terminal_classification: 'fatal', retry_delay_ms: null, cleanup_outcome: 'not_needed' }
    ],
    result: null,
    error: { code: 'ROUTE_UNAVAILABLE', category: 'route', action: 'check routes', message: 'unavailable' }
  });

  const recStarted = normalizeHistoryRecord(exStarted, null, { kind: 'controller', relative_path: 'p1/t1/c1' });
  const recReadyResolved = normalizeHistoryRecord(exReadyResolved, ocResolved, { kind: 'controller', relative_path: 'p1/t1/c2' });
  const recReadyUnknown = normalizeHistoryRecord(exReadyUnknown, ocUnknown, { kind: 'controller', relative_path: 'p1/t2/c3' });
  const recFailed = normalizeHistoryRecord(exFailed, null, { kind: 'controller', relative_path: 'p2/t3/c4' });

  // Add an identical duplicate of recReadyResolved (should collapse to 1)
  const recReadyResolvedDup = normalizeHistoryRecord(exReadyResolved, ocResolved, { kind: 'controller', relative_path: 'p1/t1/c2-dup' });

  // Add conflicting duplicates (same id, different started_at -> both excluded)
  const exConflict1 = createRawExecution({
    project_id: p1, task_run_id: t1, consultation_id: '99999999-9999-4000-8000-000000000099',
    status: 'started', started_at: 100, completed_at: null, receipt: null,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, attempts: [], result: null, error: null
  });
  const exConflict2 = createRawExecution({
    project_id: p1, task_run_id: t1, consultation_id: '99999999-9999-4000-8000-000000000099',
    status: 'started', started_at: 200, completed_at: null, receipt: null,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }, attempts: [], result: null, error: null
  });
  const recConflict1 = normalizeHistoryRecord(exConflict1, null, { kind: 'controller', relative_path: 'p1/t1/c99-a' });
  const recConflict2 = normalizeHistoryRecord(exConflict2, null, { kind: 'controller', relative_path: 'p1/t1/c99-b' });

  const records = [recStarted, recReadyResolved, recReadyResolvedDup, recReadyUnknown, recFailed, recConflict1, recConflict2];
  const metrics = calculateHistoryMetrics({
    records,
    generated_at: 100000
  });

  // Verification:
  // Accepted records: 4 unique (started, ready-resolved, ready-unknown, failed).
  // Conflicting duplicates excluded: 2.
  assert.equal(metrics.scan.accepted_records, 4);
  assert.equal(metrics.scan.invalid_records, 2);
  assert.equal(metrics.counts.consultations, 4);
  assert.equal(metrics.counts.projects, 2); // p1, p2
  assert.equal(metrics.counts.tasks, 3); // (p1, t1), (p1, t2), (p2, t3)
  assert.equal(metrics.counts.terminal, 3); // ready-resolved, ready-unknown, failed
  assert.equal(metrics.counts.statuses.started, 1);
  assert.equal(metrics.counts.statuses.ADVICE_READY, 2);
  assert.equal(metrics.counts.statuses.FAILED, 1);

  // Delivery: ready (2) / terminal (3) = 2/3 = 0.666667. Excluded: started (1).
  assert.equal(metrics.metrics.delivery.numerator, 2);
  assert.equal(metrics.metrics.delivery.denominator, 3);
  assert.equal(metrics.metrics.delivery.value, 0.666667);
  assert.equal(metrics.metrics.delivery.excluded, 1);

  // Outcome coverage: ready with valid outcome (2) / ready (2) = 1.000000. Excluded: 4 - 2 = 2.
  assert.equal(metrics.metrics.outcome_coverage.numerator, 2);
  assert.equal(metrics.metrics.outcome_coverage.denominator, 2);
  assert.equal(metrics.metrics.outcome_coverage.value, 1.0);
  assert.equal(metrics.metrics.outcome_coverage.excluded, 2);

  // Known-outcome resolution: resolved (1) / (resolved (1) + unresolved (0) + regressed (0)) = 1 / 1 = 1.000000. Excluded: 4 - 1 = 3.
  assert.equal(metrics.metrics.known_outcome_resolution.numerator, 1);
  assert.equal(metrics.metrics.known_outcome_resolution.denominator, 1);
  assert.equal(metrics.metrics.known_outcome_resolution.value, 1.0);
  assert.equal(metrics.metrics.known_outcome_resolution.excluded, 3);

  // Backup use: terminal with model backup (1: recFailed) / terminal with any model (3: recReadyResolved, recReadyUnknown, recFailed) = 1/3 = 0.333333
  assert.equal(metrics.metrics.backup_use.numerator, 1);
  assert.equal(metrics.metrics.backup_use.denominator, 3);
  assert.equal(metrics.metrics.backup_use.value, 0.333333);

  // Retry use: terminal with >1 model attempts (1: recFailed has 2) / terminal with any model (3) = 1/3 = 0.333333
  assert.equal(metrics.metrics.retry_use.numerator, 1);
  assert.equal(metrics.metrics.retry_use.denominator, 3);
  assert.equal(metrics.metrics.retry_use.value, 0.333333);

  // Latency: terminal latencies = [1500, 2500, 3000].
  // min: 1500, max: 3000, mean: (1500 + 2500 + 3000) / 3 = 7000 / 3 = 2333.333333
  // p50: ceil(0.5 * 3) - 1 = index 1 -> 2500
  // p95: ceil(0.95 * 3) - 1 = index 2 -> 3000
  assert.equal(metrics.metrics.latency.sample_count, 3);
  assert.equal(metrics.metrics.latency.min, 1500);
  assert.equal(metrics.metrics.latency.max, 3000);
  assert.equal(metrics.metrics.latency.mean, 2333.333333);
  assert.equal(metrics.metrics.latency.p50, 2500);
  assert.equal(metrics.metrics.latency.p95, 3000);
  assert.equal(metrics.metrics.latency.excluded, 1); // recStarted excluded

  // Failures:
  assert.equal(metrics.metrics.failures.execution.length, 1);
  assert.deepEqual(metrics.metrics.failures.execution[0], { code: 'ROUTE_UNAVAILABLE', category: 'route', count: 1 });
  assert.equal(metrics.metrics.failures.attempts.transient, 1);
  assert.equal(metrics.metrics.failures.attempts.fatal, 1);

  // Deterministic Route Groups ordering (sorted by backend, model, effort, prompt, build):
  // 1. codex / gpt-5.6-sol / high
  // 2. omp / m1 / medium
  assert.equal(metrics.metrics.route_groups.length, 2);
  assert.equal(metrics.metrics.route_groups[0].route.backend, 'codex');
  assert.equal(metrics.metrics.route_groups[1].route.backend, 'omp');

  // Limitations include required + conditional:
  assert.ok(metrics.limitations.includes('RETAINED_VALIDATED_SAMPLE_ONLY'));
  assert.ok(metrics.limitations.includes('INVALID_RECORDS_EXCLUDED')); // from conflicting duplicate
  assert.ok(metrics.limitations.includes('ACTIVE_CONSULTATIONS_EXCLUDED')); // from started record
});

test('calculateHistoryMetrics handles zero denominators gracefully', () => {
  const metrics = calculateHistoryMetrics({
    records: [],
    generated_at: 1000
  });

  assert.equal(metrics.counts.consultations, 0);
  assert.equal(metrics.metrics.delivery.value, null);
  assert.equal(metrics.metrics.outcome_coverage.value, null);
  assert.equal(metrics.metrics.known_outcome_resolution.value, null);
  assert.equal(metrics.metrics.backup_use.value, null);
  assert.equal(metrics.metrics.retry_use.value, null);
  assert.equal(metrics.metrics.latency.sample_count, 0);
  assert.equal(metrics.metrics.latency.min, null);
  assert.equal(metrics.metrics.latency.max, null);
  assert.equal(metrics.metrics.latency.mean, null);
  assert.equal(metrics.metrics.latency.p50, null);
  assert.equal(metrics.metrics.latency.p95, null);
  assert.equal(metrics.metrics.route_groups.length, 0);
});
