import type { FC } from 'react';

export interface PaginationControlsProps {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly onPageChange: (newPage: number) => void;
}

export const PaginationControls: FC<PaginationControlsProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalItems);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  if (totalItems <= pageSize) {
    return (
      <div className="pagination-summary" aria-label="Pagination">
        <span>Showing all {totalItems} items</span>
      </div>
    );
  }

  return (
    <nav className="pagination-controls" aria-label="Pagination Navigation">
      <div className="pagination-info">
        <span>Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of <strong>{totalItems}</strong> records</span>
      </div>

      <div className="pagination-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!hasPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          &larr; Previous
        </button>

        <span className="pagination-current-page" aria-current="page">
          Page {page + 1} of {totalPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next &rarr;
        </button>
      </div>
    </nav>
  );
};
