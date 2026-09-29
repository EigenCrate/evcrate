import type { FC } from 'react';
import type { ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';

export interface EvaluationGroupCardProps {
  readonly group: ComparableEvaluationGroup;
  readonly isSelected: boolean;
  readonly onToggleSelect: () => void;
}

/**
 * EvaluationGroupCard: Displays an aggregated comparable evaluation group with
 * rubric/input digests, case count, candidate count, human/automated score counts,
 * and an explicit Inspect Group / Hide Group toggle.
 */
export const EvaluationGroupCard: FC<EvaluationGroupCardProps> = ({
  group: g,
  isSelected,
  onToggleSelect
}) => {
  return (
    <div className={`eval-group-card ${isSelected ? 'card-selected' : ''}`}>
      <div className="group-card-header">
        <div className="group-key-line">
          <strong className="group-key-label">Comparable Key:</strong>
          <code className="key-code" title={g.key}>
            {g.key.slice(0, 16)}…
          </code>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${isSelected ? 'btn-info' : 'btn-secondary'}`}
          onClick={onToggleSelect}
          aria-expanded={isSelected}
          aria-label={`${isSelected ? 'Hide' : 'Inspect'} evaluation group ${g.key.slice(0, 8)}`}
        >
          {isSelected ? 'Hide Group' : 'Inspect Group'}
        </button>
      </div>

      <div className="group-card-body">
        <div className="digest-badges">
          <div className="digest-item">
            <span className="digest-label">Rubric:</span>{' '}
            <code className="digest-code" title={g.rubric_digest}>
              {g.rubric_digest.slice(0, 10)}…
            </code>
          </div>
          <div className="digest-item">
            <span className="digest-label">Input:</span>{' '}
            <code className="digest-code" title={g.input_digest}>
              {g.input_digest.slice(0, 10)}…
            </code>
          </div>
        </div>

        <div className="group-metrics-row">
          <div className="group-metric-item">
            <span className="metric-label">Cases:</span>{' '}
            <strong>{g.cases.length}</strong>
          </div>
          <div className="group-metric-item">
            <span className="metric-label">Candidates:</span>{' '}
            <strong>{g.responses.length}</strong>
          </div>
          <div className="group-metric-item">
            <span className="metric-label">Human Scored:</span>{' '}
            <strong>{g.human_scores.length}</strong>
          </div>
          <div className="group-metric-item">
            <span className="metric-label">Auto Scored:</span>{' '}
            <strong>{g.automated_scores.length}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
