import type { FC } from 'react';
import type { ScanDiagnostic } from '../../../src/protocol/advisor-metrics.js';

export interface DiagnosticPanelProps {
  readonly diagnostics: readonly ScanDiagnostic[];
  readonly suppressedCount?: number;
}

export const DiagnosticPanel: FC<DiagnosticPanelProps> = ({
  diagnostics,
  suppressedCount = 0
}) => {
  if (diagnostics.length === 0 && suppressedCount === 0) {
    return (
      <div className="diagnostic-panel-empty">
        <p className="text-muted">No scan diagnostics recorded. All scanned records conformed to schema.</p>
      </div>
    );
  }

  return (
    <div className="diagnostic-panel" aria-label="Scan diagnostics">
      <div className="diagnostic-header">
        <h4 className="diagnostic-title">
          Scan Diagnostics ({diagnostics.length}
          {suppressedCount > 0 ? ` + ${suppressedCount} suppressed` : ''})
        </h4>
        {suppressedCount > 0 && (
          <p className="diagnostic-warning">
            Note: {suppressedCount} additional diagnostic entries were suppressed due to budget limits.
          </p>
        )}
      </div>

      <div className="diagnostic-table-wrapper">
        <table className="diagnostic-table">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Relative Path</th>
              <th scope="col">Project ID</th>
              <th scope="col">Bytes</th>
              <th scope="col">Version</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((diag, index) => (
              <tr key={`${diag.code}-${diag.relative_path ?? ''}-${index}`}>
                <td>
                  <code className="diagnostic-code">{diag.code}</code>
                </td>
                <td>
                  <span className="diagnostic-path">{diag.relative_path ?? '—'}</span>
                </td>
                <td>
                  <code className="diagnostic-id">{diag.project_id ? `${diag.project_id.slice(0, 12)}…` : '—'}</code>
                </td>
                <td>{diag.bytes !== null ? `${diag.bytes} B` : '—'}</td>
                <td>{diag.observed_schema_version ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
