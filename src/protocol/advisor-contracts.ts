import type { AdvisorBackend } from './advisor-settings.js';

export const CHECKPOINT_PROTOCOL_V2 = 'evcrate-advisor-checkpoint' as const;
export const CHECKPOINT_VERSION_V2 = 2 as const;

export const RESULT_PROTOCOL_V2 = 'evcrate-advisor-result' as const;
export const RESULT_VERSION_V2 = 2 as const;

export const CONTROLLER_PROTOCOL_V2 = 'evcrate-advisor-controller' as const;
export const CONTROLLER_VERSION_V2 = 2 as const;

export const STATE_PROTOCOL_V1 = 'evcrate-advisor-state' as const;
export const STATE_VERSION_V1 = 1 as const;

export const HISTORY_PROTOCOL_V1 = 'evcrate-advisor-history' as const;
export const HISTORY_VERSION_V1 = 1 as const;

export const DECISION_KINDS = Object.freeze(['direction', 'review', 'stuck', 'decision', 'reconcile'] as const);
export type DecisionKind = typeof DECISION_KINDS[number];

export const GATE_STATUSES = Object.freeze(['open', 'needs_evidence', 'in_consultation', 'needs_human', 'completed'] as const);
export type GateStatus = typeof GATE_STATUSES[number];

export const ATTEMPT_SLOTS = Object.freeze(['primary', 'backup'] as const);
export type AttemptSlot = typeof ATTEMPT_SLOTS[number];

export const ATTEMPT_PHASES = Object.freeze(['preflight', 'model'] as const);
export type AttemptPhase = typeof ATTEMPT_PHASES[number];

export const TERMINAL_CLASSIFICATIONS = Object.freeze(['success', 'transient', 'fatal', 'cancelled', 'skipped'] as const);
export type TerminalClassification = typeof TERMINAL_CLASSIFICATIONS[number];

export const CLEANUP_OUTCOMES = Object.freeze(['confirmed', 'unconfirmed', 'not_needed'] as const);
export type CleanupOutcome = typeof CLEANUP_OUTCOMES[number];

export const AUDIT_STATUSES = Object.freeze(['recorded', 'degraded', 'disabled'] as const);
export type AuditStatus = typeof AUDIT_STATUSES[number];

export const OUTCOME_RESULTS = Object.freeze(['resolved', 'unresolved', 'regressed', 'unknown'] as const);
export type OutcomeResult = typeof OUTCOME_RESULTS[number];

export const EXECUTION_STATUSES = Object.freeze(['started', 'ADVICE_READY', 'FAILED'] as const);
export type ExecutionStatus = typeof EXECUTION_STATUSES[number];

export const PRIMARY_RETRY_SCHEDULE_MS = Object.freeze([10_000, 20_000, 30_000] as const);
export const BACKUP_ATTEMPTS_LIMIT = 1 as const;
export const MAX_MODEL_ATTEMPTS = 5 as const;
export const MAX_TOTAL_ATTEMPT_SUMMARIES = 8 as const;
export const MAX_CORRECTION_CYCLES = 3 as const;

export interface EvidenceFileV2 {
  readonly path: string;
  readonly excerpt: string;
  readonly digest: string;
}

export interface EvidenceValidationResult {
  readonly suite: string;
  readonly command: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly passed: number;
  readonly failed: number;
  readonly details: string | null;
}

export interface EvidenceArtifactRef {
  readonly id: string;
  readonly path: string;
  readonly digest: string;
  readonly description: string;
}

export interface CheckpointV2 {
  readonly protocol: typeof CHECKPOINT_PROTOCOL_V2;
  readonly version: typeof CHECKPOINT_VERSION_V2;
  readonly task_run_id: string;
  readonly checkpoint_id: string;
  readonly phase_id: string;
  readonly task_revision: number;
  readonly evidence_revision: number;
  readonly checkpoint: string;
  readonly kind: DecisionKind;
  readonly question: string;
  readonly task: {
    readonly goal: string;
    readonly non_goals: readonly string[];
    readonly authorized_paths: readonly string[];
    readonly scope_rationale: string;
    readonly invariants: readonly string[];
    readonly success_criteria: readonly string[];
  };
  readonly proposal: {
    readonly next_action: string;
    readonly rationale: string;
    readonly intended_changed_paths: readonly string[];
  };
  readonly evidence: {
    readonly summary: string;
    readonly files: readonly EvidenceFileV2[];
    readonly validation_results: readonly EvidenceValidationResult[];
    readonly artifacts: readonly EvidenceArtifactRef[];
  };
  readonly prior: {
    readonly prior_consultation_id: string | null;
    readonly prior_counsel: string | null;
    readonly prior_disposition: string | null;
    readonly observed_outcome: string | null;
  };
}

export interface AdvisorResultBodyV2 {
  readonly recommendation: string;
  readonly rationale: string;
  readonly must_fix: readonly string[];
  readonly cautions: readonly string[];
  readonly assumptions: readonly string[];
  readonly success_checks: readonly string[];
  readonly unresolved_questions: readonly string[];
}

export interface AdvisorResultV2 extends AdvisorResultBodyV2 {
  readonly protocol: typeof RESULT_PROTOCOL_V2;
  readonly version: typeof RESULT_VERSION_V2;
  readonly checkpoint: string;
  readonly status: 'ADVICE_READY';
}

export interface AttemptOutcome {
  readonly attempt_id: string;
  readonly slot: AttemptSlot;
  readonly route: {
    readonly backend: AdvisorBackend;
    readonly model: string;
    readonly effort: string;
  };
  readonly phase: AttemptPhase;
  readonly model_started: boolean;
  readonly elapsed_ms: number;
  readonly terminal_classification: TerminalClassification;
  readonly retry_delay_ms: number | null;
  readonly cleanup_outcome: CleanupOutcome;
}

export interface SanitizedErrorRecord {
  readonly code: string;
  readonly category: string;
  readonly action: string;
  readonly message: string;
}

export interface ControllerReceiptV2 {
  readonly backend: AdvisorBackend | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly controller_version: typeof CONTROLLER_VERSION_V2;
  readonly adapter_version: string | null;
  readonly build_identity: string | null;
  readonly elapsed_ms: number;
}

export interface ControllerEnvelopeV2Success {
  readonly protocol: typeof CONTROLLER_PROTOCOL_V2;
  readonly version: typeof CONTROLLER_VERSION_V2;
  readonly correlation_id: string;
  readonly task_run_id: string;
  readonly checkpoint_id: string;
  readonly task_revision: number;
  readonly evidence_revision: number;
  readonly checkpoint_digest: string;
  readonly status: 'ADVICE_READY';
  readonly receipt: ControllerReceiptV2;
  readonly attempts: readonly AttemptOutcome[];
  readonly result: AdvisorResultV2;
  readonly audit_status: AuditStatus;
}

export interface ControllerEnvelopeV2Failure {
  readonly protocol: typeof CONTROLLER_PROTOCOL_V2;
  readonly version: typeof CONTROLLER_VERSION_V2;
  readonly correlation_id: string;
  readonly task_run_id: string;
  readonly checkpoint_id: string;
  readonly task_revision: number;
  readonly evidence_revision: number;
  readonly checkpoint_digest: string;
  readonly status: 'FAILED';
  readonly receipt: ControllerReceiptV2;
  readonly attempts: readonly AttemptOutcome[];
  readonly error: SanitizedErrorRecord;
  readonly audit_status: AuditStatus;
}

export type ControllerEnvelopeV2 = ControllerEnvelopeV2Success | ControllerEnvelopeV2Failure;

export interface TaskStateV1 {
  readonly schema_version: typeof STATE_VERSION_V1;
  readonly task_run_id: string;
  readonly project_id: string;
  readonly task_revision: number;
  readonly phase_id: string;
  readonly gate_status: GateStatus;
  readonly unresolved_episode_id: string | null;
  readonly correction_count: number;
  readonly pending_consultation_id: string | null;
  readonly last_consultation_id: string | null;
  readonly disposition: string | null;
  readonly outcome: string | null;
}

export interface HistoryExecutionV1Base {
  readonly schema_version: typeof HISTORY_VERSION_V1;
  readonly consultation_id: string;
  readonly task_run_id: string;
  readonly project_id: string;
  readonly checkpoint_digest: string;
  readonly route: {
    readonly backend: AdvisorBackend;
    readonly model: string;
    readonly effort: string;
  };
  readonly attempts: readonly AttemptOutcome[];
  readonly started_at: number;
}

export interface HistoryExecutionV1Started extends HistoryExecutionV1Base {
  readonly status: 'started';
  readonly result: null;
  readonly error: null;
  readonly completed_at: null;
}

export interface HistoryExecutionV1Success extends HistoryExecutionV1Base {
  readonly status: 'ADVICE_READY';
  readonly result: AdvisorResultV2;
  readonly error: null;
  readonly completed_at: number;
}

export interface HistoryExecutionV1Failure extends HistoryExecutionV1Base {
  readonly status: 'FAILED';
  readonly result: null;
  readonly error: SanitizedErrorRecord;
  readonly completed_at: number;
}

export type HistoryExecutionV1 =
  | HistoryExecutionV1Started
  | HistoryExecutionV1Success
  | HistoryExecutionV1Failure;

export interface HistoryOutcomeV1 {
  readonly schema_version: typeof HISTORY_VERSION_V1;
  readonly consultation_id: string;
  readonly task_run_id: string;
  readonly disposition: string;
  readonly actual_changes_revision: number;
  readonly validation_reference: string;
  readonly outcome: OutcomeResult;
  readonly correction_number: number;
  readonly recorded_at: number;
}
