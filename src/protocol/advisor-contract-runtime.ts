import { isPlainObject } from './json.js';

export type AdvisorBackend = 'claude' | 'codex' | 'antigravity' | 'pi' | 'omp';
export const CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp'] as const), ADVISOR_BACKENDS = CANDIDATE_BACKENDS;
export const CHECKPOINT_PROTOCOL_V2 = 'evcrate-advisor-checkpoint' as const, CHECKPOINT_VERSION_V2 = 2 as const, RESULT_PROTOCOL_V2 = 'evcrate-advisor-result' as const, RESULT_VERSION_V2 = 2 as const, CONTROLLER_PROTOCOL_V2 = 'evcrate-advisor-controller' as const, CONTROLLER_VERSION_V2 = 2 as const, HISTORY_PROTOCOL_V1 = 'evcrate-advisor-history' as const, HISTORY_VERSION_V1 = 1 as const;
export const MAX_POLICY_BYTES = 16384, MAX_ENVELOPE_BYTES = 32768, MAX_QUESTION_BYTES = 4096, MAX_TASK_BYTES = 8192, MAX_EVIDENCE_TEXT_BYTES = 16384, MAX_RESULT_BODY_BYTES = 16384, MAX_STATE_BYTES = 65536, MAX_EXECUTION_HISTORY_BYTES = 131072, MAX_OUTCOME_HISTORY_BYTES = 65536;
export const MAX_EVIDENCE_FILES = 4, MAX_CHANGED_PATHS = 16, MAX_MODEL_ATTEMPTS = 5, MAX_TOTAL_ATTEMPT_SUMMARIES = 8, MAX_CORRECTION_CYCLES = 3;
export const DECISION_KINDS = Object.freeze(['direction', 'review', 'stuck', 'decision', 'reconcile'] as const), ATTEMPT_SLOTS = Object.freeze(['primary', 'backup'] as const), ATTEMPT_PHASES = Object.freeze(['preflight', 'model'] as const), TERMINAL_CLASSIFICATIONS = Object.freeze(['success', 'transient', 'fatal', 'cancelled', 'skipped'] as const), CLEANUP_OUTCOMES = Object.freeze(['confirmed', 'unconfirmed', 'not_needed'] as const), AUDIT_STATUSES = Object.freeze(['recorded', 'degraded', 'disabled'] as const), OUTCOME_RESULTS = Object.freeze(['resolved', 'unresolved', 'regressed', 'unknown'] as const), EXECUTION_STATUSES = Object.freeze(['started', 'ADVICE_READY', 'FAILED'] as const);
export type DecisionKind = typeof DECISION_KINDS[number]; export type AttemptSlot = typeof ATTEMPT_SLOTS[number]; export type AttemptPhase = typeof ATTEMPT_PHASES[number]; export type TerminalClassification = typeof TERMINAL_CLASSIFICATIONS[number]; export type CleanupOutcome = typeof CLEANUP_OUTCOMES[number]; export type AuditStatus = typeof AUDIT_STATUSES[number]; export type OutcomeResult = typeof OUTCOME_RESULTS[number]; export type ExecutionStatus = typeof EXECUTION_STATUSES[number];

export interface AdvisorRouteTarget { readonly backend: AdvisorBackend; readonly model: string; readonly effort: string; } export interface AdvisorWaitPolicy { readonly mode: 'until_terminal'; readonly warn_after_ms: number; readonly warn_every_ms: number; } export interface AdvisorHistoryPolicy { readonly retention_days: number; readonly max_bytes: number; }
export interface AdvisorPolicyV2 { readonly version: 2; readonly advisor: { readonly primary: AdvisorRouteTarget; readonly backup: AdvisorRouteTarget }; readonly wait: AdvisorWaitPolicy; readonly history: AdvisorHistoryPolicy; } export interface AdvisorPolicyTargetV1 extends AdvisorRouteTarget { readonly timeout_ms: number; } export interface AdvisorPolicyV1 { readonly version: 1; readonly advisor: AdvisorPolicyTargetV1; }
export interface EvidenceFileV2 { readonly path: string; readonly excerpt: string; readonly digest: string; } export interface EvidenceArtifactRef { readonly id: string; readonly path: string; readonly digest: string; readonly description: string; } export interface EvidenceValidationResult { readonly suite: string; readonly command: string; readonly status: 'passed' | 'failed' | 'skipped'; readonly passed: number; readonly failed: number; readonly details: string | null; }
export interface CheckpointV2 {
  readonly protocol: typeof CHECKPOINT_PROTOCOL_V2; readonly version: typeof CHECKPOINT_VERSION_V2; readonly task_run_id: string; readonly checkpoint_id: string; readonly phase_id: string; readonly task_revision: number; readonly evidence_revision: number; readonly checkpoint: string; readonly kind: DecisionKind; readonly question: string;
  readonly task: { readonly goal: string; readonly non_goals: readonly string[]; readonly authorized_paths: readonly string[]; readonly scope_rationale: string; readonly invariants: readonly string[]; readonly success_criteria: readonly string[]; };
  readonly proposal: { readonly next_action: string; readonly rationale: string; readonly intended_changed_paths: readonly string[]; };
  readonly evidence: { readonly summary: string; readonly files: readonly EvidenceFileV2[]; readonly validation_results: readonly EvidenceValidationResult[]; readonly artifacts: readonly EvidenceArtifactRef[]; };
  readonly prior: { readonly prior_consultation_id: string | null; readonly prior_counsel: string | null; readonly prior_disposition: string | null; readonly observed_outcome: string | null; };
}
export interface AdvisorResultBodyV2 { readonly recommendation: string; readonly rationale: string; readonly must_fix: readonly string[]; readonly cautions: readonly string[]; readonly assumptions: readonly string[]; readonly success_checks: readonly string[]; readonly unresolved_questions: readonly string[]; } export interface AdvisorResultV2 extends AdvisorResultBodyV2 { readonly protocol: typeof RESULT_PROTOCOL_V2; readonly version: typeof RESULT_VERSION_V2; readonly checkpoint: string; readonly status: 'ADVICE_READY'; }
export interface ControllerReceiptV2 { readonly backend: AdvisorBackend | null; readonly model: string | null; readonly effort: string | null; readonly controller_version: typeof CONTROLLER_VERSION_V2; readonly adapter_version: string | null; readonly build_identity: string | null; readonly elapsed_ms: number; } export interface SanitizedErrorRecord { readonly code: string; readonly category: string; readonly action: string; readonly message: string; } export interface AttemptOutcome { readonly attempt_id: string; readonly slot: AttemptSlot; readonly route: AdvisorRouteTarget; readonly phase: AttemptPhase; readonly model_started: boolean; readonly elapsed_ms: number; readonly terminal_classification: TerminalClassification; readonly retry_delay_ms: number | null; readonly cleanup_outcome: CleanupOutcome; }
export interface ControllerEnvelopeV2Success { readonly protocol: typeof CONTROLLER_PROTOCOL_V2; readonly version: typeof CONTROLLER_VERSION_V2; readonly correlation_id: string; readonly task_run_id: string; readonly checkpoint_id: string; readonly task_revision: number; readonly evidence_revision: number; readonly checkpoint_digest: string; readonly status: 'ADVICE_READY'; readonly receipt: ControllerReceiptV2; readonly attempts: readonly AttemptOutcome[]; readonly result: AdvisorResultV2; readonly audit_status: AuditStatus; }
export interface ControllerEnvelopeV2Failure { readonly protocol: typeof CONTROLLER_PROTOCOL_V2; readonly version: typeof CONTROLLER_VERSION_V2; readonly correlation_id: string; readonly task_run_id: string; readonly checkpoint_id: string; readonly task_revision: number; readonly evidence_revision: number; readonly checkpoint_digest: string; readonly status: 'FAILED'; readonly receipt: ControllerReceiptV2; readonly attempts: readonly AttemptOutcome[]; readonly error: SanitizedErrorRecord; readonly audit_status: AuditStatus; }
export type ControllerEnvelopeV2 = ControllerEnvelopeV2Success | ControllerEnvelopeV2Failure;
export interface HistoryExecutionV1Base { readonly schema_version: typeof HISTORY_VERSION_V1; readonly consultation_id: string; readonly task_run_id: string; readonly project_id: string; readonly checkpoint_digest: string; readonly checkpoint: CheckpointV2; readonly route: AdvisorRouteTarget; readonly receipt: ControllerReceiptV2 | null; readonly prompt_identity: string; readonly build_identity: string; readonly attempts: readonly AttemptOutcome[]; readonly started_at: number; }
export interface HistoryExecutionV1Started extends HistoryExecutionV1Base { readonly status: 'started'; readonly receipt: null; readonly result: null; readonly error: null; readonly completed_at: null; } export interface HistoryExecutionV1Success extends HistoryExecutionV1Base { readonly status: 'ADVICE_READY'; readonly receipt: ControllerReceiptV2; readonly result: AdvisorResultV2; readonly error: null; readonly completed_at: number; } export interface HistoryExecutionV1Failure extends HistoryExecutionV1Base { readonly status: 'FAILED'; readonly receipt: ControllerReceiptV2; readonly result: null; readonly error: SanitizedErrorRecord; readonly completed_at: number; }
export type HistoryExecutionV1 = HistoryExecutionV1Started | HistoryExecutionV1Success | HistoryExecutionV1Failure;
export interface HistoryOutcomeV1 { readonly schema_version: typeof HISTORY_VERSION_V1; readonly consultation_id: string; readonly task_run_id: string; readonly project_id: string; readonly disposition: { readonly action: 'accept' | 'reject-with-evidence' | 'need-evidence' | 'reconcile'; readonly rationale: string; }; readonly evidence_revision: number; readonly actual_changed_paths: readonly string[]; readonly validation: EvidenceValidationResult; readonly outcome: OutcomeResult; readonly correction_number: number; readonly recorded_at: number; }

export type AdvisorContractIssueCode = 'CONTRACT_TYPE_INVALID' | 'CONTRACT_KEYS_INVALID' | 'CONTRACT_VALUE_INVALID' | 'CONTRACT_SIZE_EXCEEDED' | 'CONTRACT_VERSION_UNSUPPORTED' | 'CONTRACT_IDENTITY_MISMATCH' | 'CONTRACT_DIGEST_MISMATCH' | 'CONTRACT_STATUS_INVALID' | 'CONTRACT_DUPLICATE_IDENTITY';
export interface AdvisorContractIssue { readonly code: AdvisorContractIssueCode; readonly path: string; }
export class AdvisorContractError extends Error {
  readonly issue: AdvisorContractIssue;
  constructor(issue: AdvisorContractIssue) { super(`Advisor contract violation: ${issue.code} at ${issue.path || '/'}`); this.name = 'AdvisorContractError'; this.issue = Object.freeze({ code: issue.code, path: issue.path }); Object.freeze(this); }
}
function fail(c: AdvisorContractIssueCode, p = ''): never { throw new AdvisorContractError({ code: c, path: p }); }
const enc = new TextEncoder();
export const utf8Bytes = (s: string): number => enc.encode(s).byteLength;
export function deepFreeze<T>(v: T, s = new Set<unknown>()): T { if (!v || typeof v !== 'object' || s.has(v)) return v; s.add(v); Object.values(v).forEach(c => deepFreeze(c, s)); return Object.freeze(v); }
function asObj(v: unknown, exp: readonly string[], p: string): Record<string, unknown> { if (!isPlainObject(v)) fail('CONTRACT_TYPE_INVALID', p); const k = Object.keys(v); if (k.length !== exp.length || k.some(x => !exp.includes(x))) fail('CONTRACT_KEYS_INVALID', p); return v; }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, SHA256_RE = /^[0-9a-f]{64}$/, CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const STACK_RE = /(?:\bat\s+(?:async\s+|new\s+)?[\w$.<>]+\s+\([^)]*:\d+(?::\d+)?\)|\bat\s+\S+:\d+:\d+|\bnode:internal\/|\bFile\s+["'][^"']+["'],\s+line\s+\d+|\b(?:goroutine\s+\d+\s+\[|stack\s+backtrace:)|(?:^|\n)\s*[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+(?:\([^)]*\))?\n\s+.*\.go:\d+|\b\d+:\s+0x[0-9a-fA-F]+\s+-\s+)/;
const SENS_RE = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/i;
const META_PATHS: Record<string, true> = { '.git': true, '.gitignore': true, '.gitmodules': true, '.gitattributes': true, '.github': true, '.gitlab': true, '.hg': true, '.svn': true };
function str(v: unknown, max: number, multi: boolean, p: string): string { if (typeof v !== 'string') fail('CONTRACT_TYPE_INVALID', p); if (utf8Bytes(v) > max) fail('CONTRACT_SIZE_EXCEEDED', p); if (!v || v.trim() !== v || CTRL_RE.test(v) || (!multi && /[\r\n\t]/.test(v)) || SENS_RE.test(v) || STACK_RE.test(v)) fail('CONTRACT_VALUE_INVALID', p); return v; }
function uuid(v: unknown, p: string): string { if (typeof v !== 'string') fail('CONTRACT_TYPE_INVALID', p); if (!UUID_RE.test(v)) fail('CONTRACT_VALUE_INVALID', p); return v; }
function digest(v: unknown, p: string): string { if (typeof v !== 'string') fail('CONTRACT_TYPE_INVALID', p); if (!SHA256_RE.test(v)) fail('CONTRACT_VALUE_INVALID', p); return v; }
function num(v: unknown, min: number, max: number, p: string): number { if (typeof v !== 'number' || !Number.isSafeInteger(v)) fail('CONTRACT_TYPE_INVALID', p); if (v < min || v > max) fail('CONTRACT_VALUE_INVALID', p); return v; }
function safePath(v: unknown, p: string): string { if (typeof v !== 'string') fail('CONTRACT_TYPE_INVALID', p); if (utf8Bytes(v) > 512) fail('CONTRACT_SIZE_EXCEEDED', p); if (!v || v.includes('\\') || v.startsWith('/') || /^[A-Za-z]:/.test(v) || CTRL_RE.test(v) || v.split('/').some((s: string) => !s || s === '.' || s === '..' || META_PATHS[`.${s.replace(/^\./, '')}`]) || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/i.test(v)) fail('CONTRACT_VALUE_INVALID', p); return v; }
function checkBytes(v: unknown, max: number, p = ''): void { if (utf8Bytes(JSON.stringify(v)) > max) fail('CONTRACT_SIZE_EXCEEDED', p); }
function arr<T>(v: unknown, max: number, p: string): T[] { if (!Array.isArray(v)) fail('CONTRACT_TYPE_INVALID', p); if (v.length > max) fail('CONTRACT_SIZE_EXCEEDED', p); return v as T[]; }

export function validateRouteTarget(t: unknown, p = ''): AdvisorRouteTarget { const o = asObj(t, ['backend', 'model', 'effort'], p); if (typeof o.backend !== 'string' || !CANDIDATE_BACKENDS.includes(o.backend as AdvisorBackend)) fail(typeof o.backend !== 'string' ? 'CONTRACT_TYPE_INVALID' : 'CONTRACT_VALUE_INVALID', `${p}/backend`); return Object.freeze({ backend: o.backend as AdvisorBackend, model: str(o.model, 256, false, `${p}/model`), effort: str(o.effort, 64, false, `${p}/effort`) }); }
export function validateWaitPolicy(w: unknown, p = ''): AdvisorWaitPolicy { const o = asObj(w, ['mode', 'warn_after_ms', 'warn_every_ms'], p); if (o.mode !== 'until_terminal') fail('CONTRACT_VALUE_INVALID', `${p}/mode`); return Object.freeze({ mode: 'until_terminal', warn_after_ms: num(o.warn_after_ms, 1000, 3600000, `${p}/warn_after_ms`), warn_every_ms: num(o.warn_every_ms, 1000, 3600000, `${p}/warn_every_ms`) }); }
export function validateHistoryPolicy(h: unknown, p = ''): AdvisorHistoryPolicy { const o = asObj(h, ['retention_days', 'max_bytes'], p); return Object.freeze({ retention_days: num(o.retention_days, 1, 365, `${p}/retention_days`), max_bytes: num(o.max_bytes, 1048576, 1073741824, `${p}/max_bytes`) }); }
export function validateLegacyPolicy(v: unknown, p = ''): AdvisorPolicyV1 { const o = asObj(v, ['version', 'advisor'], p); if (o.version !== 1) fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`); const a = asObj(o.advisor, ['backend', 'model', 'effort', 'timeout_ms'], `${p}/advisor`); if (typeof a.backend !== 'string' || !CANDIDATE_BACKENDS.includes(a.backend as AdvisorBackend)) fail(typeof a.backend !== 'string' ? 'CONTRACT_TYPE_INVALID' : 'CONTRACT_VALUE_INVALID', `${p}/advisor/backend`); return deepFreeze({ version: 1 as const, advisor: { backend: a.backend as AdvisorBackend, model: str(a.model, 256, false, `${p}/advisor/model`), effort: str(a.effort, 64, false, `${p}/advisor/effort`), timeout_ms: num(a.timeout_ms, 60000, 900000, `${p}/advisor/timeout_ms`) } }); }
export function validatePolicyV2(v: unknown, p = ''): AdvisorPolicyV2 {
  const o = asObj(v, ['version', 'advisor', 'wait', 'history'], p); if (o.version !== 2) fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`);
  const adv = asObj(o.advisor, ['primary', 'backup'], `${p}/advisor`), primary = validateRouteTarget(adv.primary, `${p}/advisor/primary`), backup = validateRouteTarget(adv.backup, `${p}/advisor/backup`);
  if (primary.backend === backup.backend && primary.model === backup.model && primary.effort === backup.effort) fail('CONTRACT_VALUE_INVALID', `${p}/advisor/backup`);
  const out = { version: 2 as const, advisor: { primary, backup }, wait: validateWaitPolicy(o.wait, `${p}/wait`), history: validateHistoryPolicy(o.history, `${p}/history`) };
  checkBytes(out, MAX_POLICY_BYTES, p); return deepFreeze(out);
}
export function inspectPolicy(v: unknown, p = ''): { policy: AdvisorPolicyV2 | AdvisorPolicyV1; legacy: boolean; migrationRequired: boolean } {
  if (!isPlainObject(v)) fail('CONTRACT_TYPE_INVALID', p);
  return v.version === 2 ? { policy: validatePolicyV2(v, p), legacy: false, migrationRequired: false } : v.version === 1 ? { policy: validateLegacyPolicy(v, p), legacy: true, migrationRequired: true } : fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`);
}

export function validateValidationResult(v: unknown, p = ''): EvidenceValidationResult { const o = asObj(v, ['suite', 'command', 'status', 'passed', 'failed', 'details'], p); if (!['passed', 'failed', 'skipped'].includes(o.status as string)) fail('CONTRACT_VALUE_INVALID', `${p}/status`); return Object.freeze({ suite: str(o.suite, 128, false, `${p}/suite`), command: str(o.command, 512, false, `${p}/command`), status: o.status as 'passed' | 'failed' | 'skipped', passed: num(o.passed, 0, Number.MAX_SAFE_INTEGER, `${p}/passed`), failed: num(o.failed, 0, Number.MAX_SAFE_INTEGER, `${p}/failed`), details: o.details === null ? null : str(o.details, 4096, true, `${p}/details`) }); }
export function validateCheckpointV2(cp: unknown, p = ''): CheckpointV2 {
  const o = asObj(cp, ['protocol', 'version', 'task_run_id', 'checkpoint_id', 'phase_id', 'task_revision', 'evidence_revision', 'checkpoint', 'kind', 'question', 'task', 'proposal', 'evidence', 'prior'], p);
  if (o.protocol !== CHECKPOINT_PROTOCOL_V2 || o.version !== CHECKPOINT_VERSION_V2) fail('CONTRACT_VERSION_UNSUPPORTED', o.protocol !== CHECKPOINT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
  if (!DECISION_KINDS.includes(o.kind as DecisionKind)) fail('CONTRACT_VALUE_INVALID', `${p}/kind`);
  uuid(o.task_run_id, `${p}/task_run_id`); str(o.checkpoint_id, 128, false, `${p}/checkpoint_id`); str(o.phase_id, 64, false, `${p}/phase_id`); num(o.task_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/task_revision`); num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`); str(o.checkpoint, 128, false, `${p}/checkpoint`); str(o.question, MAX_QUESTION_BYTES, true, `${p}/question`);
  const t = asObj(o.task, ['goal', 'non_goals', 'authorized_paths', 'scope_rationale', 'invariants', 'success_criteria'], `${p}/task`);
  str(t.goal, MAX_TASK_BYTES, true, `${p}/task/goal`); str(t.scope_rationale, MAX_TASK_BYTES, true, `${p}/task/scope_rationale`);
  (['non_goals', 'invariants', 'success_criteria'] as const).forEach(k => arr<string>(t[k], 64, `${p}/task/${k}`).forEach((x, i) => str(x, 1024, false, `${p}/task/${k}/${i}`)));
  arr<string>(t.authorized_paths, 64, `${p}/task/authorized_paths`).forEach((x, i) => safePath(x, `${p}/task/authorized_paths/${i}`));
  const pr = asObj(o.proposal, ['next_action', 'rationale', 'intended_changed_paths'], `${p}/proposal`);
  str(pr.next_action, 4096, true, `${p}/proposal/next_action`); str(pr.rationale, 4096, true, `${p}/proposal/rationale`);
  arr<string>(pr.intended_changed_paths, MAX_CHANGED_PATHS, `${p}/proposal/intended_changed_paths`).forEach((x, i) => safePath(x, `${p}/proposal/intended_changed_paths/${i}`));
  const ev = asObj(o.evidence, ['summary', 'files', 'validation_results', 'artifacts'], `${p}/evidence`);
  str(ev.summary, MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/summary`);
  const fPaths: Record<string, true> = {};
  arr<Record<string, unknown>>(ev.files, MAX_EVIDENCE_FILES, `${p}/evidence/files`).forEach((f, i) => {
    const fo = asObj(f, ['path', 'excerpt', 'digest'], `${p}/evidence/files/${i}`), fp = safePath(fo.path, `${p}/evidence/files/${i}/path`);
    if (fPaths[fp]) fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/evidence/files/${i}/path`);
    fPaths[fp] = true; str(fo.excerpt, MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/files/${i}/excerpt`); digest(fo.digest, `${p}/evidence/files/${i}/digest`);
  });
  arr<unknown>(ev.validation_results, 32, `${p}/evidence/validation_results`).forEach((v, i) => validateValidationResult(v, `${p}/evidence/validation_results/${i}`));
  arr<Record<string, unknown>>(ev.artifacts, 32, `${p}/evidence/artifacts`).forEach((a, i) => {
    const ao = asObj(a, ['id', 'path', 'digest', 'description'], `${p}/evidence/artifacts/${i}`);
    uuid(ao.id, `${p}/evidence/artifacts/${i}/id`); safePath(ao.path, `${p}/evidence/artifacts/${i}/path`); digest(ao.digest, `${p}/evidence/artifacts/${i}/digest`); str(ao.description, 1024, false, `${p}/evidence/artifacts/${i}/description`);
  });
  const pri = asObj(o.prior, ['prior_consultation_id', 'prior_counsel', 'prior_disposition', 'observed_outcome'], `${p}/prior`);
  if (pri.prior_consultation_id !== null) uuid(pri.prior_consultation_id, `${p}/prior/prior_consultation_id`);
  (['prior_counsel', 'prior_disposition', 'observed_outcome'] as const).forEach(k => { if (pri[k] !== null) str(pri[k], 16384, true, `${p}/prior/${k}`); });
  checkBytes(cp, MAX_ENVELOPE_BYTES, p); return deepFreeze(cp as unknown as CheckpointV2);
}
function valResultFields(o: Record<string, unknown>, p: string): void { (['recommendation', 'rationale'] as const).forEach(k => str(o[k], MAX_RESULT_BODY_BYTES, true, `${p}/${k}`)); (['must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'] as const).forEach(k => arr<string>(o[k], 32, `${p}/${k}`).forEach((x, i) => str(x, 2048, true, `${p}/${k}/${i}`))); }
export function validateResultBodyV2(b: unknown, p = ''): AdvisorResultBodyV2 {
  const o = asObj(b, ['recommendation', 'rationale', 'must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'], p);
  valResultFields(o, p); checkBytes(b, MAX_RESULT_BODY_BYTES, p); return deepFreeze(b as unknown as AdvisorResultBodyV2);
}
export function validateResultV2(r: unknown, p = ''): AdvisorResultV2 {
  const o = asObj(r, ['protocol', 'version', 'checkpoint', 'status', 'recommendation', 'rationale', 'must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'], p);
  if (o.protocol !== RESULT_PROTOCOL_V2 || o.version !== RESULT_VERSION_V2) fail('CONTRACT_VERSION_UNSUPPORTED', o.protocol !== RESULT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
  if (o.status !== 'ADVICE_READY') fail('CONTRACT_STATUS_INVALID', `${p}/status`);
  str(o.checkpoint, 128, false, `${p}/checkpoint`); valResultFields(o, p); checkBytes(r, MAX_RESULT_BODY_BYTES + 512, p); return deepFreeze(r as unknown as AdvisorResultV2);
}
export function validateReceiptV2(r: unknown, p = ''): ControllerReceiptV2 {
  const o = asObj(r, ['backend', 'model', 'effort', 'controller_version', 'adapter_version', 'build_identity', 'elapsed_ms'], p);
  if (o.controller_version !== CONTROLLER_VERSION_V2) fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/controller_version`);
  if (o.backend !== null && !CANDIDATE_BACKENDS.includes(o.backend as AdvisorBackend)) fail('CONTRACT_VALUE_INVALID', `${p}/backend`);
  (['model', 'effort', 'adapter_version', 'build_identity'] as const).forEach(k => { if (o[k] !== null) str(o[k], 256, false, `${p}/${k}`); });
  num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`); return deepFreeze(r as unknown as ControllerReceiptV2);
}
function validateSanitizedError(e: unknown, p = ''): SanitizedErrorRecord {
  const o = asObj(e, ['code', 'category', 'action', 'message'], p);
  (['code', 'category', 'action'] as const).forEach(k => str(o[k], 64, false, `${p}/${k}`));
  str(o.message, 1024, true, `${p}/message`); return deepFreeze(e as unknown as SanitizedErrorRecord);
}
export function validateAttemptOutcome(a: unknown, p = ''): AttemptOutcome {
  const o = asObj(a, ['attempt_id', 'slot', 'route', 'phase', 'model_started', 'elapsed_ms', 'terminal_classification', 'retry_delay_ms', 'cleanup_outcome'], p);
  uuid(o.attempt_id, `${p}/attempt_id`); if (!ATTEMPT_SLOTS.includes(o.slot as AttemptSlot)) fail('CONTRACT_VALUE_INVALID', `${p}/slot`);
  validateRouteTarget(o.route, `${p}/route`); if (!ATTEMPT_PHASES.includes(o.phase as AttemptPhase)) fail('CONTRACT_VALUE_INVALID', `${p}/phase`);
  if (typeof o.model_started !== 'boolean') fail('CONTRACT_TYPE_INVALID', `${p}/model_started`); num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`);
  if (!TERMINAL_CLASSIFICATIONS.includes(o.terminal_classification as TerminalClassification)) fail('CONTRACT_VALUE_INVALID', `${p}/terminal_classification`);
  if (o.retry_delay_ms !== null) num(o.retry_delay_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/retry_delay_ms`);
  if (!CLEANUP_OUTCOMES.includes(o.cleanup_outcome as CleanupOutcome)) fail('CONTRACT_VALUE_INVALID', `${p}/cleanup_outcome`);
  return deepFreeze(a as unknown as AttemptOutcome);
}
function valAttempts(rawList: unknown, p: string): AttemptOutcome[] {
  const atts = arr<unknown>(rawList, MAX_TOTAL_ATTEMPT_SUMMARIES, p), aIds: Record<string, true> = {};
  let starts = 0;
  return atts.map((raw, i) => {
    const a = validateAttemptOutcome(raw, `${p}/${i}`);
    if (aIds[a.attempt_id]) fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/${i}/attempt_id`);
    aIds[a.attempt_id] = true;
    if (a.model_started && (++starts > MAX_MODEL_ATTEMPTS)) fail('CONTRACT_SIZE_EXCEEDED', p);
    return a;
  });
}
export function validateEnvelopeV2(env: unknown, p = ''): ControllerEnvelopeV2 {
  if (!isPlainObject(env)) fail('CONTRACT_TYPE_INVALID', p);
  if (env.protocol !== CONTROLLER_PROTOCOL_V2 || env.version !== CONTROLLER_VERSION_V2) fail('CONTRACT_VERSION_UNSUPPORTED', env.protocol !== CONTROLLER_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
  if (env.status === 'ADVICE_READY') {
    asObj(env, ['protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id', 'task_revision', 'evidence_revision', 'checkpoint_digest', 'status', 'receipt', 'attempts', 'result', 'audit_status'], p);
    validateResultV2(env.result, `${p}/result`);
  } else if (env.status === 'FAILED') {
    asObj(env, ['protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id', 'task_revision', 'evidence_revision', 'checkpoint_digest', 'status', 'receipt', 'attempts', 'error', 'audit_status'], p);
    validateSanitizedError(env.error, `${p}/error`);
  } else fail('CONTRACT_STATUS_INVALID', `${p}/status`);
  uuid(env.correlation_id, `${p}/correlation_id`); uuid(env.task_run_id, `${p}/task_run_id`); str(env.checkpoint_id, 128, false, `${p}/checkpoint_id`); num(env.task_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/task_revision`); num(env.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`); digest(env.checkpoint_digest, `${p}/checkpoint_digest`); validateReceiptV2(env.receipt, `${p}/receipt`);
  if (!AUDIT_STATUSES.includes(env.audit_status as AuditStatus)) fail('CONTRACT_VALUE_INVALID', `${p}/audit_status`);
  valAttempts(env.attempts, `${p}/attempts`); checkBytes(env, MAX_ENVELOPE_BYTES, p);
  return deepFreeze(env as unknown as ControllerEnvelopeV2);
}
export function validateHistoryExecutionV1(ex: unknown, digestFn?: (cp: CheckpointV2) => string, p = ''): HistoryExecutionV1 {
  const o = asObj(ex, ['schema_version', 'consultation_id', 'task_run_id', 'project_id', 'checkpoint_digest', 'checkpoint', 'route', 'receipt', 'prompt_identity', 'build_identity', 'attempts', 'status', 'result', 'error', 'started_at', 'completed_at'], p);
  if (o.schema_version !== HISTORY_VERSION_V1) fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/schema_version`);
  uuid(o.consultation_id, `${p}/consultation_id`); uuid(o.task_run_id, `${p}/task_run_id`); digest(o.project_id, `${p}/project_id`); digest(o.checkpoint_digest, `${p}/checkpoint_digest`);
  const cp = validateCheckpointV2(o.checkpoint, `${p}/checkpoint`); if (digestFn && digestFn(cp) !== o.checkpoint_digest) fail('CONTRACT_DIGEST_MISMATCH', `${p}/checkpoint_digest`);
  if (cp.task_run_id !== o.task_run_id) fail('CONTRACT_IDENTITY_MISMATCH', `${p}/checkpoint/task_run_id`);
  const route = validateRouteTarget(o.route, `${p}/route`), buildId = str(o.build_identity, 128, false, `${p}/build_identity`);
  str(o.prompt_identity, 128, false, `${p}/prompt_identity`); valAttempts(o.attempts, `${p}/attempts`);
  if (!EXECUTION_STATUSES.includes(o.status as ExecutionStatus)) fail('CONTRACT_STATUS_INVALID', `${p}/status`);
  num(o.started_at, 1, Number.MAX_SAFE_INTEGER, `${p}/started_at`);
  if (o.status === 'started') {
    if (o.receipt !== null || o.result !== null || o.error !== null || o.completed_at !== null) fail('CONTRACT_STATUS_INVALID', p);
  } else {
    const rc = validateReceiptV2(o.receipt, `${p}/receipt`);
    if (rc.build_identity !== buildId) fail('CONTRACT_IDENTITY_MISMATCH', `${p}/receipt/build_identity`);
    if (rc.backend !== route.backend || rc.model !== route.model || rc.effort !== route.effort) fail('CONTRACT_IDENTITY_MISMATCH', `${p}/receipt`);
    num(o.completed_at, o.started_at as number, Number.MAX_SAFE_INTEGER, `${p}/completed_at`);
    if (o.status === 'ADVICE_READY') {
      if (o.result === null || o.error !== null) fail('CONTRACT_STATUS_INVALID', p);
      if (validateResultV2(o.result, `${p}/result`).checkpoint !== cp.checkpoint) fail('CONTRACT_IDENTITY_MISMATCH', `${p}/result/checkpoint`);
    } else if (o.status === 'FAILED') {
      if (o.error === null || o.result !== null) fail('CONTRACT_STATUS_INVALID', p);
      validateSanitizedError(o.error, `${p}/error`);
    }
  }
  checkBytes(ex, MAX_EXECUTION_HISTORY_BYTES, p); return deepFreeze(ex as unknown as HistoryExecutionV1);
}
export function validateHistoryOutcomeV1(out: unknown, p = ''): HistoryOutcomeV1 {
  const o = asObj(out, ['schema_version', 'consultation_id', 'task_run_id', 'project_id', 'disposition', 'evidence_revision', 'actual_changed_paths', 'validation', 'outcome', 'correction_number', 'recorded_at'], p);
  if (o.schema_version !== HISTORY_VERSION_V1) fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/schema_version`);
  uuid(o.consultation_id, `${p}/consultation_id`); uuid(o.task_run_id, `${p}/task_run_id`); digest(o.project_id, `${p}/project_id`);
  const disp = asObj(o.disposition, ['action', 'rationale'], `${p}/disposition`); if (!['accept', 'reject-with-evidence', 'need-evidence', 'reconcile'].includes(disp.action as string)) fail('CONTRACT_VALUE_INVALID', `${p}/disposition/action`);
  str(disp.rationale, 4096, true, `${p}/disposition/rationale`); num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
  arr<string>(o.actual_changed_paths, 32, `${p}/actual_changed_paths`).forEach((x, i) => safePath(x, `${p}/actual_changed_paths/${i}`));
  validateValidationResult(o.validation, `${p}/validation`); if (!OUTCOME_RESULTS.includes(o.outcome as OutcomeResult)) fail('CONTRACT_VALUE_INVALID', `${p}/outcome`);
  num(o.correction_number, 1, MAX_CORRECTION_CYCLES, `${p}/correction_number`); num(o.recorded_at, 1, Number.MAX_SAFE_INTEGER, `${p}/recorded_at`);
  checkBytes(out, MAX_OUTCOME_HISTORY_BYTES, p); return deepFreeze(out as unknown as HistoryOutcomeV1);
}
