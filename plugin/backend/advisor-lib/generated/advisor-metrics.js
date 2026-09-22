"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nearestRankPercentile = nearestRankPercentile;
exports.normalizeHistoryRecord = normalizeHistoryRecord;
exports.normalizeHistoryFilter = normalizeHistoryFilter;
exports.filterHistoryRecords = filterHistoryRecords;
exports.calculateHistoryMetrics = calculateHistoryMetrics;
const json_js_1 = require("./json.js");
const advisor_contract_runtime_js_1 = require("./advisor-contract-runtime.js");
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const eq = (a, b) => {
    if (a === b)
        return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
        return false;
    if (Array.isArray(a) !== Array.isArray(b))
        return false;
    if (Array.isArray(a))
        return a.length === b.length && a.every((v, i) => eq(v, b[i]));
    const kA = Object.keys(a), kB = Object.keys(b);
    return kA.length === kB.length && kA.every(k => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
};
function nearestRankPercentile(values, p) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(1, Math.ceil(p * sorted.length)) - 1];
}
function normalizeHistoryRecord(execution, outcome, source) {
    const ex = (0, advisor_contract_runtime_js_1.validateHistoryExecutionV1)(execution);
    let outcome_state = 'missing', outcome_result = null;
    if (outcome !== null && outcome !== undefined) {
        try {
            const oc = (0, advisor_contract_runtime_js_1.validateHistoryOutcomeV1)(outcome);
            if (oc.consultation_id.toLowerCase() === ex.consultation_id.toLowerCase() && oc.task_run_id.toLowerCase() === ex.task_run_id.toLowerCase() && oc.project_id.toLowerCase() === ex.project_id.toLowerCase()) {
                outcome_state = 'valid';
                outcome_result = oc.outcome;
            }
            else
                outcome_state = 'invalid';
        }
        catch {
            outcome_state = 'invalid';
        }
    }
    return (0, advisor_contract_runtime_js_1.deepFreeze)({
        project_id: ex.project_id.toLowerCase(), task_run_id: ex.task_run_id.toLowerCase(), consultation_id: ex.consultation_id.toLowerCase(),
        status: ex.status, checkpoint_digest: ex.checkpoint_digest.toLowerCase(), route: ex.route, prompt_identity: ex.prompt_identity,
        build_identity: ex.build_identity, attempts: ex.attempts, started_at: ex.started_at, completed_at: ex.completed_at,
        receipt_elapsed_ms: ex.receipt ? ex.receipt.elapsed_ms : null, error: ex.error, outcome_state, outcome_result, source: { kind: source.kind, relative_path: source.relative_path }
    });
}
const FILTER_KEYS = { statuses: true, outcome_states: true, outcome_results: true, backends: true, models: true, efforts: true, prompt_identities: true, build_identities: true, started_at_from: true, started_at_to: true };
function normalizeHistoryFilter(raw) {
    const o = ((0, json_js_1.isPlainObject)(raw) ? raw : {});
    if ((0, json_js_1.isPlainObject)(raw)) {
        const rk = Object.keys(raw);
        if (rk.some(k => !FILTER_KEYS[k]))
            throw new TypeError('Invalid filter keys');
    }
    const strArr = (k) => {
        const v = o[k];
        if (v === null || v === undefined)
            return null;
        if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== 'string' || !x))
            throw new TypeError(`Invalid filter ${k}`);
        const seen = {};
        for (const item of v) {
            if (seen[item])
                throw new TypeError(`Duplicate in ${k}`);
            seen[item] = true;
        }
        return Object.freeze([...v]);
    };
    const intVal = (k) => {
        const v = o[k];
        if (v === null || v === undefined)
            return null;
        if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0)
            throw new TypeError(`Invalid filter ${k}`);
        return v;
    };
    const statuses = strArr('statuses');
    if (statuses?.some(s => !['started', 'ADVICE_READY', 'FAILED'].includes(s)))
        throw new TypeError('Invalid status filter');
    const outcome_states = strArr('outcome_states');
    if (outcome_states?.some(s => !['missing', 'valid', 'invalid'].includes(s)))
        throw new TypeError('Invalid outcome_states filter');
    const outcome_results = strArr('outcome_results');
    if (outcome_results?.some(s => !['resolved', 'unresolved', 'regressed', 'unknown'].includes(s)))
        throw new TypeError('Invalid outcome_results filter');
    const backends = strArr('backends');
    if (backends?.some(b => !advisor_contract_runtime_js_1.CANDIDATE_BACKENDS.includes(b)))
        throw new TypeError('Invalid backends filter');
    const from = intVal('started_at_from'), to = intVal('started_at_to');
    if (from !== null && to !== null && from > to)
        throw new RangeError('started_at_from > started_at_to');
    return (0, advisor_contract_runtime_js_1.deepFreeze)({ statuses, outcome_states, outcome_results, backends, models: strArr('models'), efforts: strArr('efforts'), prompt_identities: strArr('prompt_identities'), build_identities: strArr('build_identities'), started_at_from: from, started_at_to: to });
}
function filterHistoryRecords(records, f) {
    return (0, advisor_contract_runtime_js_1.deepFreeze)(records.filter(r => (!f.statuses || f.statuses.includes(r.status))
        && (!f.outcome_states || f.outcome_states.includes(r.outcome_state))
        && (!f.outcome_results || (r.outcome_result && f.outcome_results.includes(r.outcome_result)))
        && (!f.backends || f.backends.includes(r.route.backend))
        && (!f.models || f.models.includes(r.route.model))
        && (!f.efforts || f.efforts.includes(r.route.effort))
        && (!f.prompt_identities || f.prompt_identities.includes(r.prompt_identity))
        && (!f.build_identities || f.build_identities.includes(r.build_identity))
        && (f.started_at_from === null || r.started_at >= f.started_at_from)
        && (f.started_at_to === null || r.started_at <= f.started_at_to)));
}
function calcCore(recs, totalN) {
    const ready = recs.filter(r => r.status === 'ADVICE_READY').length, failed = recs.filter(r => r.status === 'FAILED').length, started = recs.filter(r => r.status === 'started').length;
    const termD = ready + failed, delivery = { numerator: ready, denominator: termD, value: termD ? round6(ready / termD) : null, excluded: totalN - termD };
    const covN = recs.filter(r => r.status === 'ADVICE_READY' && r.outcome_state === 'valid').length, outcome_coverage = { numerator: covN, denominator: ready, value: ready ? round6(covN / ready) : null, excluded: totalN - ready };
    const resN = recs.filter(r => r.outcome_result === 'resolved').length, resD = recs.filter(r => r.outcome_result && ['resolved', 'unresolved', 'regressed'].includes(r.outcome_result)).length;
    const resolution = { numerator: resN, denominator: resD, value: resD ? round6(resN / resD) : null, excluded: totalN - resD };
    const termModel = recs.filter(r => r.status !== 'started' && r.attempts.some(a => a.model_started)), bkpN = termModel.filter(r => r.attempts.some(a => a.slot === 'backup' && a.model_started)).length, retryN = termModel.filter(r => r.attempts.filter(a => a.model_started).length > 1).length;
    const backup_use = { numerator: bkpN, denominator: termModel.length, value: termModel.length ? round6(bkpN / termModel.length) : null, excluded: totalN - termModel.length };
    const retry_use = { numerator: retryN, denominator: termModel.length, value: termModel.length ? round6(retryN / termModel.length) : null, excluded: totalN - termModel.length };
    const lats = recs.filter(r => r.status !== 'started' && typeof r.receipt_elapsed_ms === 'number').map(r => r.receipt_elapsed_ms);
    const latency = { unit: 'milliseconds', sample_count: lats.length, min: lats.length ? Math.min(...lats) : null, max: lats.length ? Math.max(...lats) : null, mean: lats.length ? round6(lats.reduce((a, b) => a + b, 0) / lats.length) : null, p50: nearestRankPercentile(lats, 0.5), p95: nearestRankPercentile(lats, 0.95), excluded: totalN - lats.length };
    const counts = {
        projects: new Set(recs.map(r => r.project_id)).size, tasks: new Set(recs.map(r => `${r.project_id}:${r.task_run_id}`)).size, consultations: recs.length, terminal: termD, statuses: { started, ADVICE_READY: ready, FAILED: failed },
        outcome_states: { missing: recs.filter(r => r.outcome_state === 'missing').length, valid: recs.filter(r => r.outcome_state === 'valid').length, invalid: recs.filter(r => r.outcome_state === 'invalid').length },
        outcome_results: { resolved: resN, unresolved: recs.filter(r => r.outcome_result === 'unresolved').length, regressed: recs.filter(r => r.outcome_result === 'regressed').length, unknown: recs.filter(r => r.outcome_result === 'unknown').length }
    };
    return { counts, delivery, outcome_coverage, known_outcome_resolution: resolution, resolution, backup_use, retry_use, latency };
}
function calculateHistoryMetrics(opts) {
    var _a, _b, _c;
    const scope = opts.scope ?? { kind: 'project', project_ids: [], selected_project_id: null };
    const filters = opts.filters ? normalizeHistoryFilter(opts.filters) : normalizeHistoryFilter(null);
    const completeness = opts.completeness ?? { is_complete: true, omitted_records: 0, omitted_bytes: 0 };
    const groups = {}, diags = [...(opts.scan?.diagnostics ?? [])];
    for (const r of opts.records)
        (groups[_a = `${r.project_id}/${r.task_run_id}/${r.consultation_id}`] ?? (groups[_a] = [])).push(r);
    const deduped = [];
    let excludedDups = 0;
    for (const list of Object.values(groups)) {
        const f0 = list[0];
        if (list.length === 1 || list.every(it => it.status === f0.status && it.checkpoint_digest === f0.checkpoint_digest && it.started_at === f0.started_at && it.completed_at === f0.completed_at && it.receipt_elapsed_ms === f0.receipt_elapsed_ms && it.outcome_state === f0.outcome_state && it.outcome_result === f0.outcome_result && it.prompt_identity === f0.prompt_identity && it.build_identity === f0.build_identity && eq(it.route, f0.route) && eq(it.error, f0.error) && eq(it.attempts, f0.attempts)))
            deduped.push(f0);
        else {
            excludedDups += list.length;
            for (const item of list)
                diags.push({ code: 'DUPLICATE_IDENTITY', relative_path: item.source.relative_path, project_id: item.project_id, task_run_id: item.task_run_id, consultation_id: item.consultation_id, bytes: null, observed_schema_version: 1 });
        }
    }
    const filtered = filterHistoryRecords(deduped, filters), core = calcCore(filtered, filtered.length), allAtts = filtered.flatMap(r => r.attempts);
    const attCls = (atts) => ({
        success: atts.filter(a => a.terminal_classification === 'success').length, transient: atts.filter(a => a.terminal_classification === 'transient').length,
        fatal: atts.filter(a => a.terminal_classification === 'fatal').length, cancelled: atts.filter(a => a.terminal_classification === 'cancelled').length, skipped: atts.filter(a => a.terminal_classification === 'skipped').length
    });
    const attempts = {
        total_summaries: allAtts.length, primary_model_started: allAtts.filter(a => a.slot === 'primary' && a.model_started).length, backup_model_started: allAtts.filter(a => a.slot === 'backup' && a.model_started).length,
        preflight_phase: allAtts.filter(a => a.phase === 'preflight').length, model_phase: allAtts.filter(a => a.phase === 'model').length, transient_model_started: allAtts.filter(a => a.model_started && a.terminal_classification === 'transient').length, terminal_classifications: attCls(allAtts)
    };
    const failedRecs = filtered.filter(r => r.status === 'FAILED'), errMap = {};
    for (const r of failedRecs) {
        if (r.error)
            (errMap[_b = `${r.error.code}:${r.error.category}`] ?? (errMap[_b] = { code: r.error.code, category: r.error.category, count: 0 })).count++;
    }
    const failures = { execution: Object.values(errMap).sort((a, b) => cmp(a.code, b.code) || cmp(a.category, b.category)), attempts: attCls(failedRecs.flatMap(r => r.attempts)) };
    const rGroups = {};
    for (const r of filtered)
        (rGroups[_c = `${r.route.backend}\0${r.route.model}\0${r.route.effort}\0${r.prompt_identity}\0${r.build_identity}`] ?? (rGroups[_c] = [])).push(r);
    const route_groups = Object.keys(rGroups).sort(cmp).map(k => {
        const list = rGroups[k], first = list[0], gCore = calcCore(list, list.length);
        return { route: first.route, prompt_identity: first.prompt_identity, build_identity: first.build_identity, counts: gCore.counts, delivery: gCore.delivery, outcome_coverage: gCore.outcome_coverage, known_outcome_resolution: gCore.known_outcome_resolution, latency: gCore.latency, backup_use: gCore.backup_use, retry_use: gCore.retry_use };
    });
    diags.sort((a, b) => cmp(a.relative_path ?? '', b.relative_path ?? '') || cmp(a.code, b.code));
    const retainedDiags = diags.slice(0, 4096), suppressed = (opts.scan?.suppressed_diagnostics ?? 0) + Math.max(0, diags.length - 4096);
    const scan = {
        status: opts.scan?.status ?? (retainedDiags.length ? 'complete_with_errors' : 'complete'),
        projects_discovered: opts.scan?.projects_discovered ?? new Set(opts.records.map(r => r.project_id)).size,
        tasks_discovered: opts.scan?.tasks_discovered ?? new Set(opts.records.map(r => `${r.project_id}:${r.task_run_id}`)).size,
        consultations_discovered: opts.scan?.consultations_discovered ?? opts.records.length, accepted_records: filtered.length, invalid_records: (opts.scan?.invalid_records ?? 0) + excludedDups,
        bytes_discovered: opts.scan?.bytes_discovered ?? 0, bytes_read: opts.scan?.bytes_read ?? 0, diagnostics: Object.freeze(retainedDiags), suppressed_diagnostics: suppressed, limit_hit: opts.scan?.limit_hit ?? false
    };
    const missingness = {
        invalid_execution: scan.invalid_records, missing_outcome: core.counts.outcome_states.missing, invalid_outcome: core.counts.outcome_states.invalid,
        unknown_outcome: core.counts.outcome_results.unknown, unavailable_latency: core.latency.excluded - core.counts.statuses.started
    };
    const limits = {
        RETAINED_VALIDATED_SAMPLE_ONLY: true, TOTAL_AUDIT_COVERAGE_UNKNOWN: true, NON_ATOMIC_SOURCE_READ: true, OUTCOME_SELECTION_BIAS: true,
        TASK_COMPLETION_NOT_AUTHORITATIVE: true, ROUTE_COMPARISON_OBSERVATIONAL: true, COST_UNAVAILABLE: true, CAUSAL_EFFECT_UNAVAILABLE: true,
        ...((scan.status === 'incomplete' || scan.limit_hit || !completeness.is_complete) ? { PARTIAL_SCAN: true } : {}),
        ...((scan.invalid_records > 0 || missingness.invalid_outcome > 0) ? { INVALID_RECORDS_EXCLUDED: true } : {}),
        ...(missingness.missing_outcome > 0 ? { MISSING_OUTCOMES: true } : {}),
        ...(core.counts.statuses.started > 0 ? { ACTIVE_CONSULTATIONS_EXCLUDED: true } : {}),
        ...((opts.retention_and_pruning_apply || (completeness.omitted_records !== null && completeness.omitted_records > 0)) ? { RETENTION_AND_PRUNING_APPLY: true } : {})
    };
    return (0, advisor_contract_runtime_js_1.deepFreeze)({
        metric_definition_version: 1, scope, filters, generated_at: opts.generated_at, scan, counts: core.counts, missingness,
        metrics: { ...core, attempts, failures, failure_categories: failures, routes: route_groups, route_groups }, completeness, limitations: Object.freeze(Object.keys(limits).sort(cmp))
    });
}
