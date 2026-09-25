"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fail = fail;
exports.asObj = asObj;
exports.idStr = idStr;
exports.str = str;
exports.num = num;
exports.arr = arr;
exports.valRubric = valRubric;
exports.valCandidate = valCandidate;
exports.valInput = valInput;
exports.valResponse = valResponse;
exports.valScore = valScore;
const advisor_contract_runtime_js_1 = require("./advisor-contract-runtime.js");
const advisor_evaluation_js_1 = require("./advisor-evaluation.js");
function fail(c, p = '') {
    throw new advisor_contract_runtime_js_1.AdvisorContractError({ code: c, path: p });
}
function asObj(v, exp, p) {
    if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) {
        fail('CONTRACT_TYPE_INVALID', p);
    }
    const obj = v;
    const k = Object.keys(obj);
    if (k.length !== exp.length || k.some(x => !exp.includes(x)))
        fail('CONTRACT_KEYS_INVALID', p);
    return obj;
}
const ID_RE = /^[A-Za-z0-9._-]{1,128}$/, CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function idStr(v, p) {
    if (typeof v !== 'string')
        fail('CONTRACT_TYPE_INVALID', p);
    if (!ID_RE.test(v))
        fail('CONTRACT_VALUE_INVALID', p);
    return v;
}
function str(v, max, p, nullable = false) {
    if (nullable && v === null)
        return null;
    if (typeof v !== 'string')
        fail('CONTRACT_TYPE_INVALID', p);
    if ((0, advisor_contract_runtime_js_1.utf8Bytes)(v) > max)
        fail('CONTRACT_SIZE_EXCEEDED', p);
    if (!v || v.trim() !== v || CTRL_RE.test(v))
        fail('CONTRACT_VALUE_INVALID', p);
    return v;
}
function num(v, min, max, p) {
    if (typeof v !== 'number' || !Number.isSafeInteger(v))
        fail('CONTRACT_TYPE_INVALID', p);
    if (v < min || v > max)
        fail('CONTRACT_VALUE_INVALID', p);
    return v;
}
function arr(v, min, max, p) {
    if (!Array.isArray(v))
        fail('CONTRACT_TYPE_INVALID', p);
    if (v.length < min || v.length > max)
        fail(v.length > max ? 'CONTRACT_SIZE_EXCEEDED' : 'CONTRACT_VALUE_INVALID', p);
    return v;
}
function valRubric(r, p) {
    const o = asObj(r, ['version', 'dimensions', 'pass_threshold'], p);
    if (o.version !== 1)
        fail('CONTRACT_VERSION_UNSUPPORTED', `${p}/version`);
    const dims = arr(o.dimensions, 1, 16, `${p}/dimensions`).map((d, i) => {
        const do_ = asObj(d, ['id', 'description', 'scale'], `${p}/dimensions/${i}`);
        const id = idStr(do_.id, `${p}/dimensions/${i}/id`), desc = str(do_.description, 4096, `${p}/dimensions/${i}/description`);
        const sc = arr(do_.scale, 2, 2, `${p}/dimensions/${i}/scale`);
        if (sc[0] !== advisor_evaluation_js_1.EVALUATION_RUBRIC_SCALE[0] || sc[1] !== advisor_evaluation_js_1.EVALUATION_RUBRIC_SCALE[1])
            fail('CONTRACT_VALUE_INVALID', `${p}/dimensions/${i}/scale`);
        return { id, description: desc, scale: advisor_evaluation_js_1.EVALUATION_RUBRIC_SCALE };
    });
    if (new Set(dims.map(d => d.id)).size !== dims.length)
        fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/dimensions`);
    return { version: 1, dimensions: dims, pass_threshold: num(o.pass_threshold, 1, 5, `${p}/pass_threshold`) };
}
function valCandidate(c, p) {
    const o = asObj(c, ['candidate_id', 'label', 'route', 'prompt_identity', 'build_identity'], p);
    return {
        candidate_id: idStr(o.candidate_id, `${p}/candidate_id`),
        label: str(o.label, 256, `${p}/label`, true),
        route: (0, advisor_contract_runtime_js_1.validateRouteTarget)(o.route, `${p}/route`),
        prompt_identity: str(o.prompt_identity, 128, `${p}/prompt_identity`, true),
        build_identity: str(o.build_identity, 128, `${p}/build_identity`, true)
    };
}
function valInput(inp, p) {
    const o = asObj(inp, ['context', 'executor_proposal', 'evidence'], p);
    const ctx = asObj(o.context, ['goal', 'non_goals', 'authorized_paths'], `${p}/context`);
    const prop = asObj(o.executor_proposal, ['hypothesis', 'intended_action'], `${p}/executor_proposal`);
    const ev = asObj(o.evidence, ['observed_failure', 'files', 'validation_command'], `${p}/evidence`);
    return {
        context: {
            goal: str(ctx.goal, 4096, `${p}/context/goal`),
            non_goals: arr(ctx.non_goals, 0, 32, `${p}/context/non_goals`).map((s, i) => str(s, 2048, `${p}/context/non_goals/${i}`)),
            authorized_paths: arr(ctx.authorized_paths, 0, 32, `${p}/context/authorized_paths`).map((s, i) => str(s, 512, `${p}/context/authorized_paths/${i}`))
        },
        executor_proposal: {
            hypothesis: str(prop.hypothesis, 4096, `${p}/executor_proposal/hypothesis`),
            intended_action: str(prop.intended_action, 4096, `${p}/executor_proposal/intended_action`)
        },
        evidence: {
            observed_failure: str(ev.observed_failure, 4096, `${p}/evidence/observed_failure`),
            files: arr(ev.files, 0, 32, `${p}/evidence/files`).map((s, i) => str(s, 512, `${p}/evidence/files/${i}`)),
            validation_command: str(ev.validation_command, 512, `${p}/evidence/validation_command`)
        }
    };
}
function valResult(r, p) {
    const o = asObj(r, ['recommendation', 'rationale', 'must_fix', 'cautions', 'assumptions', 'success_checks', 'unresolved_questions'], p);
    const list = (k) => arr(o[k], 0, 32, `${p}/${k}`).map((x, i) => str(x, 2048, `${p}/${k}/${i}`));
    return {
        recommendation: str(o.recommendation, 4096, `${p}/recommendation`),
        rationale: str(o.rationale, 4096, `${p}/rationale`),
        must_fix: list('must_fix'), cautions: list('cautions'), assumptions: list('assumptions'),
        success_checks: list('success_checks'), unresolved_questions: list('unresolved_questions')
    };
}
function valResponse(res, p) {
    const o = asObj(res, ['status', 'result', 'error', 'captured_at'], p);
    if (typeof o.status !== 'string' || !advisor_evaluation_js_1.EVALUATION_RESPONSE_STATUSES.includes(o.status)) {
        fail('CONTRACT_STATUS_INVALID', `${p}/status`);
    }
    const status = o.status;
    if (status === 'ADVICE_READY') {
        if (o.error !== null)
            fail('CONTRACT_VALUE_INVALID', `${p}/error`);
        return { status: 'ADVICE_READY', result: valResult(o.result, `${p}/result`), error: null, captured_at: num(o.captured_at, 1, Number.MAX_SAFE_INTEGER, `${p}/captured_at`) };
    }
    if (status === 'FAILED') {
        if (o.result !== null)
            fail('CONTRACT_VALUE_INVALID', `${p}/result`);
        return { status: 'FAILED', result: null, error: (0, advisor_contract_runtime_js_1.validateSanitizedError)(o.error, `${p}/error`), captured_at: num(o.captured_at, 1, Number.MAX_SAFE_INTEGER, `${p}/captured_at`) };
    }
    if (o.result !== null || o.error !== null || o.captured_at !== null)
        fail('CONTRACT_VALUE_INVALID', p);
    return { status: 'MISSING', result: null, error: null, captured_at: null };
}
function valScore(sc, rubric, p) {
    if (sc === null)
        return null;
    const o = asObj(sc, ['provenance', 'judge_id', 'judge_version', 'scored_at', 'dimensions', 'average_score', 'passed', 'issues'], p);
    if (typeof o.provenance !== 'string' || !advisor_evaluation_js_1.EVALUATION_PROVENANCES.includes(o.provenance)) {
        fail('CONTRACT_VALUE_INVALID', `${p}/provenance`);
    }
    const prov = o.provenance;
    const jid = idStr(o.judge_id, `${p}/judge_id`), jver = str(o.judge_version, 64, `${p}/judge_version`);
    const sat = num(o.scored_at, 1, Number.MAX_SAFE_INTEGER, `${p}/scored_at`);
    const dimsRaw = arr(o.dimensions, rubric.dimensions.length, rubric.dimensions.length, `${p}/dimensions`);
    const dims = dimsRaw.map((d, i) => {
        const do_ = asObj(d, ['dimension_id', 'score'], `${p}/dimensions/${i}`);
        const dimId = idStr(do_.dimension_id, `${p}/dimensions/${i}/dimension_id`);
        if (!rubric.dimensions.some(rd => rd.id === dimId))
            fail('CONTRACT_VALUE_INVALID', `${p}/dimensions/${i}/dimension_id`);
        const scoreVal = do_.score === null ? null : num(do_.score, 1, 5, `${p}/dimensions/${i}/score`);
        return { dimension_id: dimId, score: scoreVal };
    });
    if (new Set(dims.map(d => d.dimension_id)).size !== rubric.dimensions.length)
        fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/dimensions`);
    const issues = arr(o.issues, 0, 32, `${p}/issues`).map((s, i) => str(s, 4096, `${p}/issues/${i}`));
    const hasNull = dims.some(d => d.score === null);
    if (hasNull) {
        if (o.average_score !== null || o.passed !== null)
            fail('CONTRACT_VALUE_INVALID', p);
        return { provenance: prov, judge_id: jid, judge_version: jver, scored_at: sat, dimensions: dims, average_score: null, passed: null, issues };
    }
    const sum = dims.reduce((acc, d) => acc + d.score, 0);
    const expectedAvg = Math.round((sum / dims.length) * 100) / 100;
    if (typeof o.average_score !== 'number' || Math.abs(o.average_score - expectedAvg) > 0.001)
        fail('CONTRACT_VALUE_INVALID', `${p}/average_score`);
    const expectedPassed = expectedAvg >= rubric.pass_threshold;
    if (o.passed !== expectedPassed)
        fail('CONTRACT_VALUE_INVALID', `${p}/passed`);
    return { provenance: prov, judge_id: jid, judge_version: jver, scored_at: sat, dimensions: dims, average_score: expectedAvg, passed: expectedPassed, issues };
}
