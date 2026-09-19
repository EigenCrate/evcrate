// Helpers and mock payloads for Playwright viewer explorer tests.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserHistoryFixture } from './opfs-history-fixture.mjs';
export const TEST_PROJECT_ID = 'a'.repeat(64);
export const TEST_TASK_ID = '01234567-89ab-4cde-8f01-23456789abcd';
export const TEST_CONSULT_ID_1 = '01234567-89ab-4cde-8f01-23456789ef01';
export const TEST_CONSULT_ID_2 = '01234567-89ab-4cde-8f01-23456789ef02';

export function makeExecution(consultId, status = 'ADVICE_READY') {
  const cp = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: TEST_TASK_ID,
    checkpoint_id: `chk-${consultId.slice(-4)}`,
    phase_id: 'phase-09',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:step-4',
    kind: 'review',
    question: 'Test question',
    task: {
      goal: 'Test',
      non_goals: [],
      authorized_paths: ['src/a.ts'],
      scope_rationale: 'Testing scope',
      invariants: ['Preserve safety'],
      success_criteria: ['Pass tests']
    },
    proposal: { next_action: 'Proceed', rationale: 'Verified', intended_changed_paths: ['src/a.ts'] },
    evidence: { summary: 'Evidence', files: [], validation_results: [], artifacts: [] },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };
  const digest = createHash('sha256').update(JSON.stringify(cp), 'utf8').digest('hex');
  return {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: TEST_TASK_ID,
    project_id: TEST_PROJECT_ID,
    checkpoint_digest: digest,
    checkpoint: cp,
    route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    receipt: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', controller_version: 2, adapter_version: '0.1.0', build_identity: 'b-09', elapsed_ms: 1200 },
    prompt_identity: 'p-09',
    build_identity: 'b-09',
    attempts: [{
      attempt_id: 'att-1',
      slot: 'primary',
      route: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      phase: 'model',
      model_started: true,
      elapsed_ms: 1200,
      terminal_classification: 'success',
      retry_delay_ms: null,
      cleanup_outcome: 'confirmed'
    }],
    status,
    result: {
      protocol: 'evcrate-advisor-result',
      version: 2,
      checkpoint: 'review:step-4',
      status,
      recommendation: 'Rec text',
      rationale: 'Rat text',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: [],
      unresolved_questions: []
    },
    error: null,
    started_at: 1700000000000,
    completed_at: 1700000001200
  };
}

export function makeOutcome(consultId) {
  return {
    schema_version: 1,
    consultation_id: consultId,
    task_run_id: TEST_TASK_ID,
    project_id: TEST_PROJECT_ID,
    disposition: { action: 'accept', rationale: 'Accepted' },
    evidence_revision: 0,
    actual_changed_paths: ['src/a.ts'],
    validation: { suite: 'm', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: 'resolved',
    correction_number: 1,
    recorded_at: 1700000002000
  };
}

export function makeInitialTree() {
  return {
    name: 'history-root',
    entries: {
      [TEST_PROJECT_ID]: {
        [TEST_TASK_ID]: {
          [TEST_CONSULT_ID_1]: {
            'execution.json': JSON.stringify(makeExecution(TEST_CONSULT_ID_1)),
            'outcome.json': JSON.stringify(makeOutcome(TEST_CONSULT_ID_1))
          },
          [TEST_CONSULT_ID_2]: {
            'execution.json': JSON.stringify(makeExecution(TEST_CONSULT_ID_2))
          }
        }
      }
    }
  };
}

export function makeSamplePolicy() {
  return {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'operator-selected', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
}

export function makeSampleEvaluation() {
  const fixPath = path.resolve(import.meta.dirname, '../fixtures/advisor-evaluations/valid-mixed.json');
  return JSON.parse(fs.readFileSync(fixPath, 'utf8'));
}

export async function setupPageWithTree(page, tree = makeInitialTree()) {
  const fixture = await BrowserHistoryFixture.install(page);
  await page.goto('/');
  await fixture.buildTree(tree);
  return fixture;
}
