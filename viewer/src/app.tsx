import { useReducer, useRef, useEffect, useCallback, useState, type FC } from 'react';
import { appReducer, INITIAL_STATE, extractDomainFilters, extractDomainQuery, type UiHistoryFilters } from './app-state.js';
import { getCurrentHashView, setWindowHash } from './hash-view.js';
import type { AdvisorDataProvider } from './providers/advisor-data-provider.ts';
import { DamHopperPortProvider } from './providers/dam-hopper-port-provider.ts';
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
  const historyRequestSeqRef = useRef(0);
  const detailRequestSeqRef = useRef(0);
  const providerRef = useRef<AdvisorDataProvider | null>(null);
  const providerContextRevisionRef = useRef(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  if (!defaultProviderRef.current) defaultProviderRef.current = provider ?? new DamHopperPortProvider(true);
  const activeProvider = provider ?? defaultProviderRef.current;
  useEffect(() => {
    const providerChanged = providerRef.current !== null && providerRef.current !== activeProvider;
    if (providerChanged) providerContextRevisionRef.current++;
    providerRef.current = activeProvider;
    historyRequestSeqRef.current++;
    detailRequestSeqRef.current++;
    setHistoryLoading(false);
    setHistoryError(null);
    const unsub = activeProvider.subscribe((event) => {
      if (event.type === 'ready') {
        historyRequestSeqRef.current++;
        detailRequestSeqRef.current++;
        setHistoryLoading(false);
        setHistoryError(null);
        dispatch({
          type: 'PROVIDER_READY',
          providerKind: event.descriptor.kind,
          label: event.descriptor.label,
          capabilities: event.descriptor.capabilities,
          frameSession: event.descriptor.frameSession,
          activationGeneration: event.descriptor.activationGeneration
        });
      } else if (event.type === 'context-changed') {
        historyRequestSeqRef.current++;
        detailRequestSeqRef.current++;
        setHistoryLoading(false);
        setHistoryError(null);
        dispatch({
          type: 'CONTEXT_CHANGED',
          label: event.descriptor.label,
          capabilities: event.descriptor.capabilities,
          frameSession: event.descriptor.frameSession,
          activationGeneration: event.descriptor.activationGeneration
        });
      } else if (event.type === 'revoked') {
        historyRequestSeqRef.current++;
        detailRequestSeqRef.current++;
        setHistoryLoading(false);
        setHistoryError('History context was revoked.');
        dispatch({ type: 'CONTEXT_REVOKED', reason: event.reason });
      } else if (event.type === 'availability-changed') {
        dispatch({ type: 'AVAILABILITY_CHANGED', available: event.available, capabilities: event.capabilities });
      }
    });
    const d = activeProvider.descriptor;
    if (providerChanged) {
      dispatch({
        type: 'CONTEXT_CHANGED',
        label: d.label,
        capabilities: d.capabilities,
        frameSession: d.frameSession,
        activationGeneration: d.activationGeneration
      });
    } else {
      dispatch({
        type: 'PROVIDER_READY',
        providerKind: d.kind,
        label: d.label,
        capabilities: d.capabilities,
        frameSession: d.frameSession,
        activationGeneration: d.activationGeneration
      });
    }
    const onHash = () => dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    window.addEventListener('hashchange', onHash);
    dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    return () => { detailRequestSeqRef.current++; unsub(); window.removeEventListener('hashchange', onHash); };
  }, [activeProvider]);

  const refreshData = useCallback(async () => {
    const reqId = `req-${Date.now()}`;
    activeRequestIdRef.current = reqId;
    const historyRequestSeq = ++historyRequestSeqRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    const gen = state.generation + 1;
    dispatch({ type: 'HISTORY_REFRESH_START', generation: gen, frameSession: state.frameSession });
    try {
      const res = await activeProvider.refreshHistory(reqId);
      if (historyRequestSeq !== historyRequestSeqRef.current) return;
      dispatch({ type: 'HISTORY_REFRESH_COMMIT', generation: gen, frameSession: state.frameSession, result: res, snapshot: undefined });
      if (res.snapshot_id) {
        const query = extractDomainQuery(state.filters);
        const [summary, page] = await Promise.all([
          activeProvider.getHistorySummary(`sum-${Date.now()}`, res.snapshot_id, query),
          activeProvider.getHistoryPage(`page-${Date.now()}`, res.snapshot_id, query, 'started_at_desc', null, 100)
        ]);
        if (historyRequestSeq !== historyRequestSeqRef.current) return;
        dispatch({ type: 'HISTORY_SUMMARY_COMMIT', generation: gen, frameSession: state.frameSession, summary });
        dispatch({ type: 'HISTORY_PAGE_COMMIT', generation: gen, frameSession: state.frameSession, page });
      } else {
        setHistoryError('No history snapshot is available.');
      }
      setHistoryLoading(false);
    } catch {
      if (historyRequestSeq === historyRequestSeqRef.current) {
        setHistoryLoading(false);
        dispatch({ type: 'SCAN_STALE', generation: gen, reason: 'Failed to refresh history' });
        setHistoryError('Failed to refresh history.');
      }
    }
    if (activeProvider.descriptor.hasPolicySource || activeProvider.descriptor.capabilities.includes('policy.readCurrent')) {
      try { dispatch({ type: 'POLICY_COMMIT', policy: await activeProvider.readCurrentPolicy(`pol-${Date.now()}`) }); } catch {}
    }
    if (activeProvider.descriptor.hasEvaluationSource || activeProvider.descriptor.capabilities.includes('evaluations.list')) {
      try {
        const evalList = await activeProvider.listEvaluations(`eval-${Date.now()}`, null, 100);
        dispatch({ type: 'EVALUATIONS_LIST_COMMIT', list: evalList });
        if (evalList.status === 'ready' && evalList.items.length > 0) {
          const itemsToCompare = evalList.items.map((it) => ({
            evaluation_ref: it.evaluation_ref,
            expected_revision: it.source_revision
          }));
          const cmp = await activeProvider.compareEvaluations(`cmp-${Date.now()}`, itemsToCompare, null, 100);
          if (cmp.status === 'ready') {
            dispatch({ type: 'EVALUATIONS_COMPARE_COMMIT', comparison: cmp });
          }
        }
      } catch {}
    }
  }, [activeProvider, state.generation, state.frameSession, state.filters]);

  const handleSetFilters = useCallback(async (filters: Partial<UiHistoryFilters>) => {
    const projectChanged = filters.project_id !== undefined && filters.project_id !== state.filters.project_id;
    if (projectChanged) {
      detailRequestSeqRef.current++;
    }
    dispatch({ type: 'SET_FILTERS', filters });
    const seq = ++historyRequestSeqRef.current;
    if (state.providerKind !== 'dam-hopper' || !state.snapshotId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    const merged = { ...state.filters, ...filters };
    const q = extractDomainQuery(merged);
    try {
      const [summary, page] = await Promise.all([
        activeProvider.getHistorySummary(`sum-${Date.now()}`, state.snapshotId, q),
        activeProvider.getHistoryPage(`page-${Date.now()}`, state.snapshotId, q, 'started_at_desc', null, 100)
      ]);
      if (seq !== historyRequestSeqRef.current) return;
      dispatch({ type: 'HISTORY_SUMMARY_COMMIT', generation: state.generation, frameSession: state.frameSession, summary });
      dispatch({ type: 'HISTORY_PAGE_COMMIT', generation: state.generation, frameSession: state.frameSession, page });
    } catch {
      if (seq === historyRequestSeqRef.current) {
        setHistoryError('Failed to load filtered history.');
        dispatch({ type: 'SCAN_STALE', generation: state.generation, reason: 'Failed to load filtered history' });
      }
    } finally {
      if (seq === historyRequestSeqRef.current) setHistoryLoading(false);
    }
  }, [activeProvider, state.providerKind, state.snapshotId, state.filters, state.generation, state.frameSession]);

  const handleHistoryPage = useCallback(async (cursor: string | null): Promise<boolean> => {
    if (!state.snapshotId) return false;
    const seq = ++historyRequestSeqRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    const query = extractDomainQuery(state.filters);
    try {
      const page = await activeProvider.getHistoryPage(`page-${Date.now()}`, state.snapshotId, query, 'started_at_desc', cursor, 100);
      if (seq !== historyRequestSeqRef.current) return false;
      dispatch({ type: 'HISTORY_PAGE_COMMIT', generation: state.generation, frameSession: state.frameSession, page });
      return true;
    } catch {
      if (seq === historyRequestSeqRef.current) setHistoryError('Failed to load this history page.');
      return false;
    } finally {
      if (seq === historyRequestSeqRef.current) setHistoryLoading(false);
    }
  }, [activeProvider, state.snapshotId, state.filters, state.generation, state.frameSession]);

  const handleSelectConsultation = useCallback(async (id: string | null, recordRef?: string) => {
    const detailRequestSeq = ++detailRequestSeqRef.current;
    dispatch({ type: 'SELECT_CONSULTATION', consultationId: id, recordRef });
    if (!id || !state.snapshotId) return;
    const ref = recordRef ?? id;
    dispatch({ type: 'HISTORY_DETAIL_START', recordRef: ref, consultationId: id });
    try {
      const detail = await activeProvider.getHistoryDetail(`det-${Date.now()}`, state.snapshotId, ref);
      if (detailRequestSeq !== detailRequestSeqRef.current) return;
      dispatch({ type: 'HISTORY_DETAIL_COMMIT', result: detail, consultationId: id });
    } catch (err: unknown) {
      if (detailRequestSeq === detailRequestSeqRef.current) {
        dispatch({ type: 'HISTORY_DETAIL_ERROR', recordRef: ref, consultationId: id, error: String(err) });
      }
    }
  }, [activeProvider, state.snapshotId]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <h1 className="brand-title">EVCrate Advisor Metrics Explorer</h1>
          <p className="brand-subtitle text-muted">DamHopper Advisor Plugin</p>
        </div>
        <DataControls
          status={state.status}
          providerKind={state.providerKind}
          sourceLabel={state.historySourceLabel}
          isAvailable={state.isAvailable}
          onRefresh={refreshData}
          onCancel={() => { if (activeRequestIdRef.current) activeProvider.cancel(activeRequestIdRef.current); }}
        />
      </header>

      <StatusBanner
        status={state.status}
        staleReason={state.staleReason}
        unsupportedReason={state.unsupportedReason}
        scan={state.scan}
        scannedAt={state.snapshot?.scannedAt}
      />
      <HashTabs
        activeView={state.activeView}
        onSelectView={(v) => { setWindowHash(v); dispatch({ type: 'SET_VIEW', view: v }); }}
        counts={{
          historyRecords: historyLoading || historyError !== null
            ? 0
            : state.providerKind === 'dam-hopper'
              ? state.historySummary?.metrics.counts.consultations ?? 0
              : state.historyPageEntries.length,
          evaluationDocs: state.evaluationResults.filter((r) => r.status === 'EVALUATION_READY').length || (state.evaluationsList?.items.length ?? 0)
        }}
      />

      <main className="app-main" id="main-content" tabIndex={-1}>
        {state.activeView === 'overview' && <OverviewView state={state} />}
        {state.activeView === 'history' && <HistoryView state={state} onSelectConsultation={handleSelectConsultation} onSetFilters={handleSetFilters} onRefresh={refreshData} onPageRequest={handleHistoryPage} loading={historyLoading} loadError={historyError} contextKey={`${providerContextRevisionRef.current}:${state.snapshotId ?? ''}:${state.activationGeneration}:${state.frameSession ?? ''}:${state.generation}`} />}
        {state.activeView === 'configuration' && <ConfigurationView state={state} />}
        {state.activeView === 'evaluations' && <EvaluationsView state={state} onRevealChange={(rev) => dispatch({ type: 'REVEAL_CANDIDATES', reveal: rev })} />}
      </main>

      {state.scan && state.scan.diagnostics.length > 0 && (
        <section className="diagnostics-section" aria-label="Session diagnostics">
          <DiagnosticPanel diagnostics={state.scan.diagnostics} suppressedCount={state.scan.suppressed_diagnostics} />
        </section>
      )}
      <footer className="app-footer text-muted">
        <span>EVCrate 2.1.0 &bull; DamHopper Plugin &bull; No Remote Network Access</span>
      </footer>
    </div>
  );
};
