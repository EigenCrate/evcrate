// Fixture generator and hand-computed expectations for Advisor Metrics
import { createHash } from 'node:crypto';

export function makeCheckpoint(task_run_id, checkpoint_id = 'chk-001', phase_id = 'phase-02') {
  return Object.freeze({
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id,
    checkpoint_id,
    phase_id,
    task_revision: 1,
    evidence_revision: 1,
    checkpoint: 'review:step-4',
    kind: 'review',
    question: 'Are history metrics and digests deterministic?',
    task: {
      goal: 'Metrics kernel validation',
      non_goals: ['network calls'],
      authorized_paths: ['src/protocol/advisor-metrics.ts'],
      scope_rationale: 'Phase 02 metrics verification',
      invariants: ['Pure environment-neutral calculations'],
      success_criteria: ['100% passing tests']
    },
    proposal: {
      next_action: 'Proceed to review gate',
      rationale: 'All invariants verified',
      intended_changed_paths: ['src/protocol/advisor-metrics.ts']
    },
    evidence: {
      summary: 'Verified pure calculations',
      files: [
        {
          path: 'src/protocol/advisor-metrics.ts',
          excerpt: 'export function calculateHistoryMetrics',
          digest: 'a'.repeat(64)
        }
      ],
      validation_results: [
        {
          suite: 'metrics',
          command: 'npm run test:advisor-metrics',
          status: 'passed',
          passed: 10,
          failed: 0,
          details: null
        }
      ],
      artifacts: [
        {
          id: 'art-001',
          path: 'src/protocol/advisor-metrics.ts',
          digest: 'c'.repeat(64),
          description: 'Metrics source artifact'
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
}

export function computeDigest(checkpoint) {
  return createHash('sha256').update(JSON.stringify(checkpoint), 'utf8').digest('hex');
}

export function createRawExecution(opts) {
  const cp = makeCheckpoint(opts.task_run_id, opts.checkpoint_id);
  const digest = computeDigest(cp);
  return {
    schema_version: 1,
    consultation_id: opts.consultation_id,
    task_run_id: opts.task_run_id,
    project_id: opts.project_id,
    checkpoint_digest: digest,
    checkpoint: cp,
    route: opts.route,
    receipt: opts.receipt,
    prompt_identity: opts.prompt_identity ?? 'prompt-v2',
    build_identity: opts.build_identity ?? 'build-v2',
    attempts: opts.attempts,
    status: opts.status,
    result: opts.result,
    error: opts.error,
    started_at: opts.started_at,
    completed_at: opts.completed_at
  };
}

export function createRawOutcome(opts) {
  return {
    schema_version: 1,
    consultation_id: opts.consultation_id,
    task_run_id: opts.task_run_id,
    project_id: opts.project_id,
    disposition: { action: opts.action ?? 'accept', rationale: opts.rationale ?? 'Accepted counsel' },
    evidence_revision: opts.evidence_revision ?? 0,
    actual_changed_paths: ['src/protocol/advisor-metrics.ts'],
    validation: {
      suite: 'metrics', command: 'npm test', status: 'passed', passed: 1, failed: 0, details: null
    },
    outcome: opts.outcome,
    correction_number: opts.correction_number ?? 1,
    recorded_at: opts.recorded_at ?? 5000
  };
}
