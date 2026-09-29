import type { AppState, UiHistoryFilters } from './app-state-types.ts';
import type { NormalizedHistoryRecordV1, HistoryMetricFiltersV1 } from '../../src/protocol/advisor-metrics.js';
import type { HistoryRowV1, HistorySummaryQueryV2 } from '../../src/protocol/advisor-plugin-data-api.ts';
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export type HistoryQueryResult =
  | { readonly available: true; readonly query: HistorySummaryQueryV2; readonly reason: null }
  | { readonly available: false; readonly query: null; readonly reason: string };

export function selectHistoryQuery(state: AppState): HistoryQueryResult {
  if (state.status === 'revoked' || !state.isAvailable) {
    return { available: false, query: null, reason: 'Provider is revoked or unavailable' };
  }

  const ctx = state.workspaceContext;
  if (!ctx || !ctx.project || typeof ctx.project.projectId !== 'string') {
    return { available: false, query: null, reason: 'No admitted Workspace project context' };
  }

  const projectId = ctx.project.projectId.trim();
  if (!SHA256_HEX_PATTERN.test(projectId)) {
    return { available: false, query: null, reason: 'Unresolved Workspace project ID' };
  }

  if (ctx.historyScope === 'unavailable') {
    return { available: false, query: null, reason: 'History access is unavailable' };
  }

  const hasHistoryPerm = ctx.allowedOperations
    ? ctx.allowedOperations.includes('history.refresh')
    : (state.capabilities.length === 0 || state.capabilities.includes('history.refresh'));
  if (!hasHistoryPerm) {
    return { available: false, query: null, reason: 'history.refresh operation is not permitted' };
  }

  if (state.activityScope === 'all') {
    if (ctx.historyScope !== 'history-root') {
      return { available: false, query: null, reason: 'All history requires root history authority' };
    }
    return {
      available: true,
      query: {
        project_id: null,
        task_run_id: state.filters.task_run_id,
        filters: extractDomainFilters(state.filters)
      },
      reason: null
    };
  }

  // Workspace project scope
  return {
    available: true,
    query: {
      project_id: projectId,
      task_run_id: state.filters.task_run_id,
      filters: extractDomainFilters(state.filters)
    },
    reason: null
  };
}

export function selectFilteredRecords(
  state: AppState
): readonly (NormalizedHistoryRecordV1 | HistoryRowV1)[] {
  if (state.snapshot) {
    const { records } = state.snapshot;
    const { filters } = state;
    const activeProjectId = state.activityScope === 'all'
      ? null
      : (state.workspaceContext?.project?.projectId ?? state.snapshot.scope?.selected_project_id ?? null);
    return records.filter((r) => {
      if (activeProjectId && r.project_id !== activeProjectId) return false;
      if (filters.task_run_id && r.task_run_id !== filters.task_run_id) return false;
      if (filters.statuses && !filters.statuses.includes(r.status)) return false;
      if (filters.outcome_states && !filters.outcome_states.includes(r.outcome_state)) return false;
      if (
        filters.outcome_results &&
        (!r.outcome_result || !filters.outcome_results.includes(r.outcome_result))
      )
        return false;
      if (filters.backends && !filters.backends.includes(r.route.backend)) return false;
      if (filters.models && !filters.models.includes(r.route.model)) return false;
      if (filters.efforts && !filters.efforts.includes(r.route.effort)) return false;
      if (filters.prompt_identities && !filters.prompt_identities.includes(r.prompt_identity))
        return false;
      if (filters.build_identities && !filters.build_identities.includes(r.build_identity))
        return false;
      if (filters.started_at_from !== null && r.started_at < filters.started_at_from) return false;
      if (filters.started_at_to !== null && r.started_at > filters.started_at_to) return false;
      return true;
    });
  }

  if (state.historyPageEntries.length > 0) {
    return state.historyPageEntries;
  }

  return [];
}

export function selectSelectedRecord(
  state: AppState
): NormalizedHistoryRecordV1 | null {
  if (!state.selectedConsultationId || !state.snapshot) return null;
  return (
    state.snapshot.records.find(
      (r) => r.consultation_id === state.selectedConsultationId
    ) ?? null
  );
}

export function selectSelectedRow(
  state: AppState
): NormalizedHistoryRecordV1 | HistoryRowV1 | null {
  if (!state.selectedConsultationId) return null;
  if (state.snapshot) {
    const found = state.snapshot.records.find(
      (r) => r.consultation_id === state.selectedConsultationId
    );
    if (found) return found;
  }
  return (
    state.historyPageEntries.find(
      (r) => r.consultation_id === state.selectedConsultationId
    ) ?? null
  );
}

export function extractDomainFilters(filters: UiHistoryFilters): HistoryMetricFiltersV1 {
  return {
    statuses: filters.statuses,
    outcome_states: filters.outcome_states,
    outcome_results: filters.outcome_results,
    backends: filters.backends,
    models: filters.models,
    efforts: filters.efforts,
    prompt_identities: filters.prompt_identities,
    build_identities: filters.build_identities,
    started_at_from: filters.started_at_from,
    started_at_to: filters.started_at_to
  };
};

export function extractDomainQuery(
  filters: UiHistoryFilters,
  projectId: string | null = null
): HistorySummaryQueryV2 {
  return {
    project_id: projectId,
    task_run_id: filters.task_run_id,
    filters: extractDomainFilters(filters)
  };
}

export function formatProjectName(projectId: string, label?: string | null): string {
  if (label && label.trim().length > 0) {
    return label.trim();
  }
  return projectId.length > 8 ? `${projectId.slice(0, 8)}…` : projectId;
}

export function formatRatioPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Unavailable';
  return `${(value * 100).toFixed(1)}%`;
}
