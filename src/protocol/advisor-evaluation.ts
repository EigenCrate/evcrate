import type { AdvisorRouteTarget, SanitizedErrorRecord } from './advisor-contract-runtime.js';

export const EVALUATION_PROTOCOL_V1 = 'evcrate-advisor-counsel-evaluation' as const;
export const EVALUATION_VERSION_V1 = 1 as const;
export const MAX_EVALUATION_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_EVALUATION_TEXT_BYTES = 4096;
export const MAX_EVALUATION_SHORT_TEXT_BYTES = 256;
export const MAX_EVALUATION_LIST_ITEMS = 32;
export const MIN_DIMENSIONS = 1;
export const MAX_DIMENSIONS = 16;
export const MIN_CANDIDATES = 2;
export const MAX_CANDIDATES = 16;
export const MIN_CASES = 1;
export const MAX_CASES = 256;
export const EVALUATION_RUBRIC_SCALE = Object.freeze([1, 5] as const);
export const EVALUATION_RESPONSE_STATUSES = Object.freeze(['ADVICE_READY', 'FAILED', 'MISSING'] as const);
export type EvaluationResponseStatus = typeof EVALUATION_RESPONSE_STATUSES[number];
export const EVALUATION_PROVENANCES = Object.freeze(['human', 'automated'] as const);
export type EvaluationProvenance = typeof EVALUATION_PROVENANCES[number];
export type EvaluationDimensionScore = 1 | 2 | 3 | 4 | 5 | null;

export interface EvaluationRubricDimensionV1 {
  readonly id: string;
  readonly description: string;
  readonly scale: readonly [1, 5];
}

export interface EvaluationRubricV1 {
  readonly version: 1;
  readonly dimensions: readonly EvaluationRubricDimensionV1[];
  readonly pass_threshold: number;
}

export interface EvaluationCandidateV1 {
  readonly candidate_id: string;
  readonly label: string | null;
  readonly route: AdvisorRouteTarget;
  readonly prompt_identity: string | null;
  readonly build_identity: string | null;
}

export interface EvaluationCaseInputContextV1 {
  readonly goal: string;
  readonly non_goals: readonly string[];
  readonly authorized_paths: readonly string[];
}

export interface EvaluationCaseInputProposalV1 {
  readonly hypothesis: string;
  readonly intended_action: string;
}

export interface EvaluationCaseInputEvidenceV1 {
  readonly observed_failure: string;
  readonly files: readonly string[];
  readonly validation_command: string;
}

export interface EvaluationCaseInputV1 {
  readonly context: EvaluationCaseInputContextV1;
  readonly executor_proposal: EvaluationCaseInputProposalV1;
  readonly evidence: EvaluationCaseInputEvidenceV1;
}

export interface EvaluationResponseResultV1 {
  readonly recommendation: string;
  readonly rationale: string;
  readonly must_fix: readonly string[];
  readonly cautions: readonly string[];
  readonly assumptions: readonly string[];
  readonly success_checks: readonly string[];
  readonly unresolved_questions: readonly string[];
}

export interface EvaluationResponseReadyV1 {
  readonly status: 'ADVICE_READY';
  readonly result: EvaluationResponseResultV1;
  readonly error: null;
  readonly captured_at: number;
}

export interface EvaluationResponseFailedV1 {
  readonly status: 'FAILED';
  readonly result: null;
  readonly error: SanitizedErrorRecord;
  readonly captured_at: number;
}

export interface EvaluationResponseMissingV1 {
  readonly status: 'MISSING';
  readonly result: null;
  readonly error: null;
  readonly captured_at: null;
}

export type EvaluationResponseV1 =
  | EvaluationResponseReadyV1
  | EvaluationResponseFailedV1
  | EvaluationResponseMissingV1;

export interface EvaluationScoreDimensionV1 {
  readonly dimension_id: string;
  readonly score: EvaluationDimensionScore;
}

export interface EvaluationScoreV1 {
  readonly provenance: EvaluationProvenance;
  readonly judge_id: string;
  readonly judge_version: string;
  readonly scored_at: number;
  readonly dimensions: readonly EvaluationScoreDimensionV1[];
  readonly average_score: number | null;
  readonly passed: boolean | null;
  readonly issues: readonly string[];
}

export interface EvaluationObservationV1 {
  readonly candidate_id: string;
  readonly response: EvaluationResponseV1;
  readonly score: EvaluationScoreV1 | null;
}

export interface EvaluationCaseV1 {
  readonly case_id: string;
  readonly name: string;
  readonly category: string;
  readonly input: EvaluationCaseInputV1;
  readonly input_digest: string;
  readonly observations: readonly EvaluationObservationV1[];
}

export interface EvaluationDocumentV1 {
  readonly protocol: typeof EVALUATION_PROTOCOL_V1;
  readonly version: typeof EVALUATION_VERSION_V1;
  readonly evaluation_id: string;
  readonly run_id: string;
  readonly created_at: number;
  readonly rubric: EvaluationRubricV1;
  readonly rubric_digest: string;
  readonly candidates: readonly EvaluationCandidateV1[];
  readonly cases: readonly EvaluationCaseV1[];
}

export * from './advisor-evaluation-validation.js';
export * from './advisor-evaluation-comparison.js';
