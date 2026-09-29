import type { FC } from 'react';
import type { EvaluationDescriptorV1 } from '../../../src/protocol/advisor-plugin-data-api.js';

export interface EvaluationDescriptorCardProps {
  readonly descriptor: EvaluationDescriptorV1;
  readonly onInspect?: (evaluationRef: string, expectedRevision: string) => void;
}

/**
 * EvaluationDescriptorCard: Displays a single discovered evaluation descriptor with
 * metadata (revision, digest, candidate/case/observation counts) and an explicit Inspect action.
 */
export const EvaluationDescriptorCard: FC<EvaluationDescriptorCardProps> = ({
  descriptor: d,
  onInspect
}) => {
  return (
    <div className="descriptor-card">
      <div className="descriptor-card-header">
        <div className="descriptor-ref-group">
          <code className="descriptor-ref" title={d.evaluation_ref}>
            {d.evaluation_ref}
          </code>
          <span className="badge badge-secondary">Rev: {d.source_revision}</span>
        </div>
        {onInspect && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onInspect(d.evaluation_ref, d.source_revision)}
            aria-label={`Inspect descriptor ${d.evaluation_ref}`}
          >
            Inspect Descriptor
          </button>
        )}
      </div>

      <div className="descriptor-card-body">
        <div className="card-field">
          <span className="field-label">Digest:</span>
          <code className="id-code" title={d.source_digest}>
            {d.source_digest.slice(0, 12)}…
          </code>
        </div>
        <div className="card-field">
          <span className="field-label">Counts:</span>
          <span className="field-value">
            <strong>{d.candidate_count}</strong> candidates &bull;{' '}
            <strong>{d.case_count}</strong> cases &bull;{' '}
            <strong>{d.observation_count}</strong> observations
          </span>
        </div>
        <div className="card-field">
          <span className="field-label">Created:</span>
          <span className="text-muted stat-sub">
            {new Date(d.created_at).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
