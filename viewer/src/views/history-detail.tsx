import type { FC } from 'react';
import type { NormalizedHistoryRecordV1 } from '../../../src/protocol/advisor-metrics.js';
import type { HistoryRowV1 } from '../../../src/protocol/advisor-plugin-data-api.ts';
import type { HistoryDetailState } from '../app-state.js';
import { TextBlock } from '../components/text-block.js';

export interface HistoryDetailProps {
  readonly record?: NormalizedHistoryRecordV1 | HistoryRowV1 | null;
  readonly detail?: HistoryDetailState | null;
  readonly onClose: () => void;
  readonly onRefresh?: () => void;
}

export const HistoryDetail: FC<HistoryDetailProps> = ({ record, detail, onClose, onRefresh }) => {
  const consultationId = detail?.consultationId ?? record?.consultation_id ?? null;
  if (!consultationId && !record && !detail) return null;

  // Explicit drawer state: loading
  if (detail?.status === 'loading') {
    return (
      <aside className="history-detail-drawer" aria-label="Consultation Details">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h3 className="drawer-title">Consultation Detail</h3>
            <code className="drawer-id">{consultationId}</code>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close detail view">&times; Close</button>
        </div>
        <div className="drawer-content" style={{ padding: 24 }}>
          <p className="text-muted">Loading consultation detail from provider...</p>
        </div>
      </aside>
    );
  }

  // Explicit drawer state: changed
  if (detail?.status === 'changed') {
    return (
      <aside className="history-detail-drawer" aria-label="Consultation Details">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h3 className="drawer-title text-warning">Record Detail Changed</h3>
            <code className="drawer-id">{consultationId}</code>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close detail view">&times; Close</button>
        </div>
        <div className="drawer-content" style={{ padding: 24 }}>
          <div className="alert alert-warning" role="alert">
            <strong>Detail revision mismatch:</strong> The underlying consultation record was modified after this snapshot was acquired.
          </div>
          <p className="text-muted">To protect diagnostic integrity, row data is not shown as full detail after a revision mismatch.</p>
          {onRefresh && (
            <button type="button" className="btn btn-primary" onClick={onRefresh} style={{ marginTop: 12 }}>
              Refresh History
            </button>
          )}
        </div>
      </aside>
    );
  }

  // Explicit drawer state: missing
  if (detail?.status === 'missing') {
    return (
      <aside className="history-detail-drawer" aria-label="Consultation Details">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h3 className="drawer-title text-danger">Record Missing</h3>
            <code className="drawer-id">{consultationId}</code>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close detail view">&times; Close</button>
        </div>
        <div className="drawer-content" style={{ padding: 24 }}>
          <div className="alert alert-danger" role="alert">
            <strong>Record not found:</strong> This consultation is no longer available in the active history source.
          </div>
          {onRefresh && (
            <button type="button" className="btn btn-primary" onClick={onRefresh} style={{ marginTop: 12 }}>
              Refresh History
            </button>
          )}
        </div>
      </aside>
    );
  }

  // Ready detail from provider or fallback from normalized record
  const exec = detail?.execution;
  const status = exec?.status ?? record?.status ?? 'started';
  const projectId = exec?.project_id ?? record?.project_id ?? '';
  const taskRunId = exec?.task_run_id ?? record?.task_run_id ?? '';
  const startedAt = exec?.started_at ?? record?.started_at ?? Date.now();
  const elapsedMs = exec?.receipt?.elapsed_ms ?? record?.receipt_elapsed_ms ?? null;
  const checkpointDigest = exec?.checkpoint_digest ?? record?.checkpoint_digest ?? '';
  const route = exec?.route ?? record?.route ?? { backend: 'omp', model: '', effort: '' };
  const promptId = exec?.prompt_identity ?? record?.prompt_identity ?? '';
  const buildId = exec?.build_identity ?? record?.build_identity ?? '';
  const outcomeResult = detail?.outcome?.outcome ?? record?.outcome_result ?? null;
  const outcomeState = record?.outcome_state ?? (outcomeResult ? 'valid' : 'missing');
  const attempts = exec?.attempts ?? ('attempts' in (record ?? {}) ? (record as NormalizedHistoryRecordV1).attempts : []);
  const errorObj = exec?.error ?? ('error' in (record ?? {}) ? (record as NormalizedHistoryRecordV1).error : null);

  return (
    <aside className="history-detail-drawer" aria-label="Consultation Details">
      <div className="drawer-header">
        <div className="drawer-title-group">
          <h3 className="drawer-title">Consultation Detail</h3>
          <code className="drawer-id">{consultationId}</code>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close detail view">&times; Close</button>
      </div>

      <div className="drawer-content">
        <section className="drawer-section">
          <h4 className="section-label">Execution Summary</h4>
          <dl className="detail-dl">
            <dt>Status:</dt>
            <dd><span className={`badge badge-${status}`}>{status}</span></dd>
            <dt>Project ID:</dt>
            <dd><code className="id-text">{projectId}</code></dd>
            <dt>Task Run ID:</dt>
            <dd><code className="id-text">{taskRunId}</code></dd>
            <dt>Started:</dt>
            <dd>{new Date(startedAt).toLocaleString()}</dd>
            <dt>Elapsed:</dt>
            <dd>{elapsedMs !== null ? `${elapsedMs} ms` : '—'}</dd>
            <dt>Checkpoint Digest:</dt>
            <dd><code className="digest-text">{checkpointDigest}</code></dd>
          </dl>
        </section>

        <section className="drawer-section">
          <h4 className="section-label">Advisor Route</h4>
          <dl className="detail-dl">
            <dt>Backend:</dt>
            <dd><strong>{route.backend}</strong></dd>
            <dt>Model:</dt>
            <dd>{route.model}</dd>
            <dt>Effort:</dt>
            <dd>{route.effort}</dd>
            <dt>Prompt Identity:</dt>
            <dd><code>{promptId}</code></dd>
            <dt>Build Identity:</dt>
            <dd><code>{buildId}</code></dd>
          </dl>
        </section>

        <section className="drawer-section">
          <h4 className="section-label">Outcome</h4>
          <dl className="detail-dl">
            <dt>Outcome State:</dt>
            <dd><span className={`badge badge-state-${outcomeState}`}>{outcomeState}</span></dd>
            <dt>Outcome Result:</dt>
            <dd>{outcomeResult ? <span className={`badge badge-result-${outcomeResult}`}>{outcomeResult}</span> : <span className="text-muted">—</span>}</dd>
          </dl>
        </section>

        {attempts && attempts.length > 0 && (
          <section className="drawer-section">
            <h4 className="section-label">Attempts ({attempts.length})</h4>
            <div className="attempts-table-wrapper">
              <table className="attempts-table">
                <thead>
                  <tr><th>#</th><th>Model</th><th>Result</th><th>Elapsed</th></tr>
                </thead>
                <tbody>
                  {attempts.map((att, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td><code>{att.route.backend}/{att.route.model}</code></td>
                      <td><span className={`badge badge-att-${att.terminal_classification}`}>{att.terminal_classification}</span></td>
                      <td>{att.elapsed_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {errorObj && (
          <section className="drawer-section">
            <h4 className="section-label text-danger">Sanitized Error</h4>
            <TextBlock content={errorObj} label="Error Details" />
          </section>
        )}
      </div>
    </aside>
  );
};
