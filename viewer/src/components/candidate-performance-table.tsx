import type { FC } from 'react';
import type { CandidateResponseSummary } from '../../../src/protocol/advisor-evaluation-comparison.js';

export interface CandidatePerformanceTableProps {
  readonly responses: readonly CandidateResponseSummary[];
  readonly revealCandidates: boolean;
  readonly candidateLabels: ReadonlyMap<string, string>;
}

/**
 * CandidatePerformanceTable: Renders the candidate response performance table
 * with strict candidate blinding when !revealCandidates.
 */
export const CandidatePerformanceTable: FC<CandidatePerformanceTableProps> = ({
  responses,
  revealCandidates,
  candidateLabels
}) => {
  return (
    <div className="eval-candidates-table-wrapper">
      <table className="eval-candidates-table" aria-label="Candidate performance table">
        <thead>
          <tr>
            <th scope="col">Candidate</th>
            {revealCandidates && <th scope="col">Route / Build</th>}
            <th scope="col">Total</th>
            <th scope="col">Ready</th>
            <th scope="col">Failed</th>
            <th scope="col">Missing</th>
          </tr>
        </thead>
        <tbody>
          {responses.map((resp, idx) => {
            const displayLabel = revealCandidates
              ? (resp.label ?? resp.candidate_id)
              : (candidateLabels.get(resp.candidate_id) ?? `Candidate ${String.fromCharCode(65 + idx)}`);

            return (
              <tr
                key={revealCandidates ? resp.candidate_id : `blinded-resp-${idx}`}
                aria-label={displayLabel}
              >
                <td>
                  <strong>{displayLabel}</strong>
                </td>
                {revealCandidates && (
                  <td>
                    <code>{resp.route.backend}/{resp.route.model}</code>
                    <div className="text-submuted">
                      Build: {resp.build_identity?.slice(0, 8) ?? '—'}
                    </div>
                  </td>
                )}
                <td>{resp.total_observations}</td>
                <td>
                  <span className="badge badge-success">{resp.ready_count}</span>
                </td>
                <td>
                  {resp.failed_count > 0 ? (
                    <span className="badge badge-danger">{resp.failed_count}</span>
                  ) : (
                    '0'
                  )}
                </td>
                <td>
                  {resp.missing_count > 0 ? (
                    <span className="badge badge-warning">{resp.missing_count}</span>
                  ) : (
                    '0'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
