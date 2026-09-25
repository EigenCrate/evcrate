"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeComparisonKey = computeComparisonKey;
exports.computeProvenanceGroupKey = computeProvenanceGroupKey;
exports.aggregateEvaluationGroups = aggregateEvaluationGroups;
function computeComparisonKey(rubricDigest, inputDigest) {
    return `${rubricDigest}:${inputDigest}`;
}
function computeProvenanceGroupKey(rubricDigest, inputDigest, provenance) {
    return `${rubricDigest}:${inputDigest}:${provenance}`;
}
function initScoreStats() {
    return { full: 0, partial: 0, avgSum: 0, passCount: 0, dimSums: {}, issues: [] };
}
function aggregateEvaluationGroups(documents) {
    const groups = new Map();
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
                const cand = candById.get(obs.candidate_id);
                let r = g.respMap.get(obs.candidate_id);
                if (!r) {
                    r = { cand, stats: { obs: 0, ready: 0, failed: 0, missing: 0, unscored: 0 } };
                    g.respMap.set(obs.candidate_id, r);
                }
                r.stats.obs += 1;
                if (obs.response.status === 'ADVICE_READY')
                    r.stats.ready += 1;
                else if (obs.response.status === 'FAILED')
                    r.stats.failed += 1;
                else
                    r.stats.missing += 1;
                if (!obs.score) {
                    r.stats.unscored += 1;
                }
                else {
                    let s = g.scoreMap.get(obs.candidate_id);
                    if (!s) {
                        s = { cand, human: initScoreStats(), automated: initScoreStats() };
                        g.scoreMap.set(obs.candidate_id, s);
                    }
                    const target = obs.score.provenance === 'human' ? s.human : s.automated;
                    if (obs.score.average_score !== null) {
                        target.full += 1;
                        target.avgSum += obs.score.average_score;
                        if (obs.score.passed)
                            target.passCount += 1;
                    }
                    else {
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
        const responses = Array.from(g.respMap.values()).map(({ cand, stats }) => ({
            candidate_id: cand.candidate_id, label: cand.label, route: cand.route,
            prompt_identity: cand.prompt_identity, build_identity: cand.build_identity,
            total_observations: stats.obs, ready_count: stats.ready, failed_count: stats.failed,
            missing_count: stats.missing, unscored_count: stats.unscored
        }));
        const buildScoreSummary = (cand, prov, s) => {
            const totalScored = s.full + s.partial;
            const avg = s.full > 0 ? Math.round((s.avgSum / s.full) * 100) / 100 : null;
            const passRate = s.full > 0 ? Math.round((s.passCount / s.full) * 10000) / 10000 : null;
            const dimAverages = {};
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
        const human_scores = [];
        const automated_scores = [];
        for (const { cand, human, automated } of g.scoreMap.values()) {
            if (human.full + human.partial > 0)
                human_scores.push(buildScoreSummary(cand, 'human', human));
            if (automated.full + automated.partial > 0)
                automated_scores.push(buildScoreSummary(cand, 'automated', automated));
        }
        return {
            key: computeComparisonKey(g.rubric_digest, g.input_digest),
            rubric_digest: g.rubric_digest, input_digest: g.input_digest,
            cases: g.cases, responses, human_scores, automated_scores
        };
    });
}
