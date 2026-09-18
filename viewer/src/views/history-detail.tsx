import type { FC } from 'react';
import type { NormalizedHistoryRecordV1 } from '../../../src/protocol/advisor-metrics.js';
import { TextBlock } from '../components/text-block.js';

export interface HistoryDetailProps {
  readonly record: NormalizedHistoryRecordV1 | null;
  readonly onClose: () => void;
}

export const HistoryDetail: FC<HistoryDetailProps> = ({ record, onClose }) => {
  if (!record) return null;

  return (
    <aside className="history-detail-drawer" aria-label="Consultation Details">
      <div className="drawer-header">
        <div className="drawer-title-group">
          <h3 className="drawer-title">Consultation Detail</h3>
          <code className="drawer-id">{record.consultation_id}</code>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          aria-label="Close detail view"
        >
          &times; Close
        </button>
      </div>

      <div className="drawer-content">
        <section className="drawer-section">
          <h4 className="section-label">Execution Summary</h4>
          <dl className="detail-dl">
            <dt>Status:</dt>
            <dd><span className={`badge badge-${record.status}`}>{record.status}</span></dd>
            <dt>Project ID:</dt>
            <dd><code className="id-text">{record.project_id}</code></dd>
            <dt>Task Run ID:</dt>
            <dd><code className="id-text">{record.task_run_id}</code></dd>
            <dt>Started:</dt>
            <dd>{new Date(record.started_at).toLocaleString()}</dd>
            <dt>Elapsed:</dt>
            <dd>{record.receipt_elapsed_ms !== null ? `${record.receipt_elapsed_ms} ms` : '—'}</dd>
            <dt>Checkpoint Digest:</dt>
            <dd><code className="digest-text">{record.checkpoint_digest}</code></dd>
            <dt>Relative Path:</dt>
            <dd><span className="inert-path">{record.source.relative_path}</span></dd>
          </dl>
        </section>

        <section className="drawer-section">
          <h4 className="section-label">Advisor Route</h4>
          <dl className="detail-dl">
            <dt>Backend:</dt>
            <dd><strong>{record.route.backend}</strong></dd>
            <dt>Model:</dt>
            <dd>{record.route.model}</dd>
            <dt>Effort:</dt>
            <dd>{record.route.effort}</dd>
            <dt>Prompt Identity:</dt>
            <dd><code>{record.prompt_identity}</code></dd>
            <dt>Build Identity:</dt>
            <dd><code>{record.build_identity}</code></dd>
          </dl>
        </section>

        <section className="drawer-section">
          <h4 className="section-label">Outcome</h4>
          <dl className="detail-dl">
            <dt>Outcome State:</dt>
            <dd><span className={`badge badge-state-${record.outcome_state}`}>{record.outcome_state}</span></dd>
            <dt>Outcome Result:</dt>
            <dd>
              {record.outcome_result ? (
                <span className={`badge badge-result-${record.outcome_result}`}>{record.outcome_result}</span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </dd>
          </dl>
        </section>

        {record.attempts.length > 0 && (
          <section className="drawer-section">
            <h4 className="section-label">Attempts ({record.attempts.length})</h4>
            <div className="attempts-table-wrapper">
              <table className="attempts-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Model</th>
                    <th>Result</th>
                    <th>Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {record.attempts.map((att, idx) => (
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

        {record.error && (
          <section className="drawer-section">
            <h4 className="section-label text-danger">Sanitized Error</h4>
            <TextBlock content={record.error} label="Error Details" />
          </section>
        )}
      </div>
    </aside>
  );
};
