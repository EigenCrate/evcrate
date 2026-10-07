'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const {
  createContext, createRequest, createIsolatedFixture, initializeStateFixture,
  abandonStateFixture, spawnCli, completeStateFixture
} = require('./activation-test-helpers.cjs');

const LIB = path.resolve(__dirname, '../../.evcrate/source/.evcrate/bin/lib/advisor');
const { executeStateRequest } = require(path.join(LIB, 'task-state.cjs'));
const { stateLocation } = require(path.join(LIB, 'state-io.cjs'));

/** Creates real baseline files inside a fixture whose cleanup is already registered. */
function createBaselineStateFixture(t) {
  const f = createIsolatedFixture(t);
  const files = {
    'plans/test/plan.md': '# Test Plan\n\n## Overview\nDeterministic qualification plan.\n',
    'plans/test/phase-01.md': '# Phase 01\n\nInitial phase content.\n',
    'src/feature.js': 'module.exports = function feature() { return "original"; };\n'
  };
  const baselinePaths = Object.keys(files);
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(f.project, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  const state = executeStateRequest({
    protocol: 'evcrate-advisor-state', version: 1, operation: 'init',
    task_run_id: f.taskRunId, operation_id: randomUUID(),
    expected_revision: 0,
    payload: {
      phase_id: 'phase-01',
      task: {
        goal: 'Baseline deterministic qualification task', non_goals: ['Unrelated changes'],
        authorized_paths: baselinePaths, scope_rationale: 'Deterministic qualification baseline scope',
        invariants: ['Preserve baseline identity'], success_criteria: ['Relevant validation passes']
      },
      baseline_paths: baselinePaths
    }
  }, f.context).state;
  f.stateFile = path.join(stateLocation(f.context, f.taskRunId).taskDirectory, 'state.json');
  return { ...f, state };
}

/**
 * Advances initialized state through genuine controller operations to completed state.
 * Uses real task-state.cjs API: checkpoint -> claim -> attach -> disposition -> outcome -> complete.
 * Also writes matching canonical completion receipt outside baseline paths.
 */
function completeStateFixtureWithBaseline(fixtureContext, state) {
  const completed = completeStateFixture(fixtureContext, state);

  // Write matching completion receipt outside captured baseline
  const reportsDir = path.join(fixtureContext.project, 'plans/test/reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const completeEntry = completed.operation_ledger.at(-1);

  const planPath = completed.scope.authorized_paths.find((p) => p.endsWith('/plan.md')) || 'plans/test/plan.md';
  const phasePath = completed.scope.authorized_paths.find((p) => p.endsWith(`/${completed.phase_id}.md`)) || `plans/test/${completed.phase_id}.md`;

  const sealedPathMetadata = completed.current_baseline.map((record) => {
    const filePath = path.join(fixtureContext.project, record.path);
    const stat = fs.statSync(filePath);
    const sha256 = computeStateFileHash(filePath);
    return {
      path: record.path,
      status: record.status,
      digest: record.digest,
      sha256,
      size: stat.size
    };
  });

  const receiptPath = path.join(reportsDir, 'phase-01-completion-receipt.md');
  fs.writeFileSync(receiptPath, [
    '# Phase 01 Completion Receipt', '',
    `- **Task Run ID:** ${completed.task_run_id}`,
    `- **Project ID:** ${completed.project_id}`,
    `- **Phase ID:** ${completed.phase_id}`,
    `- **Plan Path:** ${planPath}`,
    `- **Phase Path:** ${phasePath}`,
    `- **Completion Revision:** ${completeEntry.revision}`,
    `- **Complete Operation ID:** ${completeEntry.operation_id}`,
    `- **Ledger Digest:** ${completeEntry.digest}`,
    `- **Baseline Digest:** ${completed.outcome.baseline_digest}`,
    `- **Sealed Baseline Digest:** ${completed.outcome.baseline_digest}`,
    `- **Gate Status:** ${completed.gate_status}`, '',
    '## Approved Scope',
    `- **Authorized Paths:** ${completed.scope.authorized_paths.join(', ')}`,
    `- **Scope Rationale:** ${completed.scope.rationale}`,
    `- **Scope Revision:** ${completed.scope_revision}`, '',
    '## Run Identity',
    `- **Task Run ID:** ${completed.task_run_id}`,
    `- **Task Revision:** ${completed.task_revision}`,
    `- **Scope Revision:** ${completed.scope_revision}`,
    `- **Evidence Revision:** ${completed.evidence_revision}`, '',
    '## Completion Operation',
    `- **Operation:** ${completeEntry.operation}`,
    `- **Complete Operation ID:** ${completeEntry.operation_id}`,
    `- **Completion Revision:** ${completeEntry.revision}`,
    `- **Ledger Digest:** ${completeEntry.digest}`, '',
    '## Evidence Revision',
    `- **Evidence Revision:** ${completed.evidence_revision}`,
    `- **Disposition Evidence Revision:** ${completed.disposition.evidence_revision}`,
    `- **Outcome Evidence Revision:** ${completed.outcome.evidence_revision}`, '',
    '## Disposition and Outcome',
    `- **Accepted Disposition Action:** ${completed.disposition.action}`,
    `- **Disposition Rationale:** ${completed.disposition.rationale}`,
    `- **Disposition Consultation ID:** ${completed.disposition.consultation_id}`,
    `- **Resolved Outcome Result:** ${completed.outcome.result}`,
    `- **Outcome Consultation ID:** ${completed.outcome.consultation_id}`,
    `- **Outcome Recorded At:** ${completed.outcome.recorded_at}`,
    `- **Actual Changed Paths:** ${JSON.stringify(completed.outcome.actual_changed_paths)}`, '',
    '## Retained Reviewed Evidence Paths',
    ...completed.current_baseline.map((record) =>
      `- **Path:** \`${record.path}\` (status: ${record.status}, baseline digest: \`${record.digest}\`)`
    ), '',
    '## Actual Validation',
    `- **Suite:** ${completed.outcome.validation.suite}`,
    `- **Command:** \`${completed.outcome.validation.command}\``,
    `- **Status:** ${completed.outcome.validation.status}`,
    `- **Passed:** ${completed.outcome.validation.passed}`,
    `- **Failed:** ${completed.outcome.validation.failed}`,
    `- **Details:** ${JSON.stringify(completed.outcome.validation.details)}`, '',
    '## Sealed-Path Metadata',
    ...sealedPathMetadata.map((meta) =>
      `- \`${meta.path}\`: status=${meta.status}, size=${meta.size}, sha256=${meta.sha256}, baseline_digest=${meta.digest}`
    ), '',
    '```json sealed-path-metadata',
    JSON.stringify(sealedPathMetadata, null, 2),
    '```', ''
  ].join('\n'), 'utf8');
  return completed;
}

function executeStateGet(fixtureContext, taskRunId) {
  return executeStateRequest({
    protocol: 'evcrate-advisor-state', version: 1, operation: 'get',
    task_run_id: taskRunId, operation_id: null, expected_revision: null, payload: {}
  }, fixtureContext.context);
}

function computeStateFileHash(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

module.exports = {
  createContext, createRequest, createIsolatedFixture, initializeStateFixture,
  abandonStateFixture, spawnCli, createBaselineStateFixture,
  completeStateFixtureWithBaseline, executeStateGet, computeStateFileHash
};
