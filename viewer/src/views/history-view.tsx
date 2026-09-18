import { useState, type FC } from 'react';
import type { AppState, UiHistoryFilters } from '../app-state.js';
import { selectFilteredRecords, selectSelectedRecord } from '../app-state.js';
import { PaginationControls } from '../components/pagination-controls.js';
import { HistoryDetail } from './history-detail.js';
import type { ExecutionStatus, OutcomeResult } from '../../../src/protocol/advisor-contract-runtime.js';

export interface HistoryViewProps {
  readonly state: AppState;
  readonly onSelectConsultation: (id: string | null) => void;
  readonly onSetFilters: (filters: Partial<UiHistoryFilters>) => void;
}

const PAGE_SIZE = 100;

export const HistoryView: FC<HistoryViewProps> = ({
  state,
  onSelectConsultation,
  onSetFilters
}) => {
  const [page, setPage] = useState<number>(0);
  const { snapshot, selectedConsultationId, filters } = state;

  if (!snapshot) {
    return (
      <section className="view-panel history-empty" id="panel-history" aria-label="History Records">
        <div className="empty-state-card">
          <h3>No History Loaded</h3>
          <p>Please select an advisor history directory to browse individual consultation records.</p>
        </div>
      </section>
    );
  }

  const filteredRecords = selectFilteredRecords(state);
  const totalItems = filteredRecords.length;
  const pagedRecords = filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedRecord = selectSelectedRecord(state);

  return (
    <section className="view-panel history-view" id="panel-history" aria-label="History Records">
      <div className="history-header">
        <h2 className="view-title">Consultation History ({totalItems})</h2>
        <div className="history-filters-bar" aria-label="History filters">
          <label className="filter-label">
            Status:
            <select
              className="form-select"
              value={filters.statuses?.[0] ?? ''}
              onChange={(e: { target: { value: string } }) => {
                const val = e.target.value;
                onSetFilters({ statuses: val ? [val as ExecutionStatus] : null });
                setPage(0);
              }}
            >
              <option value="">All Statuses</option>
              <option value="ADVICE_READY">ADVICE_READY</option>
              <option value="FAILED">FAILED</option>
              <option value="started">started</option>
            </select>
          </label>

          <label className="filter-label">
            Outcome:
            <select
              className="form-select"
              value={filters.outcome_results?.[0] ?? ''}
              onChange={(e: { target: { value: string } }) => {
                const val = e.target.value;
                onSetFilters({ outcome_results: val ? [val as OutcomeResult] : null });
                setPage(0);
              }}
            >
              <option value="">All Outcomes</option>
              <option value="resolved">resolved</option>
              <option value="unresolved">unresolved</option>
              <option value="regressed">regressed</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          {(filters.statuses || filters.outcome_results) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onSetFilters({ statuses: null, outcome_results: null });
                setPage(0);
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="history-content-layout">
        <div className="history-table-container">
          <table className="history-table" aria-label="Consultations list">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Route</th>
                <th scope="col">Outcome</th>
                <th scope="col">Latency</th>
                <th scope="col">ID</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted">
                    No consultation records match the active filters.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((r) => {
                  const isSelected = r.consultation_id === selectedConsultationId;
                  return (
                    <tr key={r.consultation_id} className={isSelected ? 'row-selected' : ''}>
                      <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                      <td>{new Date(r.started_at).toLocaleDateString()}</td>
                      <td><code>{r.route.backend}/{r.route.model}</code></td>
                      <td>
                        {r.outcome_result ? (
                          <span className={`badge badge-result-${r.outcome_result}`}>{r.outcome_result}</span>
                        ) : (
                          <span className="text-muted">{r.outcome_state}</span>
                        )}
                      </td>
                      <td>{r.receipt_elapsed_ms !== null ? `${r.receipt_elapsed_ms} ms` : '—'}</td>
                      <td><code className="id-cell">{r.consultation_id.slice(0, 8)}…</code></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectConsultation(isSelected ? null : r.consultation_id)}
                          aria-label={`Inspect consultation ${r.consultation_id.slice(0, 8)}`}
                        >
                          {isSelected ? 'Hide' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        </div>

        {selectedRecord && (
          <HistoryDetail
            record={selectedRecord}
            onClose={() => onSelectConsultation(null)}
          />
        )}
      </div>
    </section>
  );
};
