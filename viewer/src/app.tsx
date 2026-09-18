// Verified Phase 07 React Explorer architecture.
import { useReducer, useRef, useEffect, useCallback, type FC } from 'react';
import { appReducer, INITIAL_STATE } from './app-state.js';
import { getCurrentHashView, setWindowHash, type HashView } from './hash-view.js';
import { selectHistoryDirectory, HistoryReader } from './io/history-reader.js';
import { selectAndReadPolicyFile } from './io/policy-reader.js';
import { selectAndReadEvaluationFiles } from './io/evaluation-reader.js';
import type { FileSystemDirectoryHandle } from './io/file-system-access.d.ts';
import { SourceControls } from './components/source-controls.js';
import { StatusBanner } from './components/status-banner.js';
import { HashTabs } from './components/hash-tabs.js';
import { DiagnosticPanel } from './components/diagnostic-panel.js';
import { OverviewView } from './views/overview-view.js';
import { HistoryView } from './views/history-view.js';
import { ConfigurationView } from './views/configuration-view.js';
import { EvaluationsView } from './views/evaluations-view.js';

export const App: FC = () => {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE);
  const rootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const readerRef = useRef<HistoryReader>(new HistoryReader());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.showDirectoryPicker !== 'function') {
      dispatch({ type: 'CAPABILITY_UNSUPPORTED', reason: 'The File System Access API is not supported in this browser.' });
    }
    const onHashChange = () => dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    window.addEventListener('hashchange', onHashChange);
    dispatch({ type: 'SET_VIEW', view: getCurrentHashView() });
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const runScan = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const reader = readerRef.current;
    const gen = reader.latestGeneration + 1;
    dispatch({ type: 'SCAN_START', generation: gen, label: handle.name });
    try {
      const result = await reader.scan(handle, state.snapshot);
      dispatch({ type: 'SCAN_COMMIT', generation: result.generation, commit: result.commit, snapshot: result.snapshot, scan: result.scan });
    } catch {
      dispatch({ type: 'SCAN_STALE', generation: gen, reason: 'Scan encountered an unexpected read exception' });
    }
  }, [state.snapshot]);

  const handleSelectHistory = useCallback(async () => {
    dispatch({ type: 'SELECT_START' });
    try {
      const handle = await selectHistoryDirectory();
      if (!handle) {
        if (state.status === 'selecting') dispatch({ type: 'SCAN_CANCEL', generation: state.generation });
        return;
      }
      rootHandleRef.current = handle;
      await runScan(handle);
    } catch {
      dispatch({ type: 'SCAN_STALE', generation: state.generation, reason: 'Failed to obtain directory handle' });
    }
  }, [runScan, state.status, state.generation]);

  const handleRefreshHistory = useCallback(async () => {
    const handle = rootHandleRef.current;
    if (!handle) return;
    await runScan(handle);
  }, [runScan]);

  const handleCancelScan = useCallback(() => {
    readerRef.current.cancelActiveScan();
    dispatch({ type: 'SCAN_CANCEL', generation: state.generation });
  }, [state.generation]);

  const handleSelectPolicy = useCallback(async () => {
    const result = await selectAndReadPolicyFile();
    dispatch({ type: 'SET_POLICY', result });
  }, []);

  const handleSelectEvaluations = useCallback(async () => {
    const results = await selectAndReadEvaluationFiles();
    dispatch({ type: 'SET_EVALUATIONS', results });
  }, []);

  const handleSelectView = useCallback((view: HashView) => {
    setWindowHash(view);
    dispatch({ type: 'SET_VIEW', view });
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-brand">
          <h1 className="brand-title">EVCrate Advisor Metrics Explorer</h1>
          <p className="brand-subtitle text-muted">Private Diagnostic &amp; Verification Viewer</p>
        </div>
        <SourceControls
          status={state.status}
          historySourceLabel={state.historySourceLabel}
          hasHistoryHandle={rootHandleRef.current !== null}
          onSelectHistory={handleSelectHistory}
          onRefreshHistory={handleRefreshHistory}
          onCancelScan={handleCancelScan}
          onSelectPolicy={handleSelectPolicy}
          onSelectEvaluations={handleSelectEvaluations}
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
        onSelectView={handleSelectView}
        counts={{
          historyRecords: state.snapshot?.records.length,
          evaluationDocs: state.evaluationResults.filter((r) => r.status === 'EVALUATION_READY').length
        }}
      />

      <main className="app-main" id="main-content" tabIndex={-1}>
        {state.activeView === 'overview' && <OverviewView state={state} />}
        {state.activeView === 'history' && (
          <HistoryView
            state={state}
            onSelectConsultation={(id) => dispatch({ type: 'SELECT_CONSULTATION', consultationId: id })}
            onSetFilters={(f) => dispatch({ type: 'SET_FILTERS', filters: f })}
          />
        )}
        {state.activeView === 'configuration' && <ConfigurationView state={state} />}
        {state.activeView === 'evaluations' && (
          <EvaluationsView
            state={state}
            onRevealChange={(rev) => dispatch({ type: 'REVEAL_CANDIDATES', reveal: rev })}
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
        <span>EVCrate 2.1.0 &bull; Local Static Explorer &bull; No Remote Network Access</span>
      </footer>
    </div>
  );
};
