"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.valObservations = valObservations;
exports.validateEvaluationDocument = validateEvaluationDocument;
exports.validateEvaluationDocumentAsync = validateEvaluationDocumentAsync;
const advisor_contract_runtime_js_1 = require("./advisor-contract-runtime.js");
const canonical_json_js_1 = require("./canonical-json.js");
const advisor_evaluation_js_1 = require("./advisor-evaluation.js");
const advisor_evaluation_primitives_js_1 = require("./advisor-evaluation-primitives.js");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
function valObservations(obs, candidates, rubric, p) {
    const oArr = (0, advisor_evaluation_primitives_js_1.arr)(obs, candidates.length, candidates.length, p);
    const candSet = new Set(candidates.map(c => c.candidate_id));
    const seen = new Set();
    const parsed = oArr.map((item, i) => {
        const o = (0, advisor_evaluation_primitives_js_1.asObj)(item, ['candidate_id', 'response', 'score'], `${p}/${i}`);
        const cid = (0, advisor_evaluation_primitives_js_1.idStr)(o.candidate_id, `${p}/${i}/candidate_id`);
        if (!candSet.has(cid))
            (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VALUE_INVALID', `${p}/${i}/candidate_id`);
        if (seen.has(cid))
            (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DUPLICATE_IDENTITY', `${p}/${i}/candidate_id`);
        seen.add(cid);
        return {
            candidate_id: cid,
            response: (0, advisor_evaluation_primitives_js_1.valResponse)(o.response, `${p}/${i}/response`),
            score: (0, advisor_evaluation_primitives_js_1.valScore)(o.score, rubric, `${p}/${i}/score`)
        };
    });
    if (seen.size !== candidates.length)
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VALUE_INVALID', p);
    return parsed;
}
function validateEvaluationDocument(doc, options) {
    const o = (0, advisor_evaluation_primitives_js_1.asObj)(doc, ['protocol', 'version', 'evaluation_id', 'run_id', 'created_at', 'rubric', 'rubric_digest', 'candidates', 'cases'], '');
    if (o.protocol !== advisor_evaluation_js_1.EVALUATION_PROTOCOL_V1)
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VERSION_UNSUPPORTED', '/protocol');
    if (o.version !== advisor_evaluation_js_1.EVALUATION_VERSION_V1)
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VERSION_UNSUPPORTED', '/version');
    const evalId = (0, advisor_evaluation_primitives_js_1.idStr)(o.evaluation_id, '/evaluation_id');
    if (typeof o.run_id !== 'string' || !UUID_RE.test(o.run_id))
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VALUE_INVALID', '/run_id');
    const cat = (0, advisor_evaluation_primitives_js_1.num)(o.created_at, 1, Number.MAX_SAFE_INTEGER, '/created_at');
    const rubric = (0, advisor_evaluation_primitives_js_1.valRubric)(o.rubric, '/rubric');
    if (typeof o.rubric_digest !== 'string' || !SHA256_RE.test(o.rubric_digest))
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VALUE_INVALID', '/rubric_digest');
    if (options?.digestFn) {
        const expR = options.digestFn((0, canonical_json_js_1.canonicalJson)(rubric));
        if (expR !== o.rubric_digest)
            (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DIGEST_MISMATCH', '/rubric_digest');
    }
    const cands = (0, advisor_evaluation_primitives_js_1.arr)(o.candidates, 2, 16, '/candidates').map((c, i) => (0, advisor_evaluation_primitives_js_1.valCandidate)(c, `/candidates/${i}`));
    if (new Set(cands.map(c => c.candidate_id)).size !== cands.length)
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DUPLICATE_IDENTITY', '/candidates');
    const cases = (0, advisor_evaluation_primitives_js_1.arr)(o.cases, 1, 256, '/cases').map((cs, i) => {
        const co = (0, advisor_evaluation_primitives_js_1.asObj)(cs, ['case_id', 'name', 'category', 'input', 'input_digest', 'observations'], `/cases/${i}`);
        const cid = (0, advisor_evaluation_primitives_js_1.idStr)(co.case_id, `/cases/${i}/case_id`), name = (0, advisor_evaluation_primitives_js_1.str)(co.name, 256, `/cases/${i}/name`), catg = (0, advisor_evaluation_primitives_js_1.str)(co.category, 256, `/cases/${i}/category`);
        const inp = (0, advisor_evaluation_primitives_js_1.valInput)(co.input, `/cases/${i}/input`);
        if (typeof co.input_digest !== 'string' || !SHA256_RE.test(co.input_digest))
            (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_VALUE_INVALID', `/cases/${i}/input_digest`);
        if (options?.digestFn) {
            const expInp = options.digestFn((0, canonical_json_js_1.canonicalJson)(inp));
            if (expInp !== co.input_digest)
                (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DIGEST_MISMATCH', `/cases/${i}/input_digest`);
        }
        const obs = valObservations(co.observations, cands, rubric, `/cases/${i}/observations`);
        return { case_id: cid, name, category: catg, input: inp, input_digest: co.input_digest, observations: obs };
    });
    if (new Set(cases.map(c => c.case_id)).size !== cases.length)
        (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DUPLICATE_IDENTITY', '/cases');
    return (0, advisor_contract_runtime_js_1.deepFreeze)({
        protocol: advisor_evaluation_js_1.EVALUATION_PROTOCOL_V1, version: advisor_evaluation_js_1.EVALUATION_VERSION_V1,
        evaluation_id: evalId, run_id: o.run_id, created_at: cat,
        rubric, rubric_digest: o.rubric_digest, candidates: cands, cases
    });
}
async function validateEvaluationDocumentAsync(doc, options) {
    const validated = validateEvaluationDocument(doc);
    if (options?.digestFn) {
        const expR = await options.digestFn((0, canonical_json_js_1.canonicalJson)(validated.rubric));
        if (expR !== validated.rubric_digest)
            (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DIGEST_MISMATCH', '/rubric_digest');
        for (let i = 0; i < validated.cases.length; i += 1) {
            const cs = validated.cases[i];
            const expInp = await options.digestFn((0, canonical_json_js_1.canonicalJson)(cs.input));
            if (expInp !== cs.input_digest)
                (0, advisor_evaluation_primitives_js_1.fail)('CONTRACT_DIGEST_MISMATCH', `/cases/${i}/input_digest`);
        }
    }
    return validated;
}
