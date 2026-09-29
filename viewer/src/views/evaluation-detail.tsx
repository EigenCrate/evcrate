import { useEffect, useMemo, useRef, type FC } from 'react';
import type { ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';
import { ScoreProvenanceCard } from '../components/score-provenance-card.js';
import { CandidatePerformanceTable } from '../components/candidate-performance-table.js';

export interface EvaluationDetailProps {
  readonly group: ComparableEvaluationGroup;
  readonly revealCandidates: boolean;
  readonly onClose: () => void;
}

/**
 * EvaluationDetail: Accessible drawer presenting in-depth cases, candidate response
 * performance, and score provenance for an aggregated comparable evaluation group.
 *
 * Invariants:
 * - Traps and consumes Escape key events to dismiss the drawer without closing the host panel.
 * - Strict candidate blinding when !revealCandidates: Zero leakage of candidate ID, route,
 *   effort, prompt identity, or build identity in text, titles, or accessibility attributes.
 * - Stable per-group candidate labeling ("Candidate A", "Candidate B") deterministically
 *   mapped across response performance, human scores, and automated scores.
 */
export const EvaluationDetail: FC<EvaluationDetailProps> = ({
  group,
  revealCandidates,
  onClose
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape key handler: intercepts and consumes Escape key to dismiss drawer
  // without triggering host panel dismissal. Focus is restored ONLY upon drawer unmount.
  useEffect(() => {
    const previousFocus = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, []);

  // Stable, deterministic mapping of candidate IDs to blinded labels ("Candidate A", "Candidate B")
  const candidateLabels = useMemo(() => {
    const idSet = new Set<string>();
    for (const r of group.responses) idSet.add(r.candidate_id);
    for (const h of group.human_scores) idSet.add(h.candidate_id);
    for (const a of group.automated_scores) idSet.add(a.candidate_id);

    const sortedIds = Array.from(idSet).sort();
    const map = new Map<string, string>();
    sortedIds.forEach((id, idx) => {
      const letter = String.fromCharCode(65 + (idx % 26));
      const suffix = idx >= 26 ? String(Math.floor(idx / 26) + 1) : '';
      map.set(id, `Candidate ${letter}${suffix}`);
    });
    return map;
  }, [group]);

  return (
    <aside
      className="eval-detail-drawer"
      aria-label="Evaluation Group Details"
      role="region"
    >
      <div className="drawer-header">
        <div className="drawer-title-group">
          <h3 className="drawer-title">Comparable Evaluation Group</h3>
          <div className="drawer-digests">
            <span className="drawer-digest-item">
              Rubric: <code>{group.rubric_digest.slice(0, 10)}…</code>
            </span>
            <span className="drawer-digest-divider">&bull;</span>
            <span className="drawer-digest-item">
              Input: <code>{group.input_digest.slice(0, 10)}…</code>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-drawer-close"
          onClick={onClose}
          aria-label="Close evaluation group details"
        >
          &times; Close
        </button>
      </div>

      <div className="drawer-content">
        {/* Included Evaluation Cases */}
        <section className="drawer-section" aria-label="Included Evaluation Cases">
          <h4 className="section-label">Included Evaluation Cases ({group.cases.length})</h4>
          <ul className="eval-cases-list">
            {group.cases.map((c, idx) => (
              <li key={`${c.case_id}-${idx}`} className="eval-case-item">
                <div className="case-item-title">
                  <strong>{c.name}</strong> <span className="badge badge-info">{c.category}</span>
                </div>
                <div className="text-muted id-sub">
                  Case: <code>{c.case_id}</code> &bull; Run: <code>{c.run_id.slice(0, 8)}…</code>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Candidate Response Performance */}
        <section className="drawer-section" aria-label="Candidate Response Performance">
          <div className="section-header-row">
            <h4 className="section-label">Candidate Response Performance</h4>
            {!revealCandidates && (
              <span className="badge badge-secondary blinding-badge">Blinded</span>
            )}
          </div>

          <CandidatePerformanceTable
            responses={group.responses}
            revealCandidates={revealCandidates}
            candidateLabels={candidateLabels}
          />
        </section>

        {/* Scores by Provenance */}
        {(group.human_scores.length > 0 || group.automated_scores.length > 0) && (
          <section className="drawer-section" aria-label="Scores by Provenance">
            <h4 className="section-label">Scores by Provenance</h4>
            <div className="scores-columns">
              {group.human_scores.length > 0 && (
                <div className="score-provenance-col">
                  <h5 className="score-col-heading">Human Judge Scores</h5>
                  <div className="score-cards-list">
                    {group.human_scores.map((hs, idx) => (
                      <ScoreProvenanceCard
                        key={revealCandidates ? hs.candidate_id : `blinded-hs-${idx}`}
                        summary={hs}
                        label={revealCandidates ? (hs.label ?? hs.candidate_id) : (candidateLabels.get(hs.candidate_id) ?? `Candidate ${String.fromCharCode(65 + idx)}`)}
                        provenanceType="human"
                        revealCandidates={revealCandidates}
                        index={idx}
                      />
                    ))}
                  </div>
                </div>
              )}

              {group.automated_scores.length > 0 && (
                <div className="score-provenance-col">
                  <h5 className="score-col-heading">Automated Judge Scores</h5>
                  <div className="score-cards-list">
                    {group.automated_scores.map((as, idx) => (
                      <ScoreProvenanceCard
                        key={revealCandidates ? as.candidate_id : `blinded-as-${idx}`}
                        summary={as}
                        label={revealCandidates ? (as.label ?? as.candidate_id) : (candidateLabels.get(as.candidate_id) ?? `Candidate ${String.fromCharCode(65 + idx)}`)}
                        provenanceType="automated"
                        revealCandidates={revealCandidates}
                        index={idx}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
