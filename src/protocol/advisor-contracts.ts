export * from './advisor-contract-runtime.js';
import type {
  CheckpointV2, ControllerReceiptV2, OutcomeResult, EvidenceValidationResult
} from './advisor-contract-runtime.js';

export const STATE_PROTOCOL_V1 = 'evcrate-advisor-state' as const;
export const STATE_VERSION_V1 = 1 as const;
export const GATE_STATUSES = Object.freeze(['open', 'needs_evidence', 'in_consultation', 'needs_human', 'completed'] as const);
export type GateStatus = typeof GATE_STATUSES[number];
export const PRIMARY_RETRY_SCHEDULE_MS = Object.freeze([10_000, 20_000, 30_000] as const);
export const BACKUP_ATTEMPTS_LIMIT = 1 as const;

export interface StateBaselineRecordV1 {
  readonly path: string;
  readonly digest: string | null;
  readonly status: 'file' | 'missing';
  readonly git: {
    readonly status: string;
    readonly identity: string | null;
    readonly original_path: string | null;
  } | null;
}

export interface StateCorrectionChoiceV1 {
  readonly action_id: string;
  readonly episode_id: string;
  readonly validation_command: string;
}

export interface StateDispositionV1 {
  readonly consultation_id: string;
  readonly evidence_revision: number;
  readonly action: 'accept' | 'reject-with-evidence' | 'need-evidence' | 'reconcile';
  readonly rationale: string;
  readonly correction: StateCorrectionChoiceV1 | null;
}

export interface StateOutcomePayloadV1 {
  readonly consultation_id: string;
  readonly action_id: string | null;
  readonly episode_id: string | null;
  readonly result: OutcomeResult;
  readonly validation: EvidenceValidationResult;
  readonly actual_changed_paths: readonly string[];
}

export interface StateHumanDecisionPayloadV1 {
  readonly action: 'continue' | 'revise-scope' | 'abandon' | 'recover-pending';
  readonly rationale: string;
  readonly authorized_paths: readonly string[];
}

export interface StateHumanDecisionV1 extends StateHumanDecisionPayloadV1 {
  readonly event_id: string;
  readonly source: string;
  readonly revision: number;
  readonly episode_id: string | null;
  readonly consumed_by: string | null;
}

export interface StateProcessIdentityV1 {
  readonly pid: number;
  readonly start: string | null;
}

export interface StatePendingCheckpointV1 {
  readonly consultation_id: string;
  readonly checkpoint: CheckpointV2;
  readonly checkpoint_digest: string;
  readonly baseline: readonly StateBaselineRecordV1[];
  readonly process: StateProcessIdentityV1 | null;
}

export interface StateTerminalLinkV1 {
  readonly consultation_id: string;
  readonly status: 'ADVICE_READY' | 'FAILED';
  readonly checkpoint_id: string;
  readonly checkpoint_digest: string;
  readonly task_revision: number;
  readonly evidence_revision: number;
  readonly scope_revision: number;
  readonly result_digest: string | null;
  readonly envelope_digest: string;
  readonly receipt: ControllerReceiptV2;
  readonly has_concerns: boolean;
  readonly validation_commands: readonly string[];
  readonly intended_changed_paths: readonly string[];
}

export interface StateCorrectionV1 extends StateCorrectionChoiceV1 {
  readonly consultation_id: string;
  readonly checkpoint_digest: string;
  readonly result_digest: string;
  readonly baseline: readonly StateBaselineRecordV1[];
  readonly evidence_revision: number;
  readonly scope_revision: number;
  readonly continued_by: string | null;
}

export interface StateOutcomeV1 extends StateOutcomePayloadV1 {
  readonly evidence_revision: number;
  readonly checkpoint_digest: string;
  readonly result_digest: string;
  readonly baseline_digest: string;
}

export interface StateOperationPayloadsV1 {
  readonly init: {
    readonly phase_id: string;
    readonly task: CheckpointV2['task'];
    readonly baseline_paths: readonly string[];
  };
  readonly get: Record<string, never>;
  readonly checkpoint: { readonly checkpoint: CheckpointV2 };
  readonly disposition: StateDispositionV1;
  readonly outcome: StateOutcomePayloadV1;
  readonly 'human-decision': StateHumanDecisionPayloadV1;
  readonly complete: Record<string, never>;
}

export type StateOperationV1 = keyof StateOperationPayloadsV1;

export type StateRequestV1 = {
  [Operation in StateOperationV1]: {
    readonly protocol: typeof STATE_PROTOCOL_V1;
    readonly version: typeof STATE_VERSION_V1;
    readonly operation: Operation;
    readonly task_run_id: string;
    readonly operation_id: Operation extends 'get' ? null : string;
    readonly expected_revision: Operation extends 'get' ? null : number;
    readonly payload: StateOperationPayloadsV1[Operation];
  };
}[StateOperationV1];

export interface StateOperationRecordV1 {
  readonly operation_id: string;
  readonly operation: Exclude<StateOperationV1, 'get'> | 'attach';
  readonly digest: string;
  readonly revision: number;
  readonly consultation_id: string | null;
  readonly action_id: string | null;
  readonly episode_id: string | null;
  readonly outcome_result: OutcomeResult | null;
  readonly validation_command: string | null;
  readonly checkpoint_digest: string | null;
  readonly result_digest: string | null;
}

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
  readonly disposition: StateDispositionV1 | null;
  readonly outcome: StateOutcomeV1 | null;
  readonly task: CheckpointV2['task'];
  readonly initial_baseline: readonly StateBaselineRecordV1[];
  readonly scope_revision: number;
  readonly scope: {
    readonly authorized_paths: readonly string[];
    readonly rationale: string;
    readonly added_baseline: readonly StateBaselineRecordV1[];
  };
  readonly evidence_revision: number;
  readonly current_baseline: readonly StateBaselineRecordV1[];
  readonly pending: StatePendingCheckpointV1 | null;
  readonly last_terminal: StateTerminalLinkV1 | null;
  readonly correction: StateCorrectionV1 | null;
  readonly episode_validation_command: string | null;
  readonly human_continuation: string | null;
  readonly operation_ledger: readonly StateOperationRecordV1[];
  readonly human_decisions: readonly StateHumanDecisionV1[];
}

export interface StateResponseV1 {
  readonly protocol: typeof STATE_PROTOCOL_V1;
  readonly version: typeof STATE_VERSION_V1;
  readonly operation: StateOperationV1;
  readonly status: 'STATE_READY';
  readonly state: TaskStateV1;
  readonly consultation_id?: string;
  readonly checkpoint?: CheckpointV2;
  readonly pending_process_status?: 'never-started' | 'live' | 'dead' | 'unknown' | null;
}
