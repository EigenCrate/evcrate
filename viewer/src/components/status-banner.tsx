import type { FC } from 'react';
import type { ViewerStatus } from '../app-state.js';
import type { HistoryMetricScanV1 } from '../../../src/protocol/advisor-metrics.js';

export interface StatusBannerProps {
  readonly status: ViewerStatus;
  readonly staleReason: string | null;
  readonly unsupportedReason: string | null;
  readonly scan: HistoryMetricScanV1 | null;
  readonly scannedAt?: number | null;
}

export const StatusBanner: FC<StatusBannerProps> = ({
  status,
  staleReason,
  unsupportedReason,
  scan,
  scannedAt
}) => {
  return (
    <aside className={`status-banner status-${status}`} role="status" aria-label="System status">
      <div className="status-main">
        {status === 'unsupported' && (
          <div className="status-message status-error">
            <strong>Unsupported Browser Capability:</strong> {unsupportedReason ?? 'File System Access API is not supported in this environment.'}
            <div className="status-hint">Please open this viewer in a modern Chromium-based browser on Linux or desktop.</div>
          </div>
        )}

        {status === 'revoked' && (
          <div className="status-message status-error">
            <strong>Context Revoked:</strong> {staleReason ?? 'Host or session authorization revoked. Prior data cleared.'}
          </div>
        )}

        {status === 'idle' && (
          <div className="status-message status-info">
            <strong>No history directory selected.</strong> Click "Choose History Directory" to inspect local advisor history.
          </div>
        )}

        {status === 'selecting' && (
          <div className="status-message status-info">
            <strong>Waiting for directory selection...</strong>
          </div>
        )}

        {status === 'scanning' && (
          <div className="status-message status-pending">
            <strong>Scanning history records...</strong> Please wait while records are parsed and validated.
          </div>
        )}

        {status === 'fresh' && (
          <div className="status-message status-success">
            <strong>Fresh Snapshot</strong> — Scanned {scan?.accepted_records ?? 0} records successfully
            {scannedAt ? ` at ${new Date(scannedAt).toLocaleTimeString()}` : ''}.
            {scan && scan.diagnostics.length > 0 && (
              <span className="status-warning-inline"> ({scan.diagnostics.length} diagnostics reported)</span>
            )}
          </div>
        )}

        {status === 'stale' && (
          <div className="status-message status-warning">
            <strong>Stale Data Retained:</strong> {staleReason ?? 'Prior snapshot retained due to scan interruption.'}
            {scan && (
              <span className="status-counts">
                {' '}(Discovered: {scan.consultations_discovered} consultations, {scan.diagnostics.length} diagnostics)
              </span>
            )}
          </div>
        )}
      </div>

      <div className="status-provenance-notice" aria-label="Privacy notice">
        <span className="notice-badge">Local Diagnostic Only</span>
        <span className="notice-text">
          Read-only local evaluation. Browser validation proves record structure only; it cannot attest Linux owner, mode, or descriptor guarantees. No credentials or arbitrary network calls leave this container.
        </span>
      </div>
    </aside>
  );
};
