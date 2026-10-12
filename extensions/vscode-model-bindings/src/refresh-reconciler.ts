import type * as vscode from 'vscode';
import type { AgentResourceDescriptor, CompanionAgentProvider } from './agent-provider.js';
import type { VscodeModelBindingsV1 } from './binding-contracts.js';
import type { StoredBindingResult } from './binding-store.js';
import { buildRuntimeDiagnosticsSnapshot, type RuntimeDiagnosticsReport } from './diagnostics.js';
import { loadAndStageGeneration, readManifestActorsSafe } from './generation-loader.js';
import { resolveCandidateRoots, type HostGuardStatus } from './installation-roots.js';
import type { CatalogSnapshot } from './model-catalog.js';
import type { StagedGenerationResult } from './resource-storage.js';
import { CompanionContractError, STORAGE_AND_SOURCE_BOUNDS } from './runtime-contracts.js';

export interface ReconcileState {
  currentGenerationId: number;
  readonly stagedByInventoryKey: Map<string, StagedGenerationResult>;
  readonly generationIdByInventoryKey: Map<string, number>;
  currentRootIdentity: string | null;
  currentPluginFsPath: string | null;
  catalogSnapshot: CatalogSnapshot | null;
  catalogRevisionCounter: number;
  catalogNeedsRequery: boolean;
  lastDiagnosticsReport: RuntimeDiagnosticsReport | null;
}

export interface ReconcileEnvDeps {
  readonly instanceUuid: string;
  readonly baseStorageFsPath: string;
  readonly tryRegisterProvider: () => HostGuardStatus;
  readonly getActiveProvider: () => CompanionAgentProvider | null;
  readonly withdrawProvider: () => void;
  readonly getWorkspaceFolderPaths: () => readonly string[];
  readonly getCustomHomePath?: () => string | undefined;
  readonly getApprovedRoots: () => ReadonlySet<string>;
  readonly getExplicitSelectedRootIdentity: () => string | null;
  readonly getStoredBindings: (rootIdentity: string | null) => { readonly userRes: StoredBindingResult; readonly rootRes: StoredBindingResult };
  readonly queryCatalog: (revision: number) => Promise<CatalogSnapshot>;
  readonly createUri: (fsPath: string) => vscode.Uri;
  readonly onErrorMessage?: (message: string) => void;
  readonly ensureCatalogSubscribed?: () => void;
  readonly syncTemplateWatcher: (pluginFsPath: string) => void;
  readonly disposeTemplateWatcher: () => void;
  readonly scheduleLockContentionRetry?: () => void;
  readonly isSuperseded: () => boolean;
}

export function hasAnyConfiguredModelBinding(
  userBindings: VscodeModelBindingsV1 | null,
  rootBindings: VscodeModelBindingsV1 | null
): boolean {
  for (const bindings of [userBindings, rootBindings]) {
    if (!bindings) continue;
    if (Object.keys(bindings.tiers).length > 0) return true;
    for (const entry of Object.values(bindings.actors)) {
      if (entry.kind === 'model') return true;
    }
  }
  return false;
}

export function withdrawWithDiagnosticSnapshot(input: {
  readonly state: ReconcileState; readonly deps: ReconcileEnvDeps; readonly authority: 'local-file' | 'unsupported-remote';
  readonly rootIdentity: string | null; readonly pluginFsPath: string | null; readonly reason: string | null;
  readonly storageExhausted: boolean; readonly corruptError: string | null;
}): boolean {
  const { state, deps, authority, rootIdentity, pluginFsPath, reason, storageExhausted, corruptError } = input;
  deps.withdrawProvider();
  if (!rootIdentity) {
    state.currentRootIdentity = null;
    state.currentPluginFsPath = null;
    deps.disposeTemplateWatcher();
  }
  const { userRes, rootRes } = authority === 'local-file' ? deps.getStoredBindings(rootIdentity) : { userRes: { ok: true as const, bindings: null }, rootRes: { ok: true as const, bindings: null } };
  state.lastDiagnosticsReport = buildRuntimeDiagnosticsSnapshot({
    rootIdentity, authority, instanceUuid: deps.instanceUuid, generationId: state.currentGenerationId,
    baseStorageFsPath: deps.baseStorageFsPath, catalogRevision: state.catalogSnapshot?.revision ?? 0,
    templateInventorySha256: null, manifestActors: readManifestActorsSafe(pluginFsPath),
    rootBindings: rootRes.ok ? rootRes.bindings : null, userBindings: userRes.ok ? userRes.bindings : null,
    catalog: state.catalogSnapshot?.models ?? [], publishedActorIds: [],
    setupOrInvalidationReason: reason, storageExhausted, corruptBindingsError: corruptError
  });
  return false;
}

export async function executeRefreshPass(state: ReconcileState, deps: ReconcileEnvDeps): Promise<boolean> {
  const guard = deps.tryRegisterProvider();
  const activeProvider = deps.getActiveProvider();
  if (!guard.qualified || !activeProvider) {
    return withdrawWithDiagnosticSnapshot({
      state, deps, authority: guard.authority, rootIdentity: null, pluginFsPath: null,
      reason: guard.reason ?? 'HOST_UNQUALIFIED', storageExhausted: false, corruptError: null
    });
  }
  let installation;
  try {
    installation = resolveCandidateRoots({
      workspaceFolderPaths: deps.getWorkspaceFolderPaths(), customHomePath: deps.getCustomHomePath?.(),
      approvedRoots: deps.getApprovedRoots(), explicitSelectedRootIdentity: deps.getExplicitSelectedRootIdentity(),
      workspaceTrusted: guard.workspaceTrusted, remoteAuthority: guard.remoteAuthority
    });
  } catch (err: unknown) {
    const code = err instanceof CompanionContractError ? err.code : 'NO_INSTALLATION_FOUND';
    return withdrawWithDiagnosticSnapshot({
      state, deps, authority: guard.authority, rootIdentity: null, pluginFsPath: null,
      reason: code, storageExhausted: false, corruptError: null
    });
  }
  state.currentRootIdentity = installation.rootIdentity;
  state.currentPluginFsPath = installation.pluginFsPath;
  deps.syncTemplateWatcher(installation.pluginFsPath);

  const { userRes, rootRes } = deps.getStoredBindings(installation.rootIdentity);
  if (!userRes.ok || !rootRes.ok) {
    const badError = !userRes.ok ? userRes.error : rootRes.ok ? null : rootRes.error;
    if (badError) deps.onErrorMessage?.(`EVCrate: Model bindings corrupt: ${badError.message}`);
    return withdrawWithDiagnosticSnapshot({
      state, deps, authority: guard.authority, rootIdentity: installation.rootIdentity,
      pluginFsPath: installation.pluginFsPath, reason: null, storageExhausted: false,
      corruptError: `CORRUPT_STORED_BINDINGS: ${badError?.code ?? 'INVALID'}`
    });
  }

  const needsCatalog = state.catalogNeedsRequery
    || (hasAnyConfiguredModelBinding(userRes.bindings, rootRes.bindings) && !state.catalogSnapshot);
  if (needsCatalog) {
    deps.ensureCatalogSubscribed?.();
    const nextCatRev = state.catalogRevisionCounter + 1;
    try {
      const snap = await deps.queryCatalog(nextCatRev);
      if (deps.isSuperseded()) return false;
      state.catalogNeedsRequery = false;
      state.catalogRevisionCounter = nextCatRev;
      state.catalogSnapshot = snap;
    } catch {
      if (deps.isSuperseded()) return false;
      state.catalogNeedsRequery = false;
      state.catalogSnapshot = null;
    }
  }
  if (deps.isSuperseded()) return false;

  try {
    const loadResult = loadAndStageGeneration({
      pluginFsPath: installation.pluginFsPath, baseStorageFsPath: deps.baseStorageFsPath,
      rootIdentity: installation.rootIdentity, instanceUuid: deps.instanceUuid,
      generationId: state.currentGenerationId + 1, knownStagedGenerations: state.stagedByInventoryKey,
      rootBindings: rootRes.bindings, userBindings: userRes.bindings, catalog: state.catalogSnapshot?.models ?? []
    });
    if (deps.isSuperseded()) return false;
    const staged = loadResult.staged;
    if (staged && activeProvider && loadResult.inventoryKey) {
      if (!loadResult.reusedExistingGeneration) {
        state.currentGenerationId += 1;
        if (state.stagedByInventoryKey.size >= STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceGenerations) {
          const oldestKey = state.stagedByInventoryKey.keys().next().value;
          if (oldestKey !== undefined) {
            state.stagedByInventoryKey.delete(oldestKey);
            state.generationIdByInventoryKey.delete(oldestKey);
          }
        }
        state.stagedByInventoryKey.set(loadResult.inventoryKey, staged);
        state.generationIdByInventoryKey.set(loadResult.inventoryKey, state.currentGenerationId);
      }
      const resources: AgentResourceDescriptor[] = Object.entries(staged.publishedActorFiles).map(([id, filePath]) => ({
        actorId: id, uri: deps.createUri(filePath), fsPath: filePath
      }));
      const changed = activeProvider.updateInventory(resources);
      state.lastDiagnosticsReport = buildRuntimeDiagnosticsSnapshot({
        rootIdentity: installation.rootIdentity, authority: guard.authority, instanceUuid: deps.instanceUuid,
        generationId: state.generationIdByInventoryKey.get(loadResult.inventoryKey) ?? state.currentGenerationId,
        baseStorageFsPath: deps.baseStorageFsPath, catalogRevision: state.catalogSnapshot?.revision ?? 0,
        templateInventorySha256: loadResult.templateInventorySha256, manifestActors: loadResult.manifestActors,
        rootBindings: rootRes.bindings, userBindings: userRes.bindings, catalog: state.catalogSnapshot?.models ?? [],
        publishedActorIds: Object.keys(staged.publishedActorFiles), withheldReasons: loadResult.withheldReasons
      });
      return changed;
    }
    deps.withdrawProvider();
    state.lastDiagnosticsReport = buildRuntimeDiagnosticsSnapshot({
      rootIdentity: installation.rootIdentity, authority: guard.authority, instanceUuid: deps.instanceUuid,
      generationId: state.currentGenerationId, baseStorageFsPath: deps.baseStorageFsPath,
      catalogRevision: state.catalogSnapshot?.revision ?? 0, templateInventorySha256: loadResult.templateInventorySha256,
      manifestActors: loadResult.manifestActors, rootBindings: rootRes.bindings, userBindings: userRes.bindings,
      catalog: state.catalogSnapshot?.models ?? [], publishedActorIds: [], withheldReasons: loadResult.withheldReasons
    });
    return false;
  } catch (err: unknown) {
    const code = err instanceof CompanionContractError ? err.code : 'LOAD_FAILED';
    if (code === 'STORAGE_LOCK_CONTENTION') {
      deps.scheduleLockContentionRetry?.();
      return false;
    }
    const isStorageExhausted = code === 'STORAGE_BUDGET_EXCEEDED';
    if (isStorageExhausted && err instanceof Error) deps.onErrorMessage?.(`EVCrate: ${err.message}`);
    return withdrawWithDiagnosticSnapshot({
      state, deps, authority: guard.authority, rootIdentity: installation.rootIdentity,
      pluginFsPath: installation.pluginFsPath, reason: code, storageExhausted: isStorageExhausted, corruptError: null
    });
  }
}
