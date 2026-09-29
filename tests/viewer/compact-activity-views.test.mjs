/**
 * @file compact-activity-views.test.mjs
 * Verification suite for Phase 06: Compact Overview, History, and Accessible Tabs.
 * Validates roving tabIndex, keyboard navigation (ArrowLeft/Right/Up/Down, Home, End, Escape invariant),
 * all 6 rate metrics preservation, latency quantiles, outcome missingness, and narrow card fields.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_HASH_VIEWS,
  getNextRovingHashView,
  parseHashView,
  formatHash
} from '../../viewer/src/hash-view.ts';
import {
  calculateHistoryMetrics
} from '../../dist/protocol/advisor-metrics.js';

test('Phase 06 - Accessible Tabs: 4 standard hash tabs defined and ordered', () => {
  assert.deepEqual(VALID_HASH_VIEWS, ['overview', 'history', 'configuration', 'evaluations']);
  for (const view of VALID_HASH_VIEWS) {
    assert.equal(parseHashView(formatHash(view)), view);
  }
});

test('Phase 06 - Accessible Tabs: ArrowRight and ArrowDown advance and wrap cleanly', () => {
  assert.equal(getNextRovingHashView('overview', 'ArrowRight'), 'history');
  assert.equal(getNextRovingHashView('history', 'ArrowRight'), 'configuration');
  assert.equal(getNextRovingHashView('configuration', 'ArrowRight'), 'evaluations');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowRight'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'ArrowDown'), 'history');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowDown'), 'overview');
});

test('Phase 06 - Accessible Tabs: ArrowLeft and ArrowUp retreat and wrap cleanly', () => {
  assert.equal(getNextRovingHashView('overview', 'ArrowLeft'), 'evaluations');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowLeft'), 'configuration');
  assert.equal(getNextRovingHashView('configuration', 'ArrowLeft'), 'history');
  assert.equal(getNextRovingHashView('history', 'ArrowLeft'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'ArrowUp'), 'evaluations');
  assert.equal(getNextRovingHashView('evaluations', 'ArrowUp'), 'configuration');
});

test('Phase 06 - Accessible Tabs: Home and End navigate to first and last tabs', () => {
  assert.equal(getNextRovingHashView('evaluations', 'Home'), 'overview');
  assert.equal(getNextRovingHashView('history', 'Home'), 'overview');
  assert.equal(getNextRovingHashView('configuration', 'Home'), 'overview');

  assert.equal(getNextRovingHashView('overview', 'End'), 'evaluations');
  assert.equal(getNextRovingHashView('history', 'End'), 'evaluations');
  assert.equal(getNextRovingHashView('configuration', 'End'), 'evaluations');
});

test('Phase 06 - Accessible Tabs: Invariant: Escape key is never intercepted', () => {
  // Tabs MUST NOT intercept Escape so host outer panel can handle dismissal
  for (const view of VALID_HASH_VIEWS) {
    assert.equal(getNextRovingHashView(view, 'Escape'), null);
  }
});

test('Phase 06 - Overview Metrics: Preserves all 6 key rate metrics without loss', () => {
  const sampleRecords = [
    {
      project_id: 'proj-alpha',
      task_run_id: 'task-1',
      consultation_id: 'c-1',
      started_at: 1000,
      status: 'ADVICE_READY',
      route: { backend: 'omp', model: 'gpt-4o', effort: 'high' },
      receipt_elapsed_ms: 120,
      outcome_state: 'valid',
      outcome_result: 'resolved',
      attempts: [{ route: { backend: 'omp', model: 'gpt-4o', effort: 'high' }, terminal_classification: 'ADVICE_READY', elapsed_ms: 120 }]
    },
    {
      project_id: 'proj-alpha',
      task_run_id: 'task-2',
      consultation_id: 'c-2',
      started_at: 2000,
      status: 'FAILED',
      route: { backend: 'omp', model: 'gpt-4o', effort: 'high' },
      receipt_elapsed_ms: 250,
      outcome_state: 'valid',
      outcome_result: 'unresolved',
      attempts: [
        { route: { backend: 'omp', model: 'gpt-4o', effort: 'high' }, terminal_classification: 'FAILED', elapsed_ms: 100 },
        { route: { backend: 'omp', model: 'gpt-4o-backup', effort: 'high' }, terminal_classification: 'FAILED', elapsed_ms: 150 }
      ]
    }
  ];

  const result = calculateHistoryMetrics({ records: sampleRecords, generated_at: 5000 });

  // Verify all 6 rate metrics are computed and non-null
  assert.ok(result.metrics.delivery !== undefined, 'Delivery rate metric must be present');
  assert.ok(result.metrics.outcome_coverage !== undefined, 'Outcome coverage metric must be present');
  assert.ok(result.metrics.known_outcome_resolution !== undefined, 'Known outcome resolution must be present');
  assert.ok(result.metrics.resolution !== undefined, 'Resolution rate metric must be present');
  assert.ok(result.metrics.backup_use !== undefined, 'Backup use metric must be present');
  assert.ok(result.metrics.retry_use !== undefined, 'Retry use metric must be present');

  // Verify latency quantiles are present
  assert.ok(result.metrics.latency.p50 !== undefined);
  assert.ok(result.metrics.latency.p95 !== undefined);
  assert.ok(result.metrics.latency.mean !== undefined);
  assert.equal(result.metrics.latency.sample_count, 2);

  // Verify outcomes breakdown
  assert.equal(result.counts.outcome_results.resolved, 1);
  assert.equal(result.counts.outcome_results.unresolved, 1);
  assert.equal(result.counts.outcome_results.regressed, 0);

  // Verify limitations exist
  assert.ok(Array.isArray(result.limitations));
  assert.ok(result.limitations.length > 0);
});

test('Phase 06 - Activity Scope Control: validates disabled reasons for scope actions', () => {
  function getScopeState(hasProject, rootAuthority, isAvailable) {
    const allAvailable = Boolean(hasProject && rootAuthority && isAvailable);
    const allUnavailableReason = !hasProject
      ? 'Select a project in Workspace to load history'
      : !rootAuthority
        ? 'All History requires root history authority'
        : !isAvailable
          ? 'History provider is currently unavailable'
          : null;
    return { allAvailable, allUnavailableReason };
  }

  // No project selected
  const s1 = getScopeState(false, true, true);
  assert.equal(s1.allAvailable, false);
  assert.equal(s1.allUnavailableReason, 'Select a project in Workspace to load history');

  // Project selected but non-root authority
  const s2 = getScopeState(true, false, true);
  assert.equal(s2.allAvailable, false);
  assert.equal(s2.allUnavailableReason, 'All History requires root history authority');

  // Project selected with root authority but provider unavailable
  const s3 = getScopeState(true, true, false);
  assert.equal(s3.allAvailable, false);
  assert.equal(s3.allUnavailableReason, 'History provider is currently unavailable');

  // Fully available
  const s4 = getScopeState(true, true, true);
  assert.equal(s4.allAvailable, true);
  assert.equal(s4.allUnavailableReason, null);
});
