export const ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE = 'ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE';
export const ADVICE_CALLER_UNAVAILABLE_VSCODE = 'ADVICE_CALLER_UNAVAILABLE_VSCODE';

export interface VscodeEvidenceFile {
  readonly path: string;
  readonly excerpt: string;
  readonly digest: string;
}

export interface VscodeEvidenceValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface VscodeConsoleValidationResult {
  readonly isInteractive: boolean;
  readonly channel: 'tty' | 'console' | 'none';
  readonly requiresHuman: boolean;
}

export interface VscodeAdvisorExecutableResult {
  readonly executablePath: string;
  readonly available: boolean;
  readonly reason?: string;
}

export interface VscodeCheckpointProposal {
  readonly next_action: string;
  readonly rationale: string;
  readonly intended_changed_paths: readonly string[];
}

export interface VscodeCheckpointTask {
  readonly goal: string;
  readonly non_goals?: readonly string[];
  readonly authorized_paths: readonly string[];
  readonly scope_rationale?: string;
  readonly invariants?: readonly string[];
  readonly success_criteria?: readonly string[];
}

export interface VscodeCheckpointEvidence {
  readonly summary: string;
  readonly files: readonly VscodeEvidenceFile[];
  readonly validation_results?: readonly unknown[];
  readonly artifacts?: readonly unknown[];
}

export interface VscodeCheckpointEnvelopeOptions {
  readonly task_run_id: string;
  readonly checkpoint_id: string;
  readonly phase_id: string;
  readonly task_revision: number;
  readonly evidence_revision: number;
  readonly checkpoint: string;
  readonly kind: 'direction' | 'review' | 'stuck' | 'decision' | 'reconcile';
  readonly question: string;
  readonly task: VscodeCheckpointTask;
  readonly proposal: VscodeCheckpointProposal;
  readonly evidence: VscodeCheckpointEvidence;
  readonly prior?: Record<string, unknown>;
}

export interface VscodeStateEnvelopeOptions {
  readonly task_run_id: string;
  readonly operation_id?: string | null;
  readonly expected_revision?: number | null;
  readonly payload?: Record<string, unknown>;
}
