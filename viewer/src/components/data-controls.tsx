/**
 * @file data-controls.tsx
 * Provider-neutral data controls for refresh, cancellation, and source selection.
 */

import type { FC } from 'react';
import type { ViewerStatus } from '../app-state.js';
import type { ProviderKind } from '../providers/advisor-data-provider.ts';

export interface DataControlsProps {
  readonly status: ViewerStatus;
  readonly providerKind: ProviderKind;
  readonly sourceLabel: string | null;
  readonly isAvailable: boolean;
  readonly onRefresh: () => void;
  readonly onCancel: () => void;
  readonly onSelectHistory?: () => void;
  readonly onSelectPolicy?: () => void;
  readonly onSelectEvaluations?: () => void;
}

export const DataControls: FC<DataControlsProps> = ({
  status,
  providerKind,
  sourceLabel,
  isAvailable,
  onRefresh,
  onCancel,
  onSelectHistory,
  onSelectPolicy,
  onSelectEvaluations
}) => {
  const isScanning = status === 'scanning';
  const isSelecting = status === 'selecting';
  const isBusy = isScanning || isSelecting;

  return (
    <section className="source-controls data-controls" aria-label="Data Controls">
      <div className="source-actions">
        {providerKind === 'standalone' && onSelectHistory && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSelectHistory}
            disabled={isBusy}
            aria-label="Choose history directory"
          >
            {sourceLabel ? 'Change History Directory' : 'Choose History Directory'}
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={!isAvailable || isBusy}
          aria-label="Refresh history"
        >
          Refresh History
        </button>

        {isScanning && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={onCancel}
            aria-label="Cancel scan"
          >
            Cancel Scan
          </button>
        )}

        {providerKind === 'standalone' && onSelectPolicy && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSelectPolicy}
            disabled={isBusy}
            aria-label="Choose policy file"
          >
            Choose Policy File
          </button>
        )}

        {providerKind === 'standalone' && onSelectEvaluations && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSelectEvaluations}
            disabled={isBusy}
            aria-label="Choose evaluation files"
          >
            Choose Evaluation Files
          </button>
        )}
      </div>

      {sourceLabel && (
        <div className="source-label" aria-live="polite">
          <span className="source-label-title">
            {providerKind === 'dam-hopper' ? 'Target:' : 'History source:'}
          </span>{' '}
          <code className="source-label-name">{sourceLabel}</code>
        </div>
      )}
    </section>
  );
};
