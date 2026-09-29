import { useReducer, useRef, useEffect, useCallback, useState, type FC } from 'react';
import {
  appReducer,
  INITIAL_STATE,
  selectHistoryQuery,
  extractDomainFilters,
  type UiHistoryFilters,
  type ActivityScope
} from './app-state.js';
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

export interface AppProps {
  readonly provider?: AdvisorDataProvider;
}

export const App: FC<AppProps> = ({ provider }) => {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const defaultProviderRef = useRef<AdvisorDataProvider | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const providerRef = useRef<AdvisorDataProvider | null>(null);
  const providerContextRevisionRef = useRef(0);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  if (!defaultProviderRef.current) {
    defaultProviderRef.current = provider ?? new DamHopperPortProvider(true);
  }
  const activeProvider = provider ?? defaultProviderRef.current;

  const makeRequestId = useCallback((prefix: string): string => {
    return `${prefix}-${Date.now()}-${++requestSeqRef.current}`;
  }, []);

  useEffect(() => {
    const providerChanged = providerRef.current !== null && providerRef.current !== activeProvider;
    if (providerChanged) providerContextRevisionRef.current++;
    providerRef.current = activeProvider;

    setHistoryLoading(false);
    setHistoryError(null);

    const unsub = activeProvider.subscribe((event) => {
      if (event.type === 'ready') {
        setHistoryLoading(false);
        setHistoryError(null);
        dispatch({
          type: 'PROVIDER_READY',
          providerKind: event.descriptor.kind,
          label: event.descriptor.label,
          capabilities: event.descriptor.capabilities,
          frameSession: event.descriptor.frameSession,
          activationGeneration: event.descriptor.activationGeneration,
          workspaceContext: event.descriptor.workspaceContext
        });
      } else if (event.type === 'context-changed') {
        setHistoryLoading(false);
        setHistoryError(null);
        dispatch({
          type: 'CONTEXT_CHANGED',
          label: event.descriptor.label,
          capabilities: event.descriptor.capabilities,
          frameSession: event.descriptor.frameSession,
          activationGeneration: event.descriptor.activationGeneration,
          workspaceContext: event.descriptor.workspaceContext
        });
      } else if (event.type === 'workspace-project-changed') {
        dispatch({
          type: 'WORKSPACE_PROJECT_CHANGED',
          workspaceContext: event.workspaceContext
        });
      } else if (event.type === 'revoked') {
        setHistoryLoading(false);
        setHistoryError('History context was revoked.');
        dispatch({ type: 'CONTEXT_REVOKED', reason: event.reason });
      } else if (event.type === 'disconnected') {
        setHistoryLoading(false);
        setHistoryError('Provider disconnected.');
        dispatch({ type: 'DISCONNECTED' });
      } else if (event.type === 'incompatible') {
        setHistoryLoading(false);
        setHistoryError(event.reason);
        dispatch({ type: 'INCOMPATIBLE', reason: event.reason });
      } else if (event.type === 'availability-changed') {
        dispatch({
          type: 'AVAILABILITY_CHANGED',
          available: event.available,
          capabilities: event.capabilities
        });
      }
    });

    const d = activeProvider.descriptor;
    if (providerChanged) {
      dispatch({
        type: 'CONTEXT_CHANGED',
        label: d.label,
        capabilities: d.capabilities,
        frameSession: d.frameSession,
        activationGeneration: d.activationGeneration,
        workspaceContext: d.workspaceContext
      });
    } else {
      dispatch({
        type: 'PROVIDER_READY',
        providerKind: d.kind,
        label: d.label,
        capabilities: d.capabilities,
        frameSession: d.frameSession,
        activationGeneration: d.activationGeneration,
        workspaceContext: d.workspaceContext
      });
    }

    const onHash = () => dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    window.addEventListener('hashchange', onHash);
    dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });

    return () => {
      unsub();
      window.removeEventListener('hashchange', onHash);
    };
  }, [activeProvider]);

  const refreshData = useCallback(async () => {
    const s = stateRef.current;
    const project = s.workspaceContext?.project;
    if (!project || !project.projectId) {
      // Selected project required to identify profile; without selection, no provider calls
      return;
    }

    const epoch = s.contextEpoch;
    const gen = s.generation + 1;
    const reqId = makeRequestId('refresh');
    activeRequestIdRef.current = reqId;

    const historyAuthorityAvailable = s.workspaceContext
      ? s.workspaceContext.historyScope !== 'unavailable'
      : true;
    const currentQueryCheck = selectHistoryQuery(s);
    const canRefreshCurrentScope = currentQueryCheck.available || (s.activityScope !== 'all' && historyAuthorityAvailable);
    const hasHistory = historyAuthorityAvailable && canRefreshCurrentScope && (
      s.workspaceContext?.allowedOperations
        ? s.workspaceContext.allowedOperations.includes('history.refresh')
        : (activeProvider.descriptor.hasHistorySource || activeProvider.descriptor.capabilities.includes('history.refresh'))
    );

    if (!canRefreshCurrentScope && currentQueryCheck.reason) {
      setHistoryError(currentQueryCheck.reason);
    }
    if (hasHistory) {
      dispatch({
        type: 'HISTORY_REFRESH_START',
        generation: gen,
        frameSession: s.frameSession,
        contextEpoch: epoch
      });
      setHistoryLoading(true);
      setHistoryError(null);

      (async () => {
        try {
          const res = await activeProvider.refreshHistory(reqId);
          if (providerRef.current !== activeProvider || stateRef.current.contextEpoch !== epoch) return;

          dispatch({
            type: 'HISTORY_REFRESH_COMMIT',
            generation: gen,
            frameSession: stateRef.current.frameSession,
            result: res,
            contextEpoch: epoch,
            observedAt: res.observed_at
          });

          if (res.snapshot_id) {
            const nextQueryRes = selectHistoryQuery(stateRef.current);
            if (!nextQueryRes.available) {
              setHistoryLoading(false);
              if (nextQueryRes.reason) setHistoryError(nextQueryRes.reason);
              return;
            }
            const query = nextQueryRes.query;

            const [summary, page] = await Promise.all([
              activeProvider.getHistorySummary(makeRequestId('sum'), res.snapshot_id, query),
              activeProvider.getHistoryPage(
                makeRequestId('page'),
                res.snapshot_id,
                query,
                'started_at_desc',
                null,
                100
              )
            ]);

            if (providerRef.current !== activeProvider || stateRef.current.contextEpoch !== epoch) return;

            dispatch({
              type: 'HISTORY_QUERY_PAIR_COMMIT',
              generation: gen,
              frameSession: stateRef.current.frameSession,
              summary,
              page,
              queryRevision: stateRef.current.historyQueryRevision,
              contextEpoch: epoch
            });
          } else {
            setHistoryError('No history snapshot is available.');
          }
        } catch {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            setHistoryError('Failed to refresh history.');
            dispatch({
              type: 'SCAN_STALE',
              generation: gen,
              reason: 'Failed to refresh history'
            });
          }
        } finally {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            setHistoryLoading(false);
          }
        }
      })();
    }

    // 2. Policy Read Current (independent)
    const hasPolicy = s.workspaceContext?.allowedOperations
      ? s.workspaceContext.allowedOperations.includes('policy.readCurrent')
      : (activeProvider.descriptor.hasPolicySource || activeProvider.descriptor.capabilities.includes('policy.readCurrent'));

    if (hasPolicy) {
      dispatch({ type: 'POLICY_START', contextEpoch: epoch });
      activeProvider
        .readCurrentPolicy(makeRequestId('policy'))
        .then((policy) => {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            dispatch({ type: 'POLICY_COMMIT', policy, contextEpoch: epoch });
          }
        })
        .catch((err) => {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            dispatch({ type: 'POLICY_ERROR', error: String(err), contextEpoch: epoch });
          }
        });
    }

    // 3. Evaluations List (independent, without eager compare-all)
    const hasEval = s.workspaceContext?.allowedOperations
      ? s.workspaceContext.allowedOperations.includes('evaluations.list')
      : (activeProvider.descriptor.hasEvaluationSource || activeProvider.descriptor.capabilities.includes('evaluations.list'));

    if (hasEval) {
      dispatch({ type: 'EVALUATIONS_LIST_START', contextEpoch: epoch });
      activeProvider
        .listEvaluations(makeRequestId('eval'), null, 100)
        .then((list) => {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            dispatch({ type: 'EVALUATIONS_LIST_COMMIT', list, contextEpoch: epoch });
          }
        })
        .catch((err) => {
          if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
            dispatch({ type: 'EVALUATIONS_LIST_ERROR', error: String(err), contextEpoch: epoch });
          }
        });
    }
  }, [activeProvider, makeRequestId]);

  const handleScopeChange = useCallback(
    async (scope: ActivityScope) => {
      const s = stateRef.current;
      if (s.activityScope === scope) return;

      dispatch({ type: 'SET_ACTIVITY_SCOPE', scope });
      const nextQueryRev = s.historyQueryRevision + 1;
      const epoch = s.contextEpoch;

      if (s.providerKind !== 'dam-hopper' || !s.snapshotId) return;

      const nextState = { ...s, activityScope: scope, historyQueryRevision: nextQueryRev };
      const qResult = selectHistoryQuery(nextState);

      if (!qResult.available) {
        setHistoryLoading(false);
        if (qResult.reason) setHistoryError(qResult.reason);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const [summary, page] = await Promise.all([
          activeProvider.getHistorySummary(makeRequestId('sum'), s.snapshotId, qResult.query),
          activeProvider.getHistoryPage(
            makeRequestId('page'),
            s.snapshotId,
            qResult.query,
            'started_at_desc',
            null,
            100
          )
        ]);

        if (
          providerRef.current !== activeProvider ||
          stateRef.current.contextEpoch !== epoch ||
          stateRef.current.historyQueryRevision !== nextQueryRev
        ) {
          return;
        }

        dispatch({
          type: 'HISTORY_QUERY_PAIR_COMMIT',
          generation: stateRef.current.generation,
          frameSession: stateRef.current.frameSession,
          summary,
          page,
          queryRevision: nextQueryRev,
          contextEpoch: epoch
        });
      } catch {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === nextQueryRev
        ) {
          setHistoryError('Failed to load history for selected scope.');
          dispatch({
            type: 'HISTORY_QUERY_ERROR',
            generation: stateRef.current.generation,
            frameSession: stateRef.current.frameSession,
            error: 'Failed to load history for selected scope',
            queryRevision: nextQueryRev,
            contextEpoch: epoch
          });
        }
      } finally {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === nextQueryRev
        ) {
          setHistoryLoading(false);
        }
      }
    },
    [activeProvider, makeRequestId]
  );

  const handleSetFilters = useCallback(
    async (filters: Partial<UiHistoryFilters>) => {
      const s = stateRef.current;
      dispatch({ type: 'SET_FILTERS', filters });

      const nextQueryRev = s.historyQueryRevision + 1;
      const epoch = s.contextEpoch;

      if (s.providerKind !== 'dam-hopper' || !s.snapshotId) return;

      const nextState = {
        ...s,
        filters: { ...s.filters, ...filters },
        historyQueryRevision: nextQueryRev
      };
      const qResult = selectHistoryQuery(nextState);

      if (!qResult.available) {
        setHistoryLoading(false);
        if (qResult.reason) setHistoryError(qResult.reason);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const [summary, page] = await Promise.all([
          activeProvider.getHistorySummary(makeRequestId('sum'), s.snapshotId, qResult.query),
          activeProvider.getHistoryPage(
            makeRequestId('page'),
            s.snapshotId,
            qResult.query,
            'started_at_desc',
            null,
            100
          )
        ]);

        if (
          providerRef.current !== activeProvider ||
          stateRef.current.contextEpoch !== epoch ||
          stateRef.current.historyQueryRevision !== nextQueryRev
        ) {
          return;
        }

        dispatch({
          type: 'HISTORY_QUERY_PAIR_COMMIT',
          generation: stateRef.current.generation,
          frameSession: stateRef.current.frameSession,
          summary,
          page,
          queryRevision: nextQueryRev,
          contextEpoch: epoch
        });
      } catch {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === nextQueryRev
        ) {
          setHistoryError('Failed to load filtered history.');
          dispatch({
            type: 'HISTORY_QUERY_ERROR',
            generation: stateRef.current.generation,
            frameSession: stateRef.current.frameSession,
            error: 'Failed to load filtered history',
            queryRevision: nextQueryRev,
            contextEpoch: epoch
          });
        }
      } finally {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === nextQueryRev
        ) {
          setHistoryLoading(false);
        }
      }
    },
    [activeProvider, makeRequestId]
  );

  const handleHistoryPage = useCallback(
    async (cursor: string | null): Promise<boolean> => {
      const s = stateRef.current;
      if (!s.snapshotId) return false;

      const qResult = selectHistoryQuery(s);
      if (!qResult.available) return false;

      const queryRev = s.historyQueryRevision;
      const epoch = s.contextEpoch;

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const page = await activeProvider.getHistoryPage(
          makeRequestId('page'),
          s.snapshotId,
          qResult.query,
          'started_at_desc',
          cursor,
          100
        );

        if (
          providerRef.current !== activeProvider ||
          stateRef.current.contextEpoch !== epoch ||
          stateRef.current.historyQueryRevision !== queryRev
        ) {
          return false;
        }

        dispatch({
          type: 'HISTORY_PAGE_COMMIT',
          generation: stateRef.current.generation,
          frameSession: stateRef.current.frameSession,
          page,
          queryRevision: queryRev,
          contextEpoch: epoch
        });
        return true;
      } catch {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === queryRev
        ) {
          setHistoryError('Failed to load this history page.');
        }
        return false;
      } finally {
        if (
          providerRef.current === activeProvider &&
          stateRef.current.contextEpoch === epoch &&
          stateRef.current.historyQueryRevision === queryRev
        ) {
          setHistoryLoading(false);
        }
      }
    },
    [activeProvider, makeRequestId]
  );

  const handleSelectConsultation = useCallback(
    async (id: string | null, recordRef?: string) => {
      const s = stateRef.current;
      const epoch = s.contextEpoch;

      dispatch({
        type: 'SELECT_CONSULTATION',
        consultationId: id,
        recordRef,
        contextEpoch: epoch
      });

      if (!id || !s.snapshotId) return;

      const ref = recordRef ?? id;
      dispatch({
        type: 'HISTORY_DETAIL_START',
        recordRef: ref,
        consultationId: id,
        contextEpoch: epoch
      });

      try {
        const detail = await activeProvider.getHistoryDetail(
          makeRequestId('det'),
          s.snapshotId,
          ref
        );
        if (providerRef.current !== activeProvider || stateRef.current.contextEpoch !== epoch) return;

        dispatch({
          type: 'HISTORY_DETAIL_COMMIT',
          result: detail,
          consultationId: id,
          contextEpoch: epoch
        });
      } catch (err: unknown) {
        if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
          dispatch({
            type: 'HISTORY_DETAIL_ERROR',
            recordRef: ref,
            consultationId: id,
            error: String(err),
            contextEpoch: epoch
          });
        }
      }
    },
    [activeProvider, makeRequestId]
  );

  const handleReadEvaluation = useCallback(
    async (evaluationRef: string, expectedRevision: string) => {
      const epoch = stateRef.current.contextEpoch;
      dispatch({ type: 'EVALUATION_READ_START', evaluationRef, contextEpoch: epoch });

      try {
        const res = await activeProvider.readEvaluation(
          makeRequestId('eval-read'),
          evaluationRef,
          expectedRevision
        );
        if (providerRef.current !== activeProvider || stateRef.current.contextEpoch !== epoch) return;

        dispatch({ type: 'EVALUATION_READ_COMMIT', result: res, contextEpoch: epoch });
      } catch (err: unknown) {
        if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
          dispatch({
            type: 'EVALUATION_READ_ERROR',
            evaluationRef,
            error: String(err),
            contextEpoch: epoch
          });
        }
      }
    },
    [activeProvider, makeRequestId]
  );

  const handleCompareEvaluations = useCallback(
    async (
      items: readonly { evaluation_ref: string; expected_revision: string }[],
      cursor: string | null = null,
      limit: number = 32
    ) => {
      const epoch = stateRef.current.contextEpoch;
      // Maximum 32 comparison references enforced
      const boundedItems = items.slice(0, 32);
      dispatch({ type: 'EVALUATIONS_COMPARE_START', contextEpoch: epoch });

      try {
        const cmp = await activeProvider.compareEvaluations(
          makeRequestId('eval-cmp'),
          boundedItems,
          cursor,
          limit
        );
        if (providerRef.current !== activeProvider || stateRef.current.contextEpoch !== epoch) return;

        if (cmp.status === 'ready') {
          dispatch({
            type: 'EVALUATIONS_COMPARE_COMMIT',
            comparison: cmp,
            cursor,
            contextEpoch: epoch
          });
        } else {
          const cmpStatus = typeof cmp === 'object' && cmp !== null && 'status' in cmp && typeof cmp.status === 'string' ? cmp.status : 'unknown';
          dispatch({
            type: 'EVALUATIONS_COMPARE_ERROR',
            error: `Comparison failed: status ${cmpStatus}`,
            contextEpoch: epoch
          });
        }
      } catch (err: unknown) {
        if (providerRef.current === activeProvider && stateRef.current.contextEpoch === epoch) {
          dispatch({
            type: 'EVALUATIONS_COMPARE_ERROR',
            error: String(err),
            contextEpoch: epoch
          });
        }
      }
    },
    [activeProvider, makeRequestId]
  );

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
          onCancel={() => {
            if (activeRequestIdRef.current) activeProvider.cancel(activeRequestIdRef.current);
          }}
        />
      </header>

      <StatusBanner
        status={state.status}
        staleReason={state.staleReason}
        unsupportedReason={state.unsupportedReason}
        scan={state.scan}
        scannedAt={state.observedAt ?? state.snapshot?.scannedAt}
      />
      <HashTabs
        activeView={state.activeView}
        onSelectView={(v) => {
          setWindowHash(v);
          dispatch({ type: 'SET_VIEW', view: v });
        }}
        counts={{
          historyRecords:
            historyLoading || historyError !== null
              ? 0
              : state.providerKind === 'dam-hopper'
                ? state.historySummary?.metrics.counts.consultations ?? 0
                : state.historyPageEntries.length,
          evaluationDocs:
            state.evaluationResults.filter((r) => r.status === 'EVALUATION_READY').length ||
            (state.evaluationsList?.items.length ?? 0)
        }}
      />

      <main className="app-main" id="main-content" tabIndex={-1}>
        {state.activeView === 'overview' && (
          <OverviewView state={state} onScopeChange={handleScopeChange} />
        )}
        {state.activeView === 'history' && (
          <HistoryView
            state={state}
            onSelectConsultation={handleSelectConsultation}
            onSetFilters={handleSetFilters}
            onScopeChange={handleScopeChange}
            onRefresh={refreshData}
            onPageRequest={handleHistoryPage}
            loading={historyLoading}
            loadError={historyError}
            contextKey={`${providerContextRevisionRef.current}:${state.snapshotId ?? ''}:${state.activationGeneration}:${state.frameSession ?? ''}:${state.generation}:${state.activityScope}`}
          />
        )}
        {state.activeView === 'configuration' && <ConfigurationView state={state} />}
        {state.activeView === 'evaluations' && (
          <EvaluationsView
            state={state}
            onRevealChange={(rev) => dispatch({ type: 'REVEAL_CANDIDATES', reveal: rev })}
            onCompareDescriptors={(items) => handleCompareEvaluations(items)}
            onInspectDescriptor={(ref, rev) => handleReadEvaluation(ref, rev)}
          />
        )}
      </main>

      {state.scan && state.scan.diagnostics.length > 0 && (
        <section className="diagnostics-section" aria-label="Session diagnostics">
          <DiagnosticPanel
            diagnostics={state.scan.diagnostics}
            suppressedCount={state.scan.suppressed_diagnostics}
          />
        </section>
      )}
      <footer className="app-footer text-muted">
        <span>EVCrate 2.1.0 &bull; DamHopper Plugin &bull; No Remote Network Access</span>
      </footer>
    </div>
  );
};
