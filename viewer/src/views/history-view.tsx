import { useEffect, useState, type FC } from 'react';
import type { AppState, UiHistoryFilters } from '../app-state.js';
import { selectFilteredRecords, selectSelectedRow, formatProjectName } from '../app-state.js';
import { PaginationControls } from '../components/pagination-controls.js';
import { HistoryDetail } from './history-detail.js';
import type { ExecutionStatus, OutcomeResult } from '../../../src/protocol/advisor-contract-runtime.js';

export interface HistoryViewProps {
  readonly state: AppState;
  readonly onSelectConsultation: (id: string | null, recordRef?: string) => void;
  readonly onSetFilters: (filters: Partial<UiHistoryFilters>) => void;
  readonly onRefresh?: () => void;
  readonly onPageRequest: (cursor: string | null) => Promise<boolean>;
  readonly loading: boolean;
  readonly contextKey: string;
  readonly loadError: string | null;
}

const PAGE_SIZE = 100;

export const HistoryView: FC<HistoryViewProps> = ({
  state,
  onSelectConsultation,
  onSetFilters,
  onRefresh,
  onPageRequest,
  loading,
  contextKey,
  loadError
}) => {
  const [page, setPage] = useState<number>(0);
  const [cursorHistory, setCursorHistory] = useState<readonly (string | null)[]>([null]);
  const { snapshot, selectedConsultationId, filters, historyPageEntries, historyPage, historySummary, historyDetail } = state;
  const serverPagination = state.providerKind === 'dam-hopper';
  const hasHistory = snapshot !== null || historySummary !== null || historyPageEntries.length > 0;

  useEffect(() => {
    setPage(0);
    setCursorHistory([null]);
  }, [contextKey, filters]);

  if (!hasHistory) {
    return (
      <section className="view-panel history-empty" id="panel-history" aria-label="History Records">
        <div className="empty-state-card">
          <h3>No History Loaded</h3>
          <p>Click "Refresh History" to load consultation records from the active workspace.</p>
        </div>
      </section>
    );
  }

  const localRecords = serverPagination ? [] : selectFilteredRecords(state);
  const totalItems = loading || loadError !== null ? 0 : serverPagination
    ? (historySummary?.metrics.counts.consultations ?? 0)
    : localRecords.length;
  const records = loading || loadError !== null
    ? []
    : serverPagination
      ? historyPageEntries
      : localRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedRecord = selectSelectedRow(state);
  const changePage = async (newPage: number) => {
    if (loading || loadError !== null || newPage < 0 || newPage === page) return;
    const cursor = newPage < page
      ? cursorHistory[newPage] ?? null
      : historyPage?.next_cursor ?? null;
    if (serverPagination && newPage > page && cursor === null) return;
    if (!serverPagination) {
      setPage(newPage);
      return;
    }
    if (!(await onPageRequest(cursor))) return;
    if (newPage > page && cursor !== null) {
      setCursorHistory((history) => [...history.slice(0, page + 1), cursor]);
    }
    setPage(newPage);
  };

  return (
    <section className="view-panel history-view" id="panel-history" aria-label="History Records">
      <div className="history-header">
        <h2 className="view-title">Consultation History ({totalItems})</h2>
        <div className="history-filters-bar" aria-label="History filters">
          {state.historySummary?.metrics.scope.kind === 'project' ? (
            <label className="filter-label">
              Project:
              <select className="form-select" disabled aria-label="Current project">
                <option value="">
                  {formatProjectName(state.historySummary.metrics.scope.project_ids[0] ?? state.inventory?.entries[0]?.project_id ?? 'Current Project', state.inventory?.entries[0]?.label)} ({state.historySummary.metrics.counts.consultations})
                </option>
              </select>
            </label>
          ) : (state.inventory && state.inventory.total_projects > 0) && (
            <label className="filter-label">
              Project:
              <select
                className="form-select"
                aria-label="Filter by project"
                value={filters.project_id ?? ''}
                onChange={(e: { target: { value: string } }) => {
                  const val = e.target.value;
                  onSetFilters({ project_id: val ? val : null });
                  setPage(0);
                  setCursorHistory([null]);
                }}
              >
                <option value="">All Projects ({state.inventory.unfiltered_total_records})</option>
                {state.inventory.entries.map((entry) => (
                  <option key={entry.project_id} value={entry.project_id}>
                    {formatProjectName(entry.project_id, entry.label)} ({entry.count})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="filter-label">
            Status:
            <select
              className="form-select"
              value={filters.statuses?.[0] ?? ''}
              onChange={(e: { target: { value: string } }) => {
                const val = e.target.value;
                onSetFilters({ statuses: val ? [val as ExecutionStatus] : null });
                setPage(0);
                setCursorHistory([null]);
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
                setCursorHistory([null]);
              }}
            >
              <option value="">All Outcomes</option>
              <option value="resolved">resolved</option>
              <option value="unresolved">unresolved</option>
              <option value="regressed">regressed</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          {(filters.project_id || filters.statuses || filters.outcome_results) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                onSetFilters({ project_id: null, statuses: null, outcome_results: null });
                setPage(0);
                setCursorHistory([null]);
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
                <th scope="col">Project</th>
                <th scope="col">Route</th>
                <th scope="col">Outcome</th>
                <th scope="col">Latency</th>
                <th scope="col">ID</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading || loadError !== null ? (
                <tr><td colSpan={8} className="text-center text-muted">{loadError ?? 'Loading consultation records…'}</td></tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted">
                    No consultation records match the active filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const isSelected = r.consultation_id === selectedConsultationId;
                  const recordRef = 'record_ref' in r ? r.record_ref : r.consultation_id;
                  const rowKey = 'record_ref' in r && r.record_ref ? r.record_ref : `${r.project_id}:${r.consultation_id}`;
                  const projectEntry = state.inventory?.entries.find((e) => e.project_id === r.project_id);
                  const projectLabel = formatProjectName(r.project_id, projectEntry?.label);
                  return (
                    <tr key={rowKey} className={isSelected ? 'row-selected' : ''}>
                      <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                      <td>{new Date(r.started_at).toLocaleString()}</td>
                      <td>
                        <span className="project-cell" title={r.project_id}>
                          {projectLabel}
                        </span>
                      </td>
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
                          onClick={() => onSelectConsultation(isSelected ? null : r.consultation_id, recordRef)}
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
            onPageChange={(nextPage) => { void changePage(nextPage); }}
          />
        </div>

        {(selectedRecord || historyDetail?.status !== 'idle') && (() => {
          const selectedProjectId = selectedRecord?.project_id ?? historyDetail?.execution?.project_id;
          const projectEntry = selectedProjectId ? state.inventory?.entries.find((e) => e.project_id === selectedProjectId) : undefined;
          const resolvedProjectName = projectEntry ? formatProjectName(projectEntry.project_id, projectEntry.label) : (selectedProjectId ? formatProjectName(selectedProjectId, null) : null);
          return (
            <HistoryDetail
              record={selectedRecord}
              detail={historyDetail}
              projectName={resolvedProjectName}
              onClose={() => onSelectConsultation(null)}
              onRefresh={onRefresh}
            />
          );
        })()}
      </div>
    </section>
  );
};
