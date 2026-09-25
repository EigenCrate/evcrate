import type { FC } from 'react';
import type { ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';

export interface EvaluationDetailProps {
  readonly group: ComparableEvaluationGroup;
  readonly revealCandidates: boolean;
  readonly onClose: () => void;
}

export const EvaluationDetail: FC<EvaluationDetailProps> = ({
  group,
  revealCandidates,
  onClose
}) => {
  return (
    <aside className="eval-detail-drawer" aria-label="Evaluation Group Details">
      <div className="drawer-header">
        <div className="drawer-title-group">
          <h3 className="drawer-title">Comparable Evaluation Group</h3>
          <code className="drawer-id">Rubric: {group.rubric_digest.slice(0, 8)}… | Input: {group.input_digest.slice(0, 8)}…</code>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Close evaluation details"
        >
          &times; Close
        </button>
      </div>

      <div className="drawer-content">
        <section className="drawer-section">
          <h4 className="section-label">Included Evaluation Cases ({group.cases.length})</h4>
          <ul className="eval-cases-list">
            {group.cases.map((c, idx) => (
              <li key={`${c.case_id}-${idx}`} className="eval-case-item">
                <strong>{c.name}</strong> <span className="badge badge-info">{c.category}</span>
                <div className="text-muted id-sub">Case: <code>{c.case_id}</code> (Run: <code>{c.run_id.slice(0, 8)}…</code>)</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="drawer-section">
          <h4 className="section-label">Candidate Response Performance</h4>
          <div className="eval-candidates-table-wrapper">
            <table className="eval-candidates-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  {revealCandidates && <th>Route / Build</th>}
                  <th>Total</th>
                  <th>Ready</th>
                  <th>Failed</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                {group.responses.map((resp, idx) => {
                  const displayLabel = revealCandidates
                    ? (resp.label ?? resp.candidate_id)
                    : `Candidate ${String.fromCharCode(65 + idx)}`;

                  return (
                    <tr key={resp.candidate_id}>
                      <td><strong>{displayLabel}</strong></td>
                      {revealCandidates && (
                        <td>
                          <code>{resp.route.backend}/{resp.route.model}</code>
                          <div className="text-submuted">Build: {resp.build_identity?.slice(0, 8) ?? '—'}</div>
                        </td>
                      )}
                      <td>{resp.total_observations}</td>
                      <td><span className="badge badge-success">{resp.ready_count}</span></td>
                      <td>{resp.failed_count > 0 ? <span className="badge badge-danger">{resp.failed_count}</span> : '0'}</td>
                      <td>{resp.missing_count > 0 ? <span className="badge badge-warning">{resp.missing_count}</span> : '0'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {(group.human_scores.length > 0 || group.automated_scores.length > 0) && (
          <section className="drawer-section">
            <h4 className="section-label">Scores by Provenance</h4>
            <div className="scores-columns">
              {group.human_scores.length > 0 && (
                <div className="score-provenance-col">
                  <h5>Human Judge Scores</h5>
                  {group.human_scores.map((hs, idx) => {
                    const label = revealCandidates ? (hs.label ?? hs.candidate_id) : `Candidate ${String.fromCharCode(65 + idx)}`;
                    return (
                      <div key={hs.candidate_id} className="score-summary-item">
                        <div className="score-item-header"><strong>{label}</strong></div>
                        <div>Average: <strong>{hs.average_score !== null ? `${hs.average_score.toFixed(2)} / 5.0` : 'Unavailable'}</strong></div>
                        <div>Pass rate: <strong>{hs.pass_rate !== null ? `${(hs.pass_rate * 100).toFixed(1)}%` : 'Unavailable'}</strong></div>
                        <div className="text-muted">Scored: {hs.total_scored_observations} (Full: {hs.full_score_count}, Partial: {hs.partial_score_count})</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {group.automated_scores.length > 0 && (
                <div className="score-provenance-col">
                  <h5>Automated Judge Scores</h5>
                  {group.automated_scores.map((as, idx) => {
                    const label = revealCandidates ? (as.label ?? as.candidate_id) : `Candidate ${String.fromCharCode(65 + idx)}`;
                    return (
                      <div key={as.candidate_id} className="score-summary-item">
                        <div className="score-item-header"><strong>{label}</strong></div>
                        <div>Average: <strong>{as.average_score !== null ? `${as.average_score.toFixed(2)} / 5.0` : 'Unavailable'}</strong></div>
                        <div>Pass rate: <strong>{as.pass_rate !== null ? `${(as.pass_rate * 100).toFixed(1)}%` : 'Unavailable'}</strong></div>
                        <div className="text-muted">Scored: {as.total_scored_observations} (Full: {as.full_score_count}, Partial: {as.partial_score_count})</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
