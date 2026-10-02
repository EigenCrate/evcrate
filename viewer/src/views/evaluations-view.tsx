import { useState, useMemo, type FC } from 'react';
import type { AppState } from '../app-state.js';
import { aggregateEvaluationGroups, type ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';
import type { EvaluationDocumentV1 } from '../../../src/protocol/advisor-evaluation.js';
import type { EvaluationDescriptorV1 } from '../../../src/protocol/advisor-data-api.js';
import { EvaluationsHeader } from '../components/evaluations-header.js';
import { EvaluationDescriptorsSection } from '../components/evaluation-descriptors-section.js';
import { ComparableGroupsSection } from '../components/comparable-groups-section.js';

export interface EvaluationsViewProps {
  readonly state: AppState;
  readonly onRevealChange: (reveal: boolean) => void;
  readonly onCompareDescriptors?: (items: readonly { evaluation_ref: string; expected_revision: string }[]) => void;
  readonly onInspectDescriptor?: (evaluationRef: string, expectedRevision: string) => void;
}

export const EvaluationsView: FC<EvaluationsViewProps> = ({
  state,
  onRevealChange,
  onCompareDescriptors,
  onInspectDescriptor
}) => {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  const {
    evaluationResults,
    evaluationsList,
    evaluationsComparison,
    revealCandidates,
    capabilities,
    evaluationsState,
    comparisonState,
    selectedEvaluation
  } = state;

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

  // Discovered descriptors from evaluationsList or fallback to validDocs
  const descriptors: readonly EvaluationDescriptorV1[] = useMemo(() => {
    if (evaluationsList?.items && evaluationsList.items.length > 0) {
      return evaluationsList.items;
    }
    return validDocs.map((doc, idx) => ({
      evaluation_ref: doc.evaluation_id || `eval-${idx}`,
      source_revision: 'standalone',
      source_digest: doc.rubric_digest,
      evaluation_id: doc.evaluation_id,
      run_id: doc.run_id,
      created_at: doc.created_at,
      candidate_count: doc.candidates?.length ?? 0,
      case_count: doc.cases?.length ?? 0,
      observation_count: doc.cases.reduce((sum, c) => sum + (c.observations?.length ?? 0), 0)
    }));
  }, [evaluationsList, validDocs]);

  const issueResults = evaluationResults.filter((r) => r.status !== 'EVALUATION_READY');
  const isComparing = comparisonState?.status === 'loading';
  const listStatus = evaluationsState?.status ?? evaluationsList?.status ?? 'idle';

  const handleCompareClick = () => {
    if (descriptors.length === 0) return;
    const boundedItems = descriptors.slice(0, 32).map((d) => ({
      evaluation_ref: d.evaluation_ref,
      expected_revision: d.source_revision
    }));
    onCompareDescriptors?.(boundedItems);
  };

  if (!hasEvalPerm) {
    return (
      <section
        className="view-panel evaluations-empty"
        id="panel-evaluations"
        role="tabpanel"
        aria-labelledby="tab-evaluations"
        tabIndex={0}
      >
        <div className="empty-state-card alert-danger">
          <h3>Evaluation Inspection Forbidden</h3>
          <p>Evaluation inspection is not permitted under current actor grants.</p>
        </div>
      </section>
    );
  }

  if (evaluationsList?.status === 'not_configured' || (descriptors.length === 0 && groups.length === 0 && !evaluationsList)) {
    return (
      <section
        className="view-panel evaluations-empty"
        id="panel-evaluations"
        role="tabpanel"
        aria-labelledby="tab-evaluations"
        tabIndex={0}
      >
        <div className="empty-state-card">
          <h3>No Counsel Evaluations Loaded</h3>
          <p>
            {evaluationsList?.status === 'not_configured'
              ? 'No evaluation source is configured for this target.'
              : 'The active workspace has not provided an evaluation source.'}
          </p>
          <div className="empty-state-notice text-muted">
            Bound evaluation source — not filtered by History project. Evaluation documents are grouped strictly by matching rubric and input digests.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="view-panel evaluations-view"
      id="panel-evaluations"
      role="tabpanel"
      aria-labelledby="tab-evaluations"
      tabIndex={0}
    >
      <EvaluationsHeader
        descriptorsCount={descriptors.length}
        groupsCount={groups.length}
        listStatus={listStatus}
        comparisonStatus={comparisonState?.status}
        comparisonError={comparisonState?.error}
        isComparing={isComparing}
        revealCandidates={revealCandidates}
        onCompare={handleCompareClick}
        onRevealChange={onRevealChange}
      />

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

      {selectedEvaluation && selectedEvaluation.status !== 'idle' && (
        <div
          className={`inspected-evaluation-card alert ${
            selectedEvaluation.status === 'error'
              ? 'alert-danger'
              : selectedEvaluation.status === 'ready'
              ? 'alert-success'
              : 'alert-info'
          }`}
          role="region"
          aria-label="Inspected Evaluation Document"
        >
          <div className="inspected-eval-header">
            <strong>Inspected Evaluation: <code>{selectedEvaluation.evaluationRef}</code></strong>
            <span className="badge badge-secondary" style={{ marginLeft: 8 }}>{selectedEvaluation.status}</span>
          </div>
          {selectedEvaluation.status === 'loading' && (
            <p className="text-muted" style={{ margin: '6px 0 0' }}>Loading evaluation document…</p>
          )}
          {selectedEvaluation.status === 'error' && (
            <p className="text-danger" style={{ margin: '6px 0 0' }}>{selectedEvaluation.error ?? 'Failed to inspect evaluation document.'}</p>
          )}
          {selectedEvaluation.status === 'ready' && selectedEvaluation.document && (
            <div className="inspected-eval-details" style={{ marginTop: 8 }}>
              <dl className="detail-dl">
                <dt>Evaluation ID</dt>
                <dd><code>{selectedEvaluation.document.evaluation_id}</code></dd>
                <dt>Run ID</dt>
                <dd><code>{selectedEvaluation.document.run_id}</code></dd>
                <dt>Revision</dt>
                <dd><code>{selectedEvaluation.observedRevision ?? '—'}</code></dd>
                <dt>Rubric</dt>
                <dd><code>{selectedEvaluation.document.rubric_digest.slice(0, 12)}…</code></dd>
                <dt>Candidates</dt>
                <dd>{selectedEvaluation.document.candidates.length} candidates</dd>
                <dt>Cases</dt>
                <dd>{selectedEvaluation.document.cases.length} cases</dd>
                <dt>Observations</dt>
                <dd>{selectedEvaluation.document.cases.reduce((acc, c) => acc + c.observations.length, 0)} observations</dd>
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Available Descriptors Listing with Pagination */}
      <EvaluationDescriptorsSection
        descriptors={descriptors}
        onInspect={onInspectDescriptor}
        pageSize={10}
      />

      {/* Comparable Evaluation Groups Section & Detail Layout */}
      <ComparableGroupsSection
        groups={groups}
        selectedGroupKey={selectedGroupKey}
        revealCandidates={revealCandidates}
        onSelectGroup={setSelectedGroupKey}
      />

      <div className="eval-limitations-notice text-muted">
        <strong>Methodological limitations:</strong> Observations are grouped strictly by matching rubric and input digests. Grouping does not represent an account-wide benchmark or causal model ranking. Candidate blinding is enabled by default to prevent evaluation bias.
      </div>
    </section>
  );
};
