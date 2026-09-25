import { deepFreeze } from './advisor-contract-runtime.js';
import { canonicalJson } from './canonical-json.js';
import {
  EVALUATION_PROTOCOL_V1, EVALUATION_VERSION_V1,
  type EvaluationDocumentV1, type EvaluationRubricV1, type EvaluationCandidateV1,
  type EvaluationObservationV1
} from './advisor-evaluation.js';
import {
  fail, asObj, idStr, str, num, arr, valRubric, valCandidate, valInput, valResponse, valScore
} from './advisor-evaluation-primitives.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export function valObservations(
  obs: unknown, candidates: readonly EvaluationCandidateV1[],
  rubric: EvaluationRubricV1, p: string
): readonly EvaluationObservationV1[] {
  const oArr = arr<unknown>(obs, candidates.length, candidates.length, p);
  const candSet = new Set(candidates.map(c => c.candidate_id));
  const seen = new Set<string>();
  const parsed = oArr.map((item, i) => {
    const o = asObj(item, ['candidate_id', 'response', 'score'], `${p}/${i}`);
    const cid = idStr(o.candidate_id, `${p}/${i}/candidate_id`);
    if (!candSet.has(cid)) fail('CONTRACT_VALUE_INVALID', `${p}/${i}/candidate_id`);
    if (seen.has(cid)) fail('CONTRACT_DUPLICATE_IDENTITY', `${p}/${i}/candidate_id`);
    seen.add(cid);
    return {
      candidate_id: cid,
      response: valResponse(o.response, `${p}/${i}/response`),
      score: valScore(o.score, rubric, `${p}/${i}/score`)
    };
  });
  if (seen.size !== candidates.length) fail('CONTRACT_VALUE_INVALID', p);
  return parsed;
}

export function validateEvaluationDocument(
  doc: unknown, options?: { digestFn?: (data: string) => string }
): EvaluationDocumentV1 {
  const o = asObj(doc, ['protocol', 'version', 'evaluation_id', 'run_id', 'created_at', 'rubric', 'rubric_digest', 'candidates', 'cases'], '');
  if (o.protocol !== EVALUATION_PROTOCOL_V1) fail('CONTRACT_VERSION_UNSUPPORTED', '/protocol');
  if (o.version !== EVALUATION_VERSION_V1) fail('CONTRACT_VERSION_UNSUPPORTED', '/version');
  const evalId = idStr(o.evaluation_id, '/evaluation_id');
  if (typeof o.run_id !== 'string' || !UUID_RE.test(o.run_id)) fail('CONTRACT_VALUE_INVALID', '/run_id');
  const cat = num(o.created_at, 1, Number.MAX_SAFE_INTEGER, '/created_at');
  const rubric = valRubric(o.rubric, '/rubric');
  if (typeof o.rubric_digest !== 'string' || !SHA256_RE.test(o.rubric_digest)) fail('CONTRACT_VALUE_INVALID', '/rubric_digest');
  if (options?.digestFn) {
    const expR = options.digestFn(canonicalJson(rubric));
    if (expR !== o.rubric_digest) fail('CONTRACT_DIGEST_MISMATCH', '/rubric_digest');
  }
  const cands = arr<unknown>(o.candidates, 2, 16, '/candidates').map((c, i) => valCandidate(c, `/candidates/${i}`));
  if (new Set(cands.map(c => c.candidate_id)).size !== cands.length) fail('CONTRACT_DUPLICATE_IDENTITY', '/candidates');
  const cases = arr<unknown>(o.cases, 1, 256, '/cases').map((cs, i) => {
    const co = asObj(cs, ['case_id', 'name', 'category', 'input', 'input_digest', 'observations'], `/cases/${i}`);
    const cid = idStr(co.case_id, `/cases/${i}/case_id`), name = str(co.name, 256, `/cases/${i}/name`)!, catg = str(co.category, 256, `/cases/${i}/category`)!;
    const inp = valInput(co.input, `/cases/${i}/input`);
    if (typeof co.input_digest !== 'string' || !SHA256_RE.test(co.input_digest)) fail('CONTRACT_VALUE_INVALID', `/cases/${i}/input_digest`);
    if (options?.digestFn) {
      const expInp = options.digestFn(canonicalJson(inp));
      if (expInp !== co.input_digest) fail('CONTRACT_DIGEST_MISMATCH', `/cases/${i}/input_digest`);
    }
    const obs = valObservations(co.observations, cands, rubric, `/cases/${i}/observations`);
    return { case_id: cid, name, category: catg, input: inp, input_digest: co.input_digest, observations: obs };
  });
  if (new Set(cases.map(c => c.case_id)).size !== cases.length) fail('CONTRACT_DUPLICATE_IDENTITY', '/cases');
  return deepFreeze({
    protocol: EVALUATION_PROTOCOL_V1, version: EVALUATION_VERSION_V1,
    evaluation_id: evalId, run_id: o.run_id, created_at: cat,
    rubric, rubric_digest: o.rubric_digest, candidates: cands, cases
  });
}

export async function validateEvaluationDocumentAsync(
  doc: unknown, options?: { digestFn?: (data: string) => Promise<string> }
): Promise<EvaluationDocumentV1> {
  const validated = validateEvaluationDocument(doc);
  if (options?.digestFn) {
    const expR = await options.digestFn(canonicalJson(validated.rubric));
    if (expR !== validated.rubric_digest) fail('CONTRACT_DIGEST_MISMATCH', '/rubric_digest');
    for (let i = 0; i < validated.cases.length; i += 1) {
      const cs = validated.cases[i];
      const expInp = await options.digestFn(canonicalJson(cs.input));
      if (expInp !== cs.input_digest) fail('CONTRACT_DIGEST_MISMATCH', `/cases/${i}/input_digest`);
    }
  }
  return validated;
}
