/**
 * @file standalone-data-mappers.ts
 * Helper transformers for converting standalone reader results into E00 plugin data objects.
 */

import type { NormalizedHistoryRecordV1 } from '../../../src/protocol/advisor-metrics.js';
import type { AdvisorPolicyV2, HistoryExecutionV1, HistoryOutcomeV1 } from '../../../src/protocol/advisor-contract-runtime.js';
import type { EvaluationDocumentV1 } from '../../../src/protocol/advisor-evaluation.js';
import type { HistoryRowV1, EvaluationDescriptorV1, PolicyReadCurrentResultV1, HistoryRefreshResultV1 } from './advisor-data-provider.ts';
import type { PolicyReaderResult } from '../io/policy-reader.js';

export function createUnavailableRefreshResult(): HistoryRefreshResultV1 {
  return {
    state: 'unavailable', snapshot_id: null, observed_at: Date.now(),
    scan: { status: 'incomplete', projects_discovered: 0, tasks_discovered: 0, consultations_discovered: 0, accepted_records: 0, invalid_records: 0, bytes_discovered: 0, bytes_read: 0, diagnostics: [], suppressed_diagnostics: 0, limit_hit: false },
    stale_reason: null
  };
}

export function mapNormalizedRecordToHistoryRow(r: NormalizedHistoryRecordV1): HistoryRowV1 {
  return {
    record_ref: r.consultation_id, project_id: r.project_id, task_run_id: r.task_run_id, consultation_id: r.consultation_id,
    status: r.status, route: r.route, checkpoint_digest: r.checkpoint_digest, prompt_identity: r.prompt_identity,
    build_identity: r.build_identity, started_at: r.started_at, completed_at: r.completed_at, receipt_elapsed_ms: r.receipt_elapsed_ms,
    outcome_state: r.outcome_state, outcome_result: r.outcome_result
  };
}

export function mapEvaluationDocumentToDescriptor(doc: EvaluationDocumentV1): EvaluationDescriptorV1 {
  const observationCount = doc.cases.reduce((sum, c) => sum + c.observations.length, 0);
  return {
    evaluation_ref: doc.evaluation_id, source_revision: 'standalone', source_digest: '0'.repeat(64),
    evaluation_id: doc.evaluation_id, run_id: doc.run_id, created_at: doc.created_at,
    candidate_count: doc.candidates.length, case_count: doc.cases.length, observation_count: observationCount
  };
}

export function mapPolicyResultToCurrentPolicy(policyResult: PolicyReaderResult | null): PolicyReadCurrentResultV1 {
  if (policyResult?.status === 'POLICY_READY' && policyResult.policy && !policyResult.legacy) {
    return { status: 'ready', scope: 'account', temporal: 'current', observed_at: Date.now(), revision: 'standalone-policy-rev', policy: policyResult.policy as unknown as AdvisorPolicyV2 };
  }
  if (policyResult?.status === 'POLICY_MIGRATION_REQUIRED') {
    return { status: 'migration_required', scope: 'account', temporal: 'current', observed_at: Date.now(), revision: 'legacy' };
  }
  return { status: 'not_configured', scope: 'account', temporal: 'current', observed_at: Date.now(), revision: 'none' };
}

export function buildExecutionFromNormalized(r: NormalizedHistoryRecordV1): HistoryExecutionV1 {
  const base = {
    schema_version: 1 as const, consultation_id: r.consultation_id, task_run_id: r.task_run_id, project_id: r.project_id,
    checkpoint_digest: r.checkpoint_digest,
    checkpoint: {
      protocol: 'evcrate-advisor-checkpoint' as const, version: 2 as const, task_run_id: r.task_run_id, checkpoint_id: `cp-${r.consultation_id}`,
      phase_id: 'phase-standalone', task_revision: 1, evidence_revision: 0, checkpoint: 'review:step', kind: 'review' as const,
      question: 'Standalone viewer inspection', task: { goal: 'Inspection', non_goals: [], authorized_paths: [], scope_rationale: '', invariants: [], success_criteria: [] },
      proposal: { next_action: '', rationale: '', intended_changed_paths: [] }, evidence: { summary: '', files: [], validation_results: [], artifacts: [] },
      prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
    },
    route: r.route, prompt_identity: r.prompt_identity, build_identity: r.build_identity, attempts: r.attempts, started_at: r.started_at
  };

  if (r.status === 'started') return { ...base, status: 'started', receipt: null, result: null, error: null, completed_at: null };

  const receipt = {
    backend: r.route.backend, model: r.route.model, effort: r.route.effort, controller_version: 2 as const, adapter_version: '2.1.0',
    build_identity: r.build_identity, elapsed_ms: r.receipt_elapsed_ms ?? 0
  };

  if (r.status === 'ADVICE_READY') {
    return {
      ...base, status: 'ADVICE_READY', receipt,
      result: { protocol: 'evcrate-advisor-result', version: 2, checkpoint: 'review:step', status: 'ADVICE_READY', recommendation: 'Standalone advice inspectable', rationale: '', must_fix: [], cautions: [], assumptions: [], success_checks: [], unresolved_questions: [] },
      error: null, completed_at: r.completed_at ?? r.started_at
    };
  }

  return {
    ...base, status: 'FAILED', receipt, result: null,
    error: r.error ?? { code: 'FAILED', category: 'fatal', action: 'abort', message: 'Execution failed' },
    completed_at: r.completed_at ?? r.started_at
  };
}

export function buildOutcomeFromNormalized(r: NormalizedHistoryRecordV1): HistoryOutcomeV1 | null {
  if (!r.outcome_result) return null;
  return {
    schema_version: 1, consultation_id: r.consultation_id, task_run_id: r.task_run_id, project_id: r.project_id,
    disposition: { action: 'accept', rationale: 'Recorded outcome' }, evidence_revision: 0, actual_changed_paths: [],
    validation: { suite: 'test', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null },
    outcome: r.outcome_result, correction_number: 0, recorded_at: r.completed_at ?? r.started_at
  };
}
