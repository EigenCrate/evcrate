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
  const receiptPath = path.join(reportsDir, 'phase-01-completion-receipt.md');
  fs.writeFileSync(receiptPath, [
    '# Phase 01 Completion Receipt', '',
    `- **Task Run ID:** ${completed.task_run_id}`,
    `- **Project ID:** ${completed.project_id}`,
    `- **Phase ID:** ${completed.phase_id}`,
    `- **Completion Revision:** ${completeEntry.revision}`,
    `- **Complete Operation ID:** ${completeEntry.operation_id}`,
    `- **Ledger Digest:** ${completeEntry.digest}`,
    `- **Baseline Digest:** ${completed.outcome.baseline_digest}`,
    `- **Gate Status:** ${completed.gate_status}`, ''
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
