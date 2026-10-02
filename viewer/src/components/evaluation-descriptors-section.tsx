import { useState, useMemo, type FC } from 'react';
import type { EvaluationDescriptorV1 } from '../../../src/protocol/advisor-data-api.js';
import { EvaluationDescriptorCard } from './evaluation-descriptor-card.js';
import { PaginationControls } from './pagination-controls.js';

export interface EvaluationDescriptorsSectionProps {
  readonly descriptors: readonly EvaluationDescriptorV1[];
  readonly onInspect?: (evaluationRef: string, expectedRevision: string) => void;
  readonly pageSize?: number;
}

/**
 * EvaluationDescriptorsSection: Paginated listing of available evaluation descriptors
 * discovered from the bound evaluation source.
 */
export const EvaluationDescriptorsSection: FC<EvaluationDescriptorsSectionProps> = ({
  descriptors,
  onInspect,
  pageSize = 10
}) => {
  const [page, setPage] = useState<number>(0);

  const maxPage = Math.max(0, Math.ceil(descriptors.length / pageSize) - 1);
  const safePage = Math.min(page, maxPage);

  const paginatedDescriptors = useMemo(() => {
    const start = safePage * pageSize;
    return descriptors.slice(start, start + pageSize);
  }, [descriptors, safePage, pageSize]);

  if (descriptors.length === 0) return null;

  return (
    <div className="descriptors-section">
      <div className="descriptors-header">
        <h3 className="section-subtitle">
          Available Descriptors <span className="badge badge-secondary">{descriptors.length}</span>
        </h3>
      </div>

      <div className="descriptors-cards-list" aria-label="Available descriptors">
        {paginatedDescriptors.map((d) => (
          <EvaluationDescriptorCard
            key={d.evaluation_ref}
            descriptor={d}
            onInspect={onInspect}
          />
        ))}
      </div>

      {descriptors.length > pageSize && (
        <PaginationControls
          page={safePage}
          pageSize={pageSize}
          totalItems={descriptors.length}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};
