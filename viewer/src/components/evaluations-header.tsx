import type { FC } from 'react';
import type { BoundSourceStatus } from '../app-state-types.js';

export interface EvaluationsHeaderProps {
  readonly descriptorsCount: number;
  readonly groupsCount: number;
  readonly listStatus: string;
   readonly comparisonStatus?: BoundSourceStatus;
  readonly comparisonError?: string | null;
   readonly isComparing: boolean;
   readonly revealCandidates: boolean;
   readonly onCompare: () => void;
   readonly onRevealChange: (reveal: boolean) => void;
 }

/**
 * EvaluationsHeader: Displays bound evaluation source info, list & comparison statuses,
 * accurate descriptor/group count summary, and primary actions (compare, reveal candidates).
 * Invariant: Never refers to raw descriptor count as comparison groups before comparison.
 */
export const EvaluationsHeader: FC<EvaluationsHeaderProps> = ({
  descriptorsCount,
  groupsCount,
  listStatus,
   comparisonStatus,
  comparisonError,
   isComparing,
   revealCandidates,
   onCompare,
   onRevealChange
 }) => {
  const summaryHeader = groupsCount > 0
    ? `Counsel Evaluations (${groupsCount} comparable group${groupsCount === 1 ? '' : 's'})`
    : `Counsel Evaluations (${descriptorsCount} descriptor${descriptorsCount === 1 ? '' : 's'})`;

  const summaryDescription = groupsCount > 0
    ? `${descriptorsCount} descriptor${descriptorsCount === 1 ? '' : 's'} available • ${groupsCount} comparable evaluation group${groupsCount === 1 ? '' : 's'} formed from matching rubric and input digests.`
    : `${descriptorsCount} evaluation descriptor${descriptorsCount === 1 ? '' : 's'} discovered from bound source. Click "Compare Available Descriptors" to group by matching rubric and input digests.`;

  return (
    <div className="evaluations-header">
      <div className="evaluations-header-main">
        <h2 className="view-title">{summaryHeader}</h2>
        <div className="evaluations-badge-row">
          <span className="badge badge-info">Bound evaluation source — not filtered by History project</span>
          <span className="badge badge-secondary">List: {listStatus}</span>
          {comparisonStatus && comparisonStatus !== 'idle' && (
            <span
              className={`badge ${
                comparisonStatus === 'ready'
                  ? 'badge-success'
                  : comparisonStatus === 'error'
                  ? 'badge-danger'
                  : 'badge-warning'
              }`}
            >
              Comparison: {comparisonStatus}
            </span>
          )}
        </div>
        <p className="text-muted descriptor-summary">{summaryDescription}</p>
        {comparisonStatus === 'error' && comparisonError && (
          <div className="comparison-error-banner alert alert-danger" role="alert" style={{ marginTop: 6 }}>
            <strong>Comparison error:</strong> {comparisonError}
          </div>
        )}
      </div>

      <div className="evaluations-controls">
        <div className="compare-action-group">
          <button
            type="button"
            className="btn btn-primary"
            disabled={isComparing || descriptorsCount === 0}
            onClick={onCompare}
            aria-label="Compare available descriptors (maximum 32)"
          >
            {isComparing ? 'Comparing Descriptors…' : 'Compare Available Descriptors'}
          </button>
          <span className="text-muted compare-limit-hint">(Max 32 bounded items)</span>
        </div>

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
  );
};
