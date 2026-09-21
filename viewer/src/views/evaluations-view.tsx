import { useState, useMemo, type FC } from 'react';
import type { AppState } from '../app-state.js';
import { aggregateEvaluationGroups, type ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';
import type { EvaluationDocumentV1 } from '../../../src/protocol/advisor-evaluation.js';
import { EvaluationDetail } from './evaluation-detail.js';

export interface EvaluationsViewProps {
  readonly state: AppState;
  readonly onRevealChange: (reveal: boolean) => void;
}

export const EvaluationsView: FC<EvaluationsViewProps> = ({
  state,
  onRevealChange
}) => {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const { evaluationResults, evaluationsList, evaluationsComparison, revealCandidates, capabilities } = state;

  const hasEvalPerm = capabilities.length === 0 || capabilities.includes('evaluations.list');

  const validDocs = useMemo(() => {
    return evaluationResults
      .filter((r): r is typeof r & { document: EvaluationDocumentV1 } => r.status === 'EVALUATION_READY' && !!r.document)
      .map((r) => r.document);
  }, [evaluationResults]);

  const groups: readonly ComparableEvaluationGroup[] = useMemo(() => {
    if (evaluationsComparison?.groups && evaluationsComparison.groups.length > 0) {
      return evaluationsComparison.groups;
    }
    if (validDocs.length === 0) return [];
    return aggregateEvaluationGroups(validDocs);
  }, [evaluationsComparison, validDocs]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null;
    return groups.find((g) => g.key === selectedGroupKey) ?? null;
  }, [groups, selectedGroupKey]);

  const issueResults = evaluationResults.filter((r) => r.status !== 'EVALUATION_READY');

  if (!hasEvalPerm) {
    return (
      <section className="view-panel evaluations-empty" id="panel-evaluations" aria-label="Evaluations">
        <div className="empty-state-card alert-danger">
          <h3>Evaluation Inspection Forbidden</h3>
          <p>Evaluation inspection is not permitted under current actor grants.</p>
        </div>
      </section>
    );
  }

  if (evaluationsList?.status === 'not_configured' || (evaluationResults.length === 0 && !evaluationsComparison && !evaluationsList)) {
    return (
      <section className="view-panel evaluations-empty" id="panel-evaluations" aria-label="Evaluations">
        <div className="empty-state-card">
          <h3>No Counsel Evaluations Loaded</h3>
          <p>
            {evaluationsList?.status === 'not_configured'
              ? 'No evaluation source is configured for this target.'
              : 'Click "Choose Evaluation Files" or select an evaluation source to inspect candidate comparisons.'}
          </p>
          <div className="empty-state-notice text-muted">
            Evaluation documents are grouped strictly by matching rubric and input digests.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view-panel evaluations-view" id="panel-evaluations" aria-label="Evaluations">
      <div className="evaluations-header">
        <div>
          <h2 className="view-title">Counsel Evaluations ({validDocs.length > 0 ? `${validDocs.length} documents` : `${groups.length} comparable groups`})</h2>
          <p className="text-muted">
            Observations are grouped by exact comparable keys (matching rubric and input digests).
          </p>
        </div>
        <div className="evaluations-controls">
          <button
            type="button"
            className={`btn ${revealCandidates ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => onRevealChange(!revealCandidates)}
            aria-label={revealCandidates ? 'Hide candidate details' : 'Reveal candidate details'}
          >
            {revealCandidates ? 'Hide Candidate Details' : 'Reveal Candidate Details'}
          </button>
        </div>
      </div>

      {issueResults.length > 0 && (
        <div className="eval-issues-banner alert alert-warning" role="alert">
          <strong>Evaluation Document Notices ({issueResults.length}):</strong>
          <ul className="eval-issues-list">
            {issueResults.map((iss, idx) => (
              <li key={idx}>
                {iss.fileName ?? 'File'}: <code>{iss.status}</code>
                {iss.issueCode && ` — ${iss.issueCode} (${iss.issuePath ?? ''})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="evaluations-layout">
        <div className="evaluations-table-container">
          <table className="evaluations-table" aria-label="Evaluation groups">
            <thead>
              <tr>
                <th scope="col">Comparable Group</th>
                <th scope="col">Rubric / Input</th>
                <th scope="col">Cases</th>
                <th scope="col">Candidates</th>
                <th scope="col">Human Scored</th>
                <th scope="col">Auto Scored</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted">
                    No comparable evaluation groups could be formed from loaded documents.
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const isSelected = g.key === selectedGroupKey;
                  return (
                    <tr key={g.key} className={isSelected ? 'row-selected' : ''}>
                      <td><code className="key-sub">{g.key.slice(0, 16)}…</code></td>
                      <td>
                        <div className="id-sub">R: <code>{g.rubric_digest.slice(0, 8)}…</code></div>
                        <div className="id-sub">I: <code>{g.input_digest.slice(0, 8)}…</code></div>
                      </td>
                      <td>{g.cases.length}</td>
                      <td>{g.responses.length}</td>
                      <td>{g.human_scores.length > 0 ? `${g.human_scores.length} candidates` : '—'}</td>
                      <td>{g.automated_scores.length > 0 ? `${g.automated_scores.length} candidates` : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedGroupKey(isSelected ? null : g.key)}
                          aria-label={`Inspect group ${g.key.slice(0, 8)}`}
                        >
                          {isSelected ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {selectedGroup && (
          <EvaluationDetail
            group={selectedGroup}
            revealCandidates={revealCandidates}
            onClose={() => setSelectedGroupKey(null)}
          />
        )}
      </div>

      <div className="eval-disclaimer text-muted">
        <em>Blinding note:</em> Candidate labels are masked by default to reduce display bias.
        This viewer does not run experiments or grade responses.
      </div>
    </section>
  );
};
