import type * as vscode from 'vscode';
import type { CompanionAgentProvider } from './agent-provider.js';
import type { StoredBindingResult } from './binding-store.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import type { HostGuardStatus } from './installation-roots.js';
import type { CatalogSnapshot } from './model-catalog.js';
import { executeRefreshPass, type ReconcileState } from './refresh-reconciler.js';
import { STORAGE_AND_SOURCE_BOUNDS } from './runtime-contracts.js';
import {
  createScopedTemplateWatcher, isDerivedStoragePath, isEnrolledTemplateInventoryPath, type ScopedWatcherDisposable
} from './template-watcher.js';

export { isDerivedStoragePath, isEnrolledTemplateInventoryPath };

export type RefreshTriggerReason =
  | 'startup' | 'bindings-updated' | 'catalog-changed'
  | 'root-changed' | 'trust-changed' | 'template-changed' | 'manual';

export interface RefreshControllerOptions {
  readonly instanceUuid: string;
  readonly baseStorageFsPath: string;
  readonly debounceMs?: number;
  readonly tryRegisterProvider: () => HostGuardStatus;
  readonly getActiveProvider: () => CompanionAgentProvider | null;
  readonly withdrawProvider: () => void;
  readonly disposeProvider: () => void;
  readonly getWorkspaceFolderPaths: () => readonly string[];
  readonly getCustomHomePath?: () => string | undefined;
  readonly getApprovedRoots: () => ReadonlySet<string>;
  readonly getExplicitSelectedRootIdentity: () => string | null;
  readonly getStoredBindings: (rootIdentity: string | null) => { readonly userRes: StoredBindingResult; readonly rootRes: StoredBindingResult };
  readonly queryCatalog: (revision: number) => Promise<CatalogSnapshot>;
  readonly createUri: (fsPath: string) => vscode.Uri;
  readonly watchPluginRoot?: (pluginFsPath: string, baseStorageFsPath: string, onRelevantChange: (changedPath: string) => void) => ScopedWatcherDisposable;
  readonly onErrorMessage?: (message: string) => void;
  readonly ensureCatalogSubscribed?: () => void;
  readonly syncPluginAgentsDir?: boolean;
}

const IMMEDIATE_WITHDRAW_REASONS: Record<RefreshTriggerReason, boolean> = {
  startup: false, 'bindings-updated': false, 'catalog-changed': true,
  'root-changed': true, 'trust-changed': true, 'template-changed': false, manual: false
};

export class RefreshController {
  private _disposed = false;
  private _activationEpoch = 1;
  private _latestRevision = 0;
  private _completedRevision = 0;
  private _lockContentionRetries = 0;
  private _watchedPluginFsPath: string | null = null;
  private _templateWatcher: ScopedWatcherDisposable | null = null;
  private _debounceTimer: NodeJS.Timeout | undefined = undefined;
  private _activeFlightPromise: Promise<boolean> | null = null;
  private _waiters: Array<{ readonly targetRevision: number; readonly resolve: (val: boolean) => void }> = [];
  private _lastPassOutcome = false;
  private readonly _state: ReconcileState = {
    currentGenerationId: 0, stagedByInventoryKey: new Map(), generationIdByInventoryKey: new Map(),
    currentRootIdentity: null, currentPluginFsPath: null, catalogSnapshot: null,
    catalogRevisionCounter: 0, catalogNeedsRequery: false, lastDiagnosticsReport: null
  };
  constructor(private readonly _options: RefreshControllerOptions) {}

  get instanceUuid(): string { return this._options.instanceUuid; }
  get currentGenerationId(): number { return this._state.currentGenerationId; }
  get currentRootIdentity(): string | null { return this._state.currentRootIdentity; }
  get currentPluginFsPath(): string | null { return this._state.currentPluginFsPath; }
  get catalogSnapshot(): CatalogSnapshot | null { return this._state.catalogSnapshot; }
  get lastDiagnosticsReport(): RuntimeDiagnosticsReport | null { return this._state.lastDiagnosticsReport; }
  get latestRevision(): number { return this._latestRevision; }
  get completedRevision(): number { return this._completedRevision; }

  notifyFileSystemEvent(candidateFsPath: string): boolean {
    if (this._disposed || isDerivedStoragePath(candidateFsPath, this._options.baseStorageFsPath)) return false;
    if (this._state.currentPluginFsPath && !isEnrolledTemplateInventoryPath(candidateFsPath, this._state.currentPluginFsPath, this._options.baseStorageFsPath)) return false;
    void this.requestRefresh({ reason: 'template-changed' });
    return true;
  }

  requestRefresh(opts?: { readonly reason?: RefreshTriggerReason; readonly immediate?: boolean; readonly forceCatalogQuery?: boolean }): Promise<boolean> {
    if (this._disposed) return Promise.resolve(false);
    const reason = opts?.reason ?? 'manual';
    this._latestRevision += 1;
    this._lockContentionRetries = 0;
    const targetRevision = this._latestRevision;

    if (opts?.forceCatalogQuery || reason === 'catalog-changed') {
      this._state.catalogNeedsRequery = true;
      if (reason === 'catalog-changed') this._state.catalogSnapshot = null;
    }
    if (IMMEDIATE_WITHDRAW_REASONS[reason]) {
      this._options.withdrawProvider();
      if (reason === 'root-changed' || reason === 'trust-changed') {
        this._state.currentRootIdentity = null;
        this._state.currentPluginFsPath = null;
        this._disposeTemplateWatcher();
      }
    }
    const waitPromise = new Promise<boolean>((resolve) => { this._waiters.push({ targetRevision, resolve }); });
    const debounceMs = this._options.debounceMs ?? STORAGE_AND_SOURCE_BOUNDS.refreshDebounceMs;
    if (opts?.immediate || debounceMs <= 0) {
      if (this._debounceTimer !== undefined) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = undefined;
      }
      this._kickSingleFlight();
    } else {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = undefined;
        this._kickSingleFlight();
      }, debounceMs);
    }
    return waitPromise;
  }

  private _scheduleLockContentionRetry(): void {
    if (this._disposed || this._lockContentionRetries >= 2) return;
    this._lockContentionRetries += 1;
    this._latestRevision += 1;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => { this._debounceTimer = undefined; this._kickSingleFlight(); }, 30);
  }

  private _kickSingleFlight(): void {
    if (this._disposed || this._activeFlightPromise !== null) return;
    this._activeFlightPromise = (async () => {
      try {
        while (!this._disposed && this._completedRevision < this._latestRevision && this._debounceTimer === undefined) {
          const targetRevision = this._latestRevision;
          const epoch = this._activationEpoch;
          const outcome = await executeRefreshPass(this._state, {
            ...this._options,
            syncTemplateWatcher: (pluginFsPath) => this._syncTemplateWatcher(pluginFsPath),
            disposeTemplateWatcher: () => this._disposeTemplateWatcher(),
            scheduleLockContentionRetry: () => this._scheduleLockContentionRetry(),
            isSuperseded: () => this._disposed || epoch !== this._activationEpoch || targetRevision !== this._latestRevision
          });
          if (this._disposed || epoch !== this._activationEpoch) {
            this._lastPassOutcome = false;
            break;
          }
          if (targetRevision === this._latestRevision) {
            this._completedRevision = targetRevision;
            this._lastPassOutcome = outcome;
            this._settleWaitersUpTo(this._completedRevision, outcome);
          }
        }
        return this._lastPassOutcome;
      } finally {
        this._activeFlightPromise = null;
        if (!this._disposed && this._completedRevision < this._latestRevision && this._debounceTimer === undefined) {
          this._kickSingleFlight();
        }
      }
    })();
  }

  private _settleWaitersUpTo(revision: number, outcome: boolean): void {
    const remaining: typeof this._waiters = [];
    for (const w of this._waiters) {
      if (w.targetRevision <= revision) w.resolve(outcome);
      else remaining.push(w);
    }
    this._waiters = remaining;
  }

  private _syncTemplateWatcher(pluginFsPath: string): void {
    if (this._watchedPluginFsPath === pluginFsPath && this._templateWatcher !== null) return;
    this._disposeTemplateWatcher();
    this._watchedPluginFsPath = pluginFsPath;
    const watchFn = this._options.watchPluginRoot ?? createScopedTemplateWatcher;
    this._templateWatcher = watchFn(pluginFsPath, this._options.baseStorageFsPath, (p) => { this.notifyFileSystemEvent(p); });
  }

  private _disposeTemplateWatcher(): void {
    if (this._templateWatcher) { this._templateWatcher.dispose(); this._templateWatcher = null; }
    this._watchedPluginFsPath = null;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._activationEpoch += 1;
    if (this._debounceTimer !== undefined) { clearTimeout(this._debounceTimer); this._debounceTimer = undefined; }
    this._disposeTemplateWatcher();
    this._state.stagedByInventoryKey.clear();
    this._state.generationIdByInventoryKey.clear();
    this._state.currentRootIdentity = null;
    this._state.currentPluginFsPath = null;
    this._state.catalogSnapshot = null;
    this._options.disposeProvider();
    this._settleWaitersUpTo(Number.MAX_SAFE_INTEGER, false);
  }
}
