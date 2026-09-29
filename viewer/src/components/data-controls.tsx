/**
 * @file data-controls.tsx
 * Provider-neutral data controls for refresh and cancellation in Advisor Plugin.
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
  readonly observedAt?: number | null;
}

export const DataControls: FC<DataControlsProps> = ({
  status,
  sourceLabel,
  isAvailable,
  onRefresh,
  onCancel,
  observedAt
}) => {
  const isScanning = status === 'scanning';
  const isSelecting = status === 'selecting';
  const isBusy = isScanning || isSelecting;

  return (
    <section className="source-controls data-controls" aria-label="Data Controls">
      <div className="source-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={isBusy || !isAvailable}
          aria-label="Refresh history"
        >
          {isScanning ? 'Refreshing...' : 'Refresh History'}
        </button>

        {isScanning && (
          <button
            type="button"
            className="btn btn-secondary btn-cancel"
            onClick={onCancel}
            aria-label="Cancel scan"
          >
            Cancel
          </button>
        )}
      </div>

      {(sourceLabel || observedAt) && (
        <div className="source-metadata" aria-live="polite">
          {sourceLabel && (
            <div className="source-label" title={sourceLabel}>
              <span className="source-label-prefix text-muted">Source: </span>
              <span className="source-label-name">{sourceLabel}</span>
            </div>
          )}
          {observedAt && (
            <div className="source-observed-at text-muted">
              Updated: {new Date(observedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
