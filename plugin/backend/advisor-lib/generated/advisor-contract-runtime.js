"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.utf8Bytes = exports.AdvisorContractError = exports.EXECUTION_STATUSES = exports.OUTCOME_RESULTS = exports.AUDIT_STATUSES = exports.CLEANUP_OUTCOMES = exports.TERMINAL_CLASSIFICATIONS = exports.ATTEMPT_PHASES = exports.ATTEMPT_SLOTS = exports.DECISION_KINDS = exports.MAX_CORRECTION_CYCLES = exports.MAX_TOTAL_ATTEMPT_SUMMARIES = exports.MAX_MODEL_ATTEMPTS = exports.MAX_CHANGED_PATHS = exports.MAX_EVIDENCE_FILES = exports.MAX_OUTCOME_HISTORY_BYTES = exports.MAX_EXECUTION_HISTORY_BYTES = exports.MAX_STATE_BYTES = exports.MAX_RESULT_BODY_BYTES = exports.MAX_EVIDENCE_TEXT_BYTES = exports.MAX_TASK_BYTES = exports.MAX_QUESTION_BYTES = exports.MAX_ENVELOPE_BYTES = exports.MAX_POLICY_BYTES = exports.HISTORY_VERSION_V1 = exports.HISTORY_PROTOCOL_V1 = exports.CONTROLLER_VERSION_V2 = exports.CONTROLLER_PROTOCOL_V2 = exports.RESULT_VERSION_V2 = exports.RESULT_PROTOCOL_V2 = exports.CHECKPOINT_VERSION_V2 = exports.CHECKPOINT_PROTOCOL_V2 = exports.ADVISOR_BACKENDS = exports.CANDIDATE_BACKENDS = void 0;
exports.deepFreeze = deepFreeze;
exports.validateRouteTarget = validateRouteTarget;
exports.validateWaitPolicy = validateWaitPolicy;
exports.validateHistoryPolicy = validateHistoryPolicy;
exports.validateLegacyPolicy = validateLegacyPolicy;
exports.validatePolicyV2 = validatePolicyV2;
exports.inspectPolicy = inspectPolicy;
exports.validateValidationResult = validateValidationResult;
exports.validateArtifactRef = validateArtifactRef;
exports.validateCheckpointV2 = validateCheckpointV2;
exports.validateResultBodyV2 = validateResultBodyV2;
exports.validateResultV2 = validateResultV2;
exports.validateReceiptV2 = validateReceiptV2;
exports.validateSanitizedError = validateSanitizedError;
exports.validateAttemptOutcome = validateAttemptOutcome;
exports.validateEnvelopeV2 = validateEnvelopeV2;
exports.validateHistoryExecutionV1 = validateHistoryExecutionV1;
exports.validateHistoryOutcomeV1 = validateHistoryOutcomeV1;
const json_js_1 = require("./json.js");
exports.CANDIDATE_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp']), exports.ADVISOR_BACKENDS = exports.CANDIDATE_BACKENDS;
exports.CHECKPOINT_PROTOCOL_V2 = 'evcrate-advisor-checkpoint', exports.CHECKPOINT_VERSION_V2 = 2, exports.RESULT_PROTOCOL_V2 = 'evcrate-advisor-result', exports.RESULT_VERSION_V2 = 2, exports.CONTROLLER_PROTOCOL_V2 = 'evcrate-advisor-controller', exports.CONTROLLER_VERSION_V2 = 2, exports.HISTORY_PROTOCOL_V1 = 'evcrate-advisor-history', exports.HISTORY_VERSION_V1 = 1;
exports.MAX_POLICY_BYTES = 16384, exports.MAX_ENVELOPE_BYTES = 32768, exports.MAX_QUESTION_BYTES = 4096, exports.MAX_TASK_BYTES = 8192, exports.MAX_EVIDENCE_TEXT_BYTES = 16384, exports.MAX_RESULT_BODY_BYTES = 16384, exports.MAX_STATE_BYTES = 65536, exports.MAX_EXECUTION_HISTORY_BYTES = 131072, exports.MAX_OUTCOME_HISTORY_BYTES = 65536;
exports.MAX_EVIDENCE_FILES = 4, exports.MAX_CHANGED_PATHS = 16, exports.MAX_MODEL_ATTEMPTS = 5, exports.MAX_TOTAL_ATTEMPT_SUMMARIES = 8, exports.MAX_CORRECTION_CYCLES = 3;
exports.DECISION_KINDS = Object.freeze(['direction', 'review', 'stuck', 'decision', 'reconcile']), exports.ATTEMPT_SLOTS = Object.freeze(['primary', 'backup']), exports.ATTEMPT_PHASES = Object.freeze(['preflight', 'model']), exports.TERMINAL_CLASSIFICATIONS = Object.freeze(['success', 'transient', 'fatal', 'cancelled', 'skipped']), exports.CLEANUP_OUTCOMES = Object.freeze(['confirmed', 'unconfirmed', 'not_needed']), exports.AUDIT_STATUSES = Object.freeze(['recorded', 'degraded', 'disabled']), exports.OUTCOME_RESULTS = Object.freeze(['resolved', 'unresolved', 'regressed', 'unknown']), exports.EXECUTION_STATUSES = Object.freeze(['started', 'ADVICE_READY', 'FAILED']);
class AdvisorContractError extends Error {
    constructor(issue) { super(`Advisor contract violation: ${issue.code} at ${issue.path || '/'}`); this.name = 'AdvisorContractError'; this.issue = Object.freeze({ code: issue.code, path: issue.path }); Object.freeze(this); }
}
exports.AdvisorContractError = AdvisorContractError;
function fail(c, p = '') { throw new AdvisorContractError({ code: c, path: p }); }
const enc = new TextEncoder();
const utf8Bytes = (s) => enc.encode(s).byteLength;
exports.utf8Bytes = utf8Bytes;
function deepFreeze(v, s = new Set()) { if (!v || typeof v !== 'object' || s.has(v))
    return v; s.add(v); Object.values(v).forEach(c => deepFreeze(c, s)); return Object.freeze(v); }
function asObj(v, exp, p) { if (!(0, json_js_1.isPlainObject)(v))
    fail('CONTRACT_TYPE_INVALID', p); const k = Object.keys(v); if (k.length !== exp.length || k.some(x => !exp.includes(x)))
    fail('CONTRACT_KEYS_INVALID', p); return v; }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, SHA256_RE = /^[0-9a-f]{64}$/, CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const STACK_RE = /(?:\bat\s+(?:async\s+|new\s+)?[\w$.<>]+\s+\([^)]*:\d+(?::\d+)?\)|\bat\s+\S+:\d+:\d+|\bnode:internal\/|\bFile\s+["'][^"']+["'],\s+line\s+\d+|\b(?:goroutine\s+\d+\s+\[|stack\s+backtrace:)|(?:^|\n)\s*[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+(?:\([^)]*\))?\n\s+.*\.go:\d+|\b\d+:\s+0x[0-9a-fA-F]+\s+-\s+)/;
const SENS_RE = /(?:-----BEGIN[^\n]*PRIVATE KEY-----|["']?(?:api[_ -]?key|secret|password|token|credential)["']?\s*[:=]|["']?(?:raw\s+)?stderr["']?\s*[:=]|["']?stack\s+trace["']?\s*[:=]|\bBearer\s+\S+|\bBasic\s+[A-Za-z0-9+/]+={0,2}\b|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\b(?:sk|pk)_[A-Za-z0-9_-]{8,}\b|\b(?:sk-(?:proj|ant)-|gh[pous]_|github_pat_|npm_|xox[baprs]-|AIza)[A-Za-z0-9_./+=-]{8,}\b)/i;
const META_PATHS = { '.git': true, '.gitignore': true, '.gitmodules': true, '.gitattributes': true, '.github': true, '.gitlab': true, '.hg': true, '.svn': true };
function str(v, max, multi, p) { if (typeof v !== 'string')
    fail('CONTRACT_TYPE_INVALID', p); if ((0, exports.utf8Bytes)(v) > max)
    fail('CONTRACT_SIZE_EXCEEDED', p); if (!v || v.trim() !== v || CTRL_RE.test(v) || (!multi && /[\r\n\t]/.test(v)) || SENS_RE.test(v) || STACK_RE.test(v))
    fail('CONTRACT_VALUE_INVALID', p); return v; }
function uuid(v, p) { if (typeof v !== 'string')
    fail('CONTRACT_TYPE_INVALID', p); if (!UUID_RE.test(v))
    fail('CONTRACT_VALUE_INVALID', p); return v; }
function digest(v, p) { if (typeof v !== 'string')
    fail('CONTRACT_TYPE_INVALID', p); if (!SHA256_RE.test(v))
    fail('CONTRACT_VALUE_INVALID', p); return v; }
function num(v, min, max, p) { if (typeof v !== 'number' || !Number.isSafeInteger(v))
    fail('CONTRACT_TYPE_INVALID', p); if (v < min || v > max)
    fail('CONTRACT_VALUE_INVALID', p); return v; }
function safePath(v, p) { if (typeof v !== 'string')
    fail('CONTRACT_TYPE_INVALID', p); if ((0, exports.utf8Bytes)(v) > 512)
    fail('CONTRACT_SIZE_EXCEEDED', p); if (!v || v.includes('\\') || v.startsWith('/') || /^[A-Za-z]:/.test(v) || CTRL_RE.test(v) || v.split('/').some((s) => !s || s === '.' || s === '..' || META_PATHS[`.${s.replace(/^\./, '')}`]) || /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|password|token|private[-_]?key).*)/i.test(v))
    fail('CONTRACT_VALUE_INVALID', p); return v; }
function checkBytes(v, max, p = '') { if ((0, exports.utf8Bytes)(JSON.stringify(v)) > max)
    fail('CONTRACT_SIZE_EXCEEDED', p); }
function arr(v, max, p) { if (!Array.isArray(v))
    fail('CONTRACT_TYPE_INVALID', p); if (v.length > max)
    fail('CONTRACT_SIZE_EXCEEDED', p); return v; }
function validateRouteTarget(t, p = '') { const o = asObj(t, ['backend', 'model', 'effort'], p); if (typeof o.backend !== 'string' || !exports.CANDIDATE_BACKENDS.includes(o.backend))
    fail(typeof o.backend !== 'string' ? 'CONTRACT_TYPE_INVALID' : 'CONTRACT_VALUE_INVALID', `${p}/backend`); return Object.freeze({ backend: o.backend, model: str(o.model, 256, false, `${p}/model`), effort: str(o.effort, 64, false, `${p}/effort`) }); }
function validateWaitPolicy(w, p = '') { const o = asObj(w, ['mode', 'warn_after_ms', 'warn_every_ms'], p); if (o.mode !== 'until_terminal')
    fail('CONTRACT_VALUE_INVALID', `${p}/mode`); return Object.freeze({ mode: 'until_terminal', warn_after_ms: num(o.warn_after_ms, 1000, 3600000, `${p}/warn_after_ms`), warn_every_ms: num(o.warn_every_ms, 1000, 3600000, `${p}/warn_every_ms`) }); }
function validateHistoryPolicy(h, p = '') { const o = asObj(h, ['retention_days', 'max_bytes'], p); return Object.freeze({ retention_days: num(o.retention_days, 1, 365, `${p}/retention_days`), max_bytes: num(o.max_bytes, 1048576, 1073741824, `${p}/max_bytes`) }); }
function validateLegacyPolicy(v, p = '') { const o = asObj(v, ['version', 'advisor'], p); if (o.version !== 1)
    fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`); const a = asObj(o.advisor, ['backend', 'model', 'effort', 'timeout_ms'], `${p}/advisor`); if (typeof a.backend !== 'string' || !exports.CANDIDATE_BACKENDS.includes(a.backend))
    fail(typeof a.backend !== 'string' ? 'CONTRACT_TYPE_INVALID' : 'CONTRACT_VALUE_INVALID', `${p}/advisor/backend`); return deepFreeze({ version: 1, advisor: { backend: a.backend, model: str(a.model, 256, false, `${p}/advisor/model`), effort: str(a.effort, 64, false, `${p}/advisor/effort`), timeout_ms: num(a.timeout_ms, 60000, 900000, `${p}/advisor/timeout_ms`) } }); }
function validatePolicyV2(v, p = '') {
    const o = asObj(v, ['version', 'advisor', 'wait', 'history'], p);
    if (o.version !== 2)
        fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`);
    const adv = asObj(o.advisor, ['primary', 'backup'], `${p}/advisor`), primary = validateRouteTarget(adv.primary, `${p}/advisor/primary`), backup = validateRouteTarget(adv.backup, `${p}/advisor/backup`);
    if (primary.backend === backup.backend && primary.model === backup.model && primary.effort === backup.effort)
        fail('CONTRACT_VALUE_INVALID', `${p}/advisor/backup`);
    const out = { version: 2, advisor: { primary, backup }, wait: validateWaitPolicy(o.wait, `${p}/wait`), history: validateHistoryPolicy(o.history, `${p}/history`) };
    checkBytes(out, exports.MAX_POLICY_BYTES, p);
    return deepFreeze(out);
}
function inspectPolicy(v, p = '') {
    if (!(0, json_js_1.isPlainObject)(v))
        fail('CONTRACT_TYPE_INVALID', p);
    return v.version === 2 ? { policy: validatePolicyV2(v, p), legacy: false, migrationRequired: false } : v.version === 1 ? { policy: validateLegacyPolicy(v, p), legacy: true, migrationRequired: true } : fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`);
}
function validateValidationResult(v, p = '') { const o = asObj(v, ['suite', 'command', 'status', 'passed', 'failed', 'details'], p); if (!['passed', 'failed', 'skipped'].includes(o.status))
    fail('CONTRACT_VALUE_INVALID', `${p}/status`); return Object.freeze({ suite: str(o.suite, 128, false, `${p}/suite`), command: str(o.command, 512, false, `${p}/command`), status: o.status, passed: num(o.passed, 0, Number.MAX_SAFE_INTEGER, `${p}/passed`), failed: num(o.failed, 0, Number.MAX_SAFE_INTEGER, `${p}/failed`), details: o.details === null ? null : str(o.details, 4096, true, `${p}/details`) }); }
function validateArtifactRef(a, p = '') { const ao = asObj(a, ['id', 'path', 'digest', 'description'], p); return Object.freeze({ id: str(ao.id, 128, false, `${p}/id`), path: safePath(ao.path, `${p}/path`), digest: digest(ao.digest, `${p}/digest`), description: str(ao.description, 1024, true, `${p}/description`) }); }
function validateCheckpointV2(cp, p = '') {
    const o = asObj(cp, ['protocol', 'version', 'task_run_id', 'checkpoint_id', 'phase_id', 'task_revision', 'evidence_revision', 'checkpoint', 'kind', 'question', 'task', 'proposal', 'evidence', 'prior'], p);
    if (o.protocol !== exports.CHECKPOINT_PROTOCOL_V2 || o.version !== exports.CHECKPOINT_VERSION_V2)
        fail('CONTRACT_VERSION_UNSUPPORTED', o.protocol !== exports.CHECKPOINT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
    if (!exports.DECISION_KINDS.includes(o.kind))
        fail('CONTRACT_VALUE_INVALID', `${p}/kind`);
    uuid(o.task_run_id, `${p}/task_run_id`);
    str(o.checkpoint_id, 128, false, `${p}/checkpoint_id`);
    str(o.phase_id, 64, false, `${p}/phase_id`);
    num(o.task_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/task_revision`);
    num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
    str(o.checkpoint, 128, false, `${p}/checkpoint`);
    str(o.question, exports.MAX_QUESTION_BYTES, true, `${p}/question`);
    const t = asObj(o.task, ['goal', 'non_goals', 'authorized_paths', 'scope_rationale', 'invariants', 'success_criteria'], `${p}/task`);
    str(t.goal, exports.MAX_TASK_BYTES, true, `${p}/task/goal`);
    str(t.scope_rationale, exports.MAX_TASK_BYTES, true, `${p}/task/scope_rationale`);
    ['non_goals', 'invariants', 'success_criteria'].forEach(k => arr(t[k], 64, `${p}/task/${k}`).forEach((x, i) => str(x, 1024, false, `${p}/task/${k}/${i}`)));
    const authPaths = arr(t.authorized_paths, 64, `${p}/task/authorized_paths`);
    authPaths.forEach((x, i) => safePath(x, `${p}/task/authorized_paths/${i}`));
    if (new Set(authPaths).size !== authPaths.length)
        fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/task/authorized_paths`);
    const pr = asObj(o.proposal, ['next_action', 'rationale', 'intended_changed_paths'], `${p}/proposal`);
    str(pr.next_action, exports.MAX_TASK_BYTES, true, `${p}/proposal/next_action`);
    str(pr.rationale, exports.MAX_TASK_BYTES, true, `${p}/proposal/rationale`);
    const chPaths = arr(pr.intended_changed_paths, exports.MAX_CHANGED_PATHS, `${p}/proposal/intended_changed_paths`);
    chPaths.forEach((x, i) => safePath(x, `${p}/proposal/intended_changed_paths/${i}`));
    if (new Set(chPaths).size !== chPaths.length)
        fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/proposal/intended_changed_paths`);
    const ev = asObj(o.evidence, ['summary', 'files', 'validation_results', 'artifacts'], `${p}/evidence`);
    const evSummary = str(ev.summary, exports.MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/summary`);
    let evBytes = (0, exports.utf8Bytes)(evSummary);
    const fPaths = {}, aIds = {};
    arr(ev.files, exports.MAX_EVIDENCE_FILES, `${p}/evidence/files`).forEach((f, i) => {
        const fo = asObj(f, ['path', 'excerpt', 'digest'], `${p}/evidence/files/${i}`), fp = safePath(fo.path, `${p}/evidence/files/${i}/path`);
        if (fPaths[fp])
            fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/evidence/files/${i}/path`);
        fPaths[fp] = true;
        str(fo.excerpt, exports.MAX_EVIDENCE_TEXT_BYTES, true, `${p}/evidence/files/${i}/excerpt`);
        digest(fo.digest, `${p}/evidence/files/${i}/digest`);
        evBytes += (0, exports.utf8Bytes)(fo.excerpt);
    });
    arr(ev.validation_results, 16, `${p}/evidence/validation_results`).forEach((v, i) => { const vr = validateValidationResult(v, `${p}/evidence/validation_results/${i}`); evBytes += (0, exports.utf8Bytes)(vr.suite) + (0, exports.utf8Bytes)(vr.command) + (vr.details ? (0, exports.utf8Bytes)(vr.details) : 0); });
    arr(ev.artifacts, 16, `${p}/evidence/artifacts`).forEach((a, i) => { const ar = validateArtifactRef(a, `${p}/evidence/artifacts/${i}`); if (aIds[ar.id])
        fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/evidence/artifacts/${i}/id`); aIds[ar.id] = true; evBytes += (0, exports.utf8Bytes)(ar.id) + (0, exports.utf8Bytes)(ar.description); });
    if (evBytes > exports.MAX_EVIDENCE_TEXT_BYTES)
        fail('CONTRACT_SIZE_EXCEEDED', `${p}/evidence`);
    const pri = asObj(o.prior, ['prior_consultation_id', 'prior_counsel', 'prior_disposition', 'observed_outcome'], `${p}/prior`);
    if (pri.prior_consultation_id !== null)
        uuid(pri.prior_consultation_id, `${p}/prior/prior_consultation_id`);
    ['prior_counsel', 'prior_disposition', 'observed_outcome'].forEach(k => { if (pri[k] !== null)
        str(pri[k], exports.MAX_TASK_BYTES, true, `${p}/prior/${k}`); });
    checkBytes(cp, exports.MAX_ENVELOPE_BYTES, p);
    return deepFreeze(cp);
}
function valResultFields(o, p) { ['recommendation', 'rationale'].forEach(k => str(o[k], exports.MAX_RESULT_BODY_BYTES, true, `${p}/${k}`)); ['must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'].forEach(k => arr(o[k], 32, `${p}/${k}`).forEach((x, i) => str(x, 2048, true, `${p}/${k}/${i}`))); }
function validateResultBodyV2(b, p = '') {
    const o = asObj(b, ['recommendation', 'rationale', 'must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'], p);
    valResultFields(o, p);
    checkBytes(b, exports.MAX_RESULT_BODY_BYTES, p);
    return deepFreeze(b);
}
function validateResultV2(r, p = '') {
    const o = asObj(r, ['protocol', 'version', 'checkpoint', 'status', 'recommendation', 'rationale', 'must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'], p);
    if (o.protocol !== exports.RESULT_PROTOCOL_V2 || o.version !== exports.RESULT_VERSION_V2)
        fail('CONTRACT_VERSION_UNSUPPORTED', o.protocol !== exports.RESULT_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
    if (o.status !== 'ADVICE_READY')
        fail('CONTRACT_STATUS_INVALID', `${p}/status`);
    str(o.checkpoint, 128, false, `${p}/checkpoint`);
    valResultFields(o, p);
    checkBytes(r, exports.MAX_RESULT_BODY_BYTES + 512, p);
    return deepFreeze(r);
}
function validateReceiptV2(r, p = '') {
    const o = asObj(r, ['backend', 'model', 'effort', 'controller_version', 'adapter_version', 'build_identity', 'elapsed_ms'], p);
    if (o.controller_version !== exports.CONTROLLER_VERSION_V2)
        fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/controller_version`);
    if (o.backend !== null && !exports.CANDIDATE_BACKENDS.includes(o.backend))
        fail('CONTRACT_VALUE_INVALID', `${p}/backend`);
    ['model', 'effort', 'adapter_version', 'build_identity'].forEach(k => { if (o[k] !== null)
        str(o[k], 256, false, `${p}/${k}`); });
    num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`);
    return deepFreeze(r);
}
function validateSanitizedError(e, p = '') {
    const o = asObj(e, ['code', 'category', 'action', 'message'], p);
    str(o.code, 64, false, `${p}/code`);
    str(o.category, 64, false, `${p}/category`);
    str(o.action, 1024, false, `${p}/action`);
    str(o.message, 1024, true, `${p}/message`);
    return deepFreeze(e);
}
function validateAttemptOutcome(a, p = '') {
    const o = asObj(a, ['attempt_id', 'slot', 'route', 'phase', 'model_started', 'elapsed_ms', 'terminal_classification', 'retry_delay_ms', 'cleanup_outcome'], p);
    str(o.attempt_id, 128, false, `${p}/attempt_id`);
    if (!exports.ATTEMPT_SLOTS.includes(o.slot))
        fail('CONTRACT_VALUE_INVALID', `${p}/slot`);
    validateRouteTarget(o.route, `${p}/route`);
    if (!exports.ATTEMPT_PHASES.includes(o.phase))
        fail('CONTRACT_VALUE_INVALID', `${p}/phase`);
    if (typeof o.model_started !== 'boolean')
        fail('CONTRACT_TYPE_INVALID', `${p}/model_started`);
    num(o.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/elapsed_ms`);
    if (!exports.TERMINAL_CLASSIFICATIONS.includes(o.terminal_classification))
        fail('CONTRACT_VALUE_INVALID', `${p}/terminal_classification`);
    if (o.retry_delay_ms !== null)
        num(o.retry_delay_ms, 0, Number.MAX_SAFE_INTEGER, `${p}/retry_delay_ms`);
    if (!exports.CLEANUP_OUTCOMES.includes(o.cleanup_outcome))
        fail('CONTRACT_VALUE_INVALID', `${p}/cleanup_outcome`);
    return deepFreeze(a);
}
function valAttempts(rawList, p) {
    const atts = arr(rawList, exports.MAX_TOTAL_ATTEMPT_SUMMARIES, p), aIds = {};
    let starts = 0;
    return atts.map((raw, i) => {
        const a = validateAttemptOutcome(raw, `${p}/${i}`);
        if (aIds[a.attempt_id])
            fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/${i}/attempt_id`);
        aIds[a.attempt_id] = true;
        if (a.model_started && (++starts > exports.MAX_MODEL_ATTEMPTS))
            fail('CONTRACT_SIZE_EXCEEDED', p);
        return a;
    });
}
function validateEnvelopeV2(env, p = '') {
    if (!(0, json_js_1.isPlainObject)(env))
        fail('CONTRACT_TYPE_INVALID', p);
    if (env.protocol !== exports.CONTROLLER_PROTOCOL_V2 || env.version !== exports.CONTROLLER_VERSION_V2)
        fail('CONTRACT_VERSION_UNSUPPORTED', env.protocol !== exports.CONTROLLER_PROTOCOL_V2 ? `${p}/protocol` : `${p}/version`);
    if (env.status === 'ADVICE_READY') {
        asObj(env, ['protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id', 'task_revision', 'evidence_revision', 'checkpoint_digest', 'status', 'receipt', 'attempts', 'result', 'audit_status'], p);
        validateResultV2(env.result, `${p}/result`);
    }
    else if (env.status === 'FAILED') {
        asObj(env, ['protocol', 'version', 'correlation_id', 'task_run_id', 'checkpoint_id', 'task_revision', 'evidence_revision', 'checkpoint_digest', 'status', 'receipt', 'attempts', 'error', 'audit_status'], p);
        validateSanitizedError(env.error, `${p}/error`);
    }
    else
        fail('CONTRACT_STATUS_INVALID', `${p}/status`);
    uuid(env.correlation_id, `${p}/correlation_id`);
    uuid(env.task_run_id, `${p}/task_run_id`);
    str(env.checkpoint_id, 128, false, `${p}/checkpoint_id`);
    num(env.task_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/task_revision`);
    num(env.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
    digest(env.checkpoint_digest, `${p}/checkpoint_digest`);
    validateReceiptV2(env.receipt, `${p}/receipt`);
    if (!exports.AUDIT_STATUSES.includes(env.audit_status))
        fail('CONTRACT_VALUE_INVALID', `${p}/audit_status`);
    valAttempts(env.attempts, `${p}/attempts`);
    checkBytes(env, exports.MAX_ENVELOPE_BYTES, p);
    return deepFreeze(env);
}
function validateHistoryExecutionV1(ex, digestFn, p = '') {
    const o = asObj(ex, ['schema_version', 'consultation_id', 'task_run_id', 'project_id', 'checkpoint_digest', 'checkpoint', 'route', 'receipt', 'prompt_identity', 'build_identity', 'attempts', 'status', 'result', 'error', 'started_at', 'completed_at'], p);
    if (o.schema_version !== exports.HISTORY_VERSION_V1)
        fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/schema_version`);
    uuid(o.consultation_id, `${p}/consultation_id`);
    uuid(o.task_run_id, `${p}/task_run_id`);
    digest(o.project_id, `${p}/project_id`);
    digest(o.checkpoint_digest, `${p}/checkpoint_digest`);
    const cp = validateCheckpointV2(o.checkpoint, `${p}/checkpoint`);
    if (digestFn && digestFn(cp) !== o.checkpoint_digest)
        fail('CONTRACT_DIGEST_MISMATCH', `${p}/checkpoint_digest`);
    if (cp.task_run_id !== o.task_run_id)
        fail('CONTRACT_IDENTITY_MISMATCH', `${p}/checkpoint/task_run_id`);
    const route = validateRouteTarget(o.route, `${p}/route`), buildId = str(o.build_identity, 128, false, `${p}/build_identity`);
    str(o.prompt_identity, 128, false, `${p}/prompt_identity`);
    valAttempts(o.attempts, `${p}/attempts`);
    if (!exports.EXECUTION_STATUSES.includes(o.status))
        fail('CONTRACT_STATUS_INVALID', `${p}/status`);
    num(o.started_at, 1, Number.MAX_SAFE_INTEGER, `${p}/started_at`);
    if (o.status === 'started') {
        if (o.receipt !== null || o.result !== null || o.error !== null || o.completed_at !== null)
            fail('CONTRACT_STATUS_INVALID', p);
    }
    else {
        const rc = validateReceiptV2(o.receipt, `${p}/receipt`);
        if (rc.build_identity !== buildId)
            fail('CONTRACT_IDENTITY_MISMATCH', `${p}/receipt/build_identity`);
        if (rc.backend !== route.backend || rc.model !== route.model || rc.effort !== route.effort)
            fail('CONTRACT_IDENTITY_MISMATCH', `${p}/receipt`);
        num(o.completed_at, o.started_at, Number.MAX_SAFE_INTEGER, `${p}/completed_at`);
        if (o.status === 'ADVICE_READY') {
            if (o.result === null || o.error !== null)
                fail('CONTRACT_STATUS_INVALID', p);
            if (validateResultV2(o.result, `${p}/result`).checkpoint !== cp.checkpoint)
                fail('CONTRACT_IDENTITY_MISMATCH', `${p}/result/checkpoint`);
        }
        else if (o.status === 'FAILED') {
            if (o.error === null || o.result !== null)
                fail('CONTRACT_STATUS_INVALID', p);
            validateSanitizedError(o.error, `${p}/error`);
        }
    }
    checkBytes(ex, exports.MAX_EXECUTION_HISTORY_BYTES, p);
    return deepFreeze(ex);
}
function validateHistoryOutcomeV1(out, p = '') {
    const o = asObj(out, ['schema_version', 'consultation_id', 'task_run_id', 'project_id', 'disposition', 'evidence_revision', 'actual_changed_paths', 'validation', 'outcome', 'correction_number', 'recorded_at'], p);
    if (o.schema_version !== exports.HISTORY_VERSION_V1)
        fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/schema_version`);
    uuid(o.consultation_id, `${p}/consultation_id`);
    uuid(o.task_run_id, `${p}/task_run_id`);
    digest(o.project_id, `${p}/project_id`);
    const disp = asObj(o.disposition, ['action', 'rationale'], `${p}/disposition`);
    if (!['accept', 'reject-with-evidence', 'need-evidence', 'reconcile'].includes(disp.action))
        fail('CONTRACT_VALUE_INVALID', `${p}/disposition/action`);
    str(disp.rationale, 4096, true, `${p}/disposition/rationale`);
    num(o.evidence_revision, 0, Number.MAX_SAFE_INTEGER, `${p}/evidence_revision`);
    arr(o.actual_changed_paths, 32, `${p}/actual_changed_paths`).forEach((x, i) => safePath(x, `${p}/actual_changed_paths/${i}`));
    validateValidationResult(o.validation, `${p}/validation`);
    if (!exports.OUTCOME_RESULTS.includes(o.outcome))
        fail('CONTRACT_VALUE_INVALID', `${p}/outcome`);
    num(o.correction_number, 1, exports.MAX_CORRECTION_CYCLES, `${p}/correction_number`);
    num(o.recorded_at, 1, Number.MAX_SAFE_INTEGER, `${p}/recorded_at`);
    checkBytes(out, exports.MAX_OUTCOME_HISTORY_BYTES, p);
    return deepFreeze(out);
}
