import type { FC } from 'react';
import type { ViewerStatus } from '../app-state.js';

export interface SourceControlsProps {
  readonly status: ViewerStatus;
  readonly historySourceLabel: string | null;
  readonly hasHistoryHandle: boolean;
  readonly onSelectHistory: () => void;
  readonly onRefreshHistory: () => void;
  readonly onCancelScan: () => void;
  readonly onSelectPolicy: () => void;
  readonly onSelectEvaluations: () => void;
}

export const SourceControls: FC<SourceControlsProps> = ({
  status,
  historySourceLabel,
  hasHistoryHandle,
  onSelectHistory,
  onRefreshHistory,
  onCancelScan,
  onSelectPolicy,
  onSelectEvaluations
}) => {
  const isScanning = status === 'scanning';
  const isSelecting = status === 'selecting';
  const isBusy = isScanning || isSelecting;

  return (
    <section className="source-controls" aria-label="Source Controls">
      <div className="source-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSelectHistory}
          disabled={isBusy}
          aria-label="Choose history directory"
        >
          {historySourceLabel ? 'Change History Directory' : 'Choose History Directory'}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefreshHistory}
          disabled={!hasHistoryHandle || isBusy}
          aria-label="Refresh history"
        >
          Refresh History
        </button>

        {isScanning && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={onCancelScan}
            aria-label="Cancel scan"
          >
            Cancel Scan
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSelectPolicy}
          disabled={isBusy}
          aria-label="Choose policy file"
        >
          Choose Policy File
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onSelectEvaluations}
          disabled={isBusy}
          aria-label="Choose evaluation files"
        >
          Choose Evaluation Files
        </button>
      </div>

      {historySourceLabel && (
        <div className="source-label" aria-live="polite">
          <span className="source-label-title">History source:</span>{' '}
          <code className="source-label-name">{historySourceLabel}</code>
        </div>
      )}
    </section>
  );
};
