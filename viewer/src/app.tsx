import { useReducer, useRef, useEffect, useCallback, type FC } from 'react';
import { appReducer, INITIAL_STATE, extractDomainFilters, type UiHistoryFilters } from './app-state.js';
import { getCurrentHashView, setWindowHash, type HashView } from './hash-view.js';
import type { AdvisorDataProvider } from './providers/advisor-data-provider.ts';
import { StandalonePickerProvider } from './providers/standalone-picker-provider.ts';
import { DataControls } from './components/data-controls.js';
import { StatusBanner } from './components/status-banner.js';
import { HashTabs } from './components/hash-tabs.js';
import { DiagnosticPanel } from './components/diagnostic-panel.js';
import { OverviewView } from './views/overview-view.js';
import { HistoryView } from './views/history-view.js';
import { ConfigurationView } from './views/configuration-view.js';
import { EvaluationsView } from './views/evaluations-view.js';

export interface AppProps { readonly provider?: AdvisorDataProvider; }

export const App: FC<AppProps> = ({ provider }) => {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const defaultProviderRef = useRef<AdvisorDataProvider | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  if (!defaultProviderRef.current) defaultProviderRef.current = provider ?? new StandalonePickerProvider();
  const activeProvider = provider ?? defaultProviderRef.current;

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.showDirectoryPicker !== 'function' && activeProvider.descriptor.kind === 'standalone') {
      dispatch({ type: 'CAPABILITY_UNSUPPORTED', reason: 'The File System Access API is not supported in this browser.' });
    }
    const unsub = activeProvider.subscribe((event) => {
      if (event.type === 'ready' || event.type === 'context-changed') {
        const t = event.type === 'ready' ? 'PROVIDER_READY' : 'CONTEXT_CHANGED';
        dispatch({ type: t, providerKind: event.descriptor.kind, label: event.descriptor.label, capabilities: event.descriptor.capabilities, frameSession: event.descriptor.frameSession, activationGeneration: event.descriptor.activationGeneration } as any);
      } else if (event.type === 'revoked') dispatch({ type: 'CONTEXT_REVOKED', reason: event.reason });
      else if (event.type === 'availability-changed') dispatch({ type: 'AVAILABILITY_CHANGED', available: event.available, capabilities: event.capabilities });
    });
    const d = activeProvider.descriptor;
    dispatch({ type: 'PROVIDER_READY', providerKind: d.kind, label: d.label, capabilities: d.capabilities, frameSession: d.frameSession, activationGeneration: d.activationGeneration });
    const onHash = () => dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    window.addEventListener('hashchange', onHash);
    dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    return () => { unsub(); window.removeEventListener('hashchange', onHash); };
  }, [activeProvider]);

  const refreshData = useCallback(async () => {
    const reqId = `req-${Date.now()}`;
    activeRequestIdRef.current = reqId;
    const gen = state.generation + 1;
    dispatch({ type: 'HISTORY_REFRESH_START', generation: gen, frameSession: state.frameSession });
    try {
      const res = await activeProvider.refreshHistory(reqId);
      const snapshot = activeProvider instanceof StandalonePickerProvider ? activeProvider.currentSnapshot ?? undefined : undefined;
      dispatch({ type: 'HISTORY_REFRESH_COMMIT', generation: gen, frameSession: state.frameSession, result: res, snapshot });
      if (res.snapshot_id) {
        const query = { task_run_id: state.filters.task_run_id, filters: extractDomainFilters(state.filters) };
        const summary = await activeProvider.getHistorySummary(`sum-${Date.now()}`, res.snapshot_id, query);
        dispatch({ type: 'HISTORY_SUMMARY_COMMIT', generation: gen, frameSession: state.frameSession, summary });
        const page = await activeProvider.getHistoryPage(`page-${Date.now()}`, res.snapshot_id, query, 'started_at_desc', null, 100);
        dispatch({ type: 'HISTORY_PAGE_COMMIT', generation: gen, frameSession: state.frameSession, page });
      }
    } catch {
      dispatch({ type: 'SCAN_STALE', generation: gen, reason: 'Failed to refresh history' });
    }
    if (activeProvider.descriptor.hasPolicySource || activeProvider.descriptor.capabilities.includes('policy.readCurrent')) {
      try { dispatch({ type: 'POLICY_COMMIT', policy: await activeProvider.readCurrentPolicy(`pol-${Date.now()}`) }); } catch {}
    }
    if (activeProvider.descriptor.hasEvaluationSource || activeProvider.descriptor.capabilities.includes('evaluations.list')) {
      try { dispatch({ type: 'EVALUATIONS_LIST_COMMIT', list: await activeProvider.listEvaluations(`eval-${Date.now()}`, null, 100) }); } catch {}
    }
  }, [activeProvider, state.generation, state.frameSession, state.filters]);

  const handleSetFilters = useCallback(async (filters: Partial<UiHistoryFilters>) => {
    dispatch({ type: 'SET_FILTERS', filters });
    if (state.providerKind === 'dam-hopper' && state.snapshotId) {
      const merged = { ...state.filters, ...filters };
      const q = { task_run_id: merged.task_run_id, filters: extractDomainFilters(merged) };
      try {
        const [sum, pg] = await Promise.all([
          activeProvider.getHistorySummary(`sum-${Date.now()}`, state.snapshotId, q),
          activeProvider.getHistoryPage(`page-${Date.now()}`, state.snapshotId, q, 'started_at_desc', null, 100)
        ]);
        dispatch({ type: 'HISTORY_SUMMARY_COMMIT', generation: state.generation, frameSession: state.frameSession, summary: sum });
        dispatch({ type: 'HISTORY_PAGE_COMMIT', generation: state.generation, frameSession: state.frameSession, page: pg });
      } catch {}
    }
  }, [activeProvider, state.providerKind, state.snapshotId, state.filters, state.generation, state.frameSession]);

  const handleSelectHistory = useCallback(async () => {
    if (activeProvider instanceof StandalonePickerProvider) {
      dispatch({ type: 'SELECT_START' });
      try {
        const ok = await activeProvider.promptSelectHistory();
        if (ok) await refreshData();
        else if (state.status === 'selecting') dispatch({ type: 'SCAN_CANCEL', generation: state.generation });
      } catch {
        dispatch({ type: 'SCAN_STALE', generation: state.generation, reason: 'Failed to obtain directory handle' });
      }
    }
  }, [activeProvider, refreshData, state.status, state.generation]);

  const handleSelectConsultation = useCallback(async (id: string | null, recordRef?: string) => {
    dispatch({ type: 'SELECT_CONSULTATION', consultationId: id, recordRef });
    if (!id || !state.snapshotId) return;
    const ref = recordRef ?? id;
    dispatch({ type: 'HISTORY_DETAIL_START', recordRef: ref, consultationId: id });
    try {
      const detail = await activeProvider.getHistoryDetail(`det-${Date.now()}`, state.snapshotId, ref);
      dispatch({ type: 'HISTORY_DETAIL_COMMIT', result: detail, consultationId: id });
    } catch (err: unknown) {
      dispatch({ type: 'HISTORY_DETAIL_ERROR', recordRef: ref, consultationId: id, error: String(err) });
    }
  }, [activeProvider, state.snapshotId]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <h1 className="brand-title">EVCrate Advisor Metrics Explorer</h1>
          <p className="brand-subtitle text-muted">{state.providerKind === 'dam-hopper' ? 'Embedded Plugin Container' : 'Private Diagnostic & Verification Viewer'}</p>
        </div>
        <DataControls
          status={state.status} providerKind={state.providerKind} sourceLabel={state.historySourceLabel} isAvailable={state.isAvailable}
          onRefresh={refreshData}
          onCancel={() => { if (activeRequestIdRef.current) activeProvider.cancel(activeRequestIdRef.current); }}
          onSelectHistory={handleSelectHistory}
          onSelectPolicy={async () => { if (activeProvider instanceof StandalonePickerProvider) dispatch({ type: 'SET_POLICY', result: await activeProvider.promptSelectPolicy() }); }}
          onSelectEvaluations={async () => { if (activeProvider instanceof StandalonePickerProvider) dispatch({ type: 'SET_EVALUATIONS', results: await activeProvider.promptSelectEvaluations() }); }}
        />
      </header>

      <StatusBanner status={state.status} staleReason={state.staleReason} unsupportedReason={state.unsupportedReason} scan={state.scan} scannedAt={state.snapshot?.scannedAt} />
      <HashTabs activeView={state.activeView} onSelectView={(v) => { setWindowHash(v); dispatch({ type: 'SET_VIEW', view: v }); }}
        counts={{ historyRecords: state.snapshot?.records.length ?? state.historyPageEntries.length, evaluationDocs: state.evaluationResults.filter((r) => r.status === 'EVALUATION_READY').length || (state.evaluationsList?.items.length ?? 0) }} />

      <main className="app-main" id="main-content" tabIndex={-1}>
        {state.activeView === 'overview' && <OverviewView state={state} />}
        {state.activeView === 'history' && <HistoryView state={state} onSelectConsultation={handleSelectConsultation} onSetFilters={handleSetFilters} onRefresh={refreshData} />}
        {state.activeView === 'configuration' && <ConfigurationView state={state} />}
        {state.activeView === 'evaluations' && <EvaluationsView state={state} onRevealChange={(rev) => dispatch({ type: 'REVEAL_CANDIDATES', reveal: rev })} />}
      </main>

      {state.scan && state.scan.diagnostics.length > 0 && (
        <section className="diagnostics-section" aria-label="Session diagnostics">
          <DiagnosticPanel diagnostics={state.scan.diagnostics} suppressedCount={state.scan.suppressed_diagnostics} />
        </section>
      )}
      <footer className="app-footer text-muted">
        <span>EVCrate 2.1.0 &bull; {state.providerKind === 'dam-hopper' ? 'DamHopper Plugin' : 'Local Static Explorer'} &bull; No Remote Network Access</span>
      </footer>
    </div>
  );
};
