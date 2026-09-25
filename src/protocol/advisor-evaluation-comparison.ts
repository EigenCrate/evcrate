import type { AdvisorRouteTarget } from './advisor-contract-runtime.js';
import type {
  EvaluationDocumentV1, EvaluationProvenance
} from './advisor-evaluation.js';

export function computeComparisonKey(rubricDigest: string, inputDigest: string): string {
  return `${rubricDigest}:${inputDigest}`;
}

export function computeProvenanceGroupKey(
  rubricDigest: string, inputDigest: string, provenance: EvaluationProvenance
): string {
  return `${rubricDigest}:${inputDigest}:${provenance}`;
}

export interface CandidateEvaluationSummary {
  readonly candidate_id: string;
  readonly label: string | null;
  readonly route: AdvisorRouteTarget;
  readonly prompt_identity: string | null;
  readonly build_identity: string | null;
  readonly provenance: EvaluationProvenance;
  readonly total_scored_observations: number;
  readonly full_score_count: number;
  readonly partial_score_count: number;
  readonly average_score: number | null;
  readonly pass_rate: number | null;
  readonly dimension_averages: Readonly<Record<string, number | null>>;
  readonly issues: readonly string[];
}

export interface CandidateResponseSummary {
  readonly candidate_id: string;
  readonly label: string | null;
  readonly route: AdvisorRouteTarget;
  readonly prompt_identity: string | null;
  readonly build_identity: string | null;
  readonly total_observations: number;
  readonly ready_count: number;
  readonly failed_count: number;
  readonly missing_count: number;
  readonly unscored_count: number;
}

export interface ComparableEvaluationGroup {
  readonly key: string;
  readonly rubric_digest: string;
  readonly input_digest: string;
  readonly cases: readonly {
    readonly evaluation_id: string;
    readonly run_id: string;
    readonly case_id: string;
    readonly name: string;
    readonly category: string;
  }[];
  readonly responses: readonly CandidateResponseSummary[];
  readonly human_scores: readonly CandidateEvaluationSummary[];
  readonly automated_scores: readonly CandidateEvaluationSummary[];
}

interface MutableCandidateStats {
  obs: number; ready: number; failed: number; missing: number; unscored: number;
}

interface MutableScoreStats {
  full: number; partial: number; avgSum: number; passCount: number;
  dimSums: Record<string, { sum: number; count: number }>;
  issues: string[];
}

function initScoreStats(): MutableScoreStats {
  return { full: 0, partial: 0, avgSum: 0, passCount: 0, dimSums: {}, issues: [] };
}

export function aggregateEvaluationGroups(
  documents: readonly EvaluationDocumentV1[]
): readonly ComparableEvaluationGroup[] {
  const groups = new Map<string, {
    rubric_digest: string; input_digest: string;
    cases: { evaluation_id: string; run_id: string; case_id: string; name: string; category: string }[];
    respMap: Map<string, { cand: EvaluationDocumentV1['candidates'][number]; stats: MutableCandidateStats }>;
    scoreMap: Map<string, { cand: EvaluationDocumentV1['candidates'][number]; human: MutableScoreStats; automated: MutableScoreStats }>;
  }>();

  for (const doc of documents) {
    const candById = new Map(doc.candidates.map(c => [c.candidate_id, c]));
    for (const cs of doc.cases) {
      const key = computeComparisonKey(doc.rubric_digest, cs.input_digest);
      let g = groups.get(key);
      if (!g) {
        g = { rubric_digest: doc.rubric_digest, input_digest: cs.input_digest, cases: [], respMap: new Map(), scoreMap: new Map() };
        groups.set(key, g);
      }
      g.cases.push({ evaluation_id: doc.evaluation_id, run_id: doc.run_id, case_id: cs.case_id, name: cs.name, category: cs.category });

      for (const obs of cs.observations) {
        const cand = candById.get(obs.candidate_id)!;
        let r = g.respMap.get(obs.candidate_id);
        if (!r) { r = { cand, stats: { obs: 0, ready: 0, failed: 0, missing: 0, unscored: 0 } }; g.respMap.set(obs.candidate_id, r); }
        r.stats.obs += 1;
        if (obs.response.status === 'ADVICE_READY') r.stats.ready += 1;
        else if (obs.response.status === 'FAILED') r.stats.failed += 1;
        else r.stats.missing += 1;

        if (!obs.score) {
          r.stats.unscored += 1;
        } else {
          let s = g.scoreMap.get(obs.candidate_id);
          if (!s) { s = { cand, human: initScoreStats(), automated: initScoreStats() }; g.scoreMap.set(obs.candidate_id, s); }
          const target = obs.score.provenance === 'human' ? s.human : s.automated;
          if (obs.score.average_score !== null) {
            target.full += 1;
            target.avgSum += obs.score.average_score;
            if (obs.score.passed) target.passCount += 1;
          } else {
            target.partial += 1;
          }
          for (const d of obs.score.dimensions) {
            if (d.score !== null) {
              const entry = target.dimSums[d.dimension_id] ?? (target.dimSums[d.dimension_id] = { sum: 0, count: 0 });
              entry.sum += d.score;
              entry.count += 1;
            }
          }
          target.issues.push(...obs.score.issues);
        }
      }
    }
  }

  return Array.from(groups.values()).map(g => {
    const responses: CandidateResponseSummary[] = Array.from(g.respMap.values()).map(({ cand, stats }) => ({
      candidate_id: cand.candidate_id, label: cand.label, route: cand.route,
      prompt_identity: cand.prompt_identity, build_identity: cand.build_identity,
      total_observations: stats.obs, ready_count: stats.ready, failed_count: stats.failed,
      missing_count: stats.missing, unscored_count: stats.unscored
    }));

    const buildScoreSummary = (cand: EvaluationDocumentV1['candidates'][number], prov: EvaluationProvenance, s: MutableScoreStats): CandidateEvaluationSummary => {
      const totalScored = s.full + s.partial;
      const avg = s.full > 0 ? Math.round((s.avgSum / s.full) * 100) / 100 : null;
      const passRate = s.full > 0 ? Math.round((s.passCount / s.full) * 10000) / 10000 : null;
      const dimAverages: Record<string, number | null> = {};
      for (const [dimId, { sum, count }] of Object.entries(s.dimSums)) {
        dimAverages[dimId] = count > 0 ? Math.round((sum / count) * 100) / 100 : null;
      }
      return {
        candidate_id: cand.candidate_id, label: cand.label, route: cand.route,
        prompt_identity: cand.prompt_identity, build_identity: cand.build_identity,
        provenance: prov, total_scored_observations: totalScored, full_score_count: s.full,
        partial_score_count: s.partial, average_score: avg, pass_rate: passRate,
        dimension_averages: dimAverages, issues: Object.freeze([...s.issues])
      };
    };

    const human_scores: CandidateEvaluationSummary[] = [];
    const automated_scores: CandidateEvaluationSummary[] = [];
    for (const { cand, human, automated } of g.scoreMap.values()) {
      if (human.full + human.partial > 0) human_scores.push(buildScoreSummary(cand, 'human', human));
      if (automated.full + automated.partial > 0) automated_scores.push(buildScoreSummary(cand, 'automated', automated));
    }

    return {
      key: computeComparisonKey(g.rubric_digest, g.input_digest),
      rubric_digest: g.rubric_digest, input_digest: g.input_digest,
      cases: g.cases, responses, human_scores, automated_scores
    };
  });
}
