import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { resolveCandidateRoots } from './installation-roots.js';
import { loadAndStageGeneration } from './generation-loader.js';
import { type AgentResourceDescriptor } from './agent-provider.js';
import { ScopedBindingStore } from './binding-store.js';
import { queryChatModelCatalog, type CatalogSnapshot } from './model-catalog.js';
import { getApprovedRoots } from './installation-commands.js';
import { registerAllCommands } from './command-registration.js';
import { createProviderManager, type ProviderManager } from './provider-registration.js';

const providerManager: ProviderManager = createProviderManager();
let activeInstanceUuid: string = randomUUID();
let currentGenerationId = 0, activeInventoryKey: string | null = null;
let activeInstanceGenerationsCount = 0, activeInstanceBytesTotal = 0;
let currentResolvedRootIdentity: string | null = null, currentPluginFsPath: string | null = null;
let catalogSnapshot: CatalogSnapshot | null = null, catalogSubscribed = false;
let activeRefreshPromise: Promise<boolean> | null = null, pendingRefreshRequested = false;

function ensureCatalogSubscribed(context: vscode.ExtensionContext): void {
  if (catalogSubscribed) return;
  catalogSubscribed = true;
  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      void queryChatModelCatalog(vscode.lm)
        .then((snap) => {
          catalogSnapshot = snap;
          void refreshActiveGeneration(context);
        })
        .catch(() => {});
    })
  );
}

async function doRefreshActiveGeneration(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    const guard = providerManager.tryRegister(context);
    const activeProvider = providerManager.getActiveProvider();
    if (!guard.qualified || !activeProvider) {
      activeInventoryKey = null;
      providerManager.withdrawAndReset();
      return false;
    }
    const folderPaths = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
    const approvedRoots = getApprovedRoots(context);
    const explicitSelectedRootIdentity = context.globalState.get<string>('evcrate.selectedRootIdentity') ?? null;
    let installation;
    try {
      installation = resolveCandidateRoots({
        workspaceFolderPaths: folderPaths,
        approvedRoots,
        explicitSelectedRootIdentity,
        workspaceTrusted: guard.workspaceTrusted,
        remoteAuthority: guard.remoteAuthority
      });
    } catch {
      activeInventoryKey = null;
      providerManager.withdrawAndReset();
      return false;
    }
    currentResolvedRootIdentity = installation.rootIdentity;
    currentPluginFsPath = installation.pluginFsPath;

    const store = new ScopedBindingStore(context.globalState, context.workspaceState, vscode.env.remoteAuthority);
    const userRes = store.getUserBindings();
    if (!userRes.ok) {
      activeInventoryKey = null;
      providerManager.withdrawAndReset();
      void vscode.window.showErrorMessage(`EVCrate: User model bindings corrupt: ${userRes.error.message}`);
      return false;
    }
    const rootRes = store.getRootBindings(installation.rootIdentity);
    if (!rootRes.ok) {
      activeInventoryKey = null;
      providerManager.withdrawAndReset();
      void vscode.window.showErrorMessage(`EVCrate: Root model bindings corrupt: ${rootRes.error.message}`);
      return false;
    }
    const hasBindings = Boolean(
      (userRes.bindings && Object.keys(userRes.bindings.tiers).length > 0) ||
      (rootRes.bindings && Object.keys(rootRes.bindings.tiers).length > 0)
    );
    if (hasBindings && !catalogSnapshot) {
      ensureCatalogSubscribed(context);
      try { catalogSnapshot = await queryChatModelCatalog(vscode.lm); } catch {}
    }
    const baseStorage = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
    const loadResult = loadAndStageGeneration({
      pluginFsPath: installation.pluginFsPath,
      baseStorageFsPath: baseStorage,
      rootIdentity: installation.rootIdentity,
      instanceUuid: activeInstanceUuid,
      generationId: currentGenerationId + 1,
      activeInventoryKey,
      currentUsage: {
        activeInstanceGenerations: activeInstanceGenerationsCount,
        activeInstanceBytes: activeInstanceBytesTotal,
        persistentAuthorityBytes: activeInstanceBytesTotal
      },
      rootBindings: rootRes.bindings,
      userBindings: userRes.bindings,
      catalog: catalogSnapshot?.models ?? []
    });
    const staged = loadResult.staged;
    if (staged && activeProvider) {
      currentGenerationId += 1;
      activeInstanceGenerationsCount += 1;
      activeInstanceBytesTotal += staged.totalBytes;
      activeInventoryKey = loadResult.inventoryKey;
      const resources: AgentResourceDescriptor[] = Object.entries(staged.publishedActorFiles).map(([id, filePath]) => ({
        actorId: id,
        uri: vscode.Uri.file(filePath),
        fsPath: filePath
      }));
      return activeProvider.updateInventory(resources);
    }
    if (loadResult.contributedCount === 0) {
      activeInventoryKey = null;
      providerManager.withdrawAndReset();
      return false;
    }
    return false;
  } catch {
    activeInventoryKey = null;
    providerManager.withdrawAndReset();
    return false;
  }
}

export async function refreshActiveGeneration(context: vscode.ExtensionContext): Promise<boolean> {
  if (activeRefreshPromise) {
    pendingRefreshRequested = true;
    return activeRefreshPromise;
  }
  activeRefreshPromise = (async () => {
    try {
      return await doRefreshActiveGeneration(context);
    } finally {
      activeRefreshPromise = null;
      if (pendingRefreshRequested) {
        pendingRefreshRequested = false;
        void refreshActiveGeneration(context);
      }
    }
  })();
  return activeRefreshPromise;
}

export function activate(context: vscode.ExtensionContext): void {
  activeInstanceUuid = randomUUID();
  currentGenerationId = 0;
  activeInventoryKey = null;
  activeInstanceGenerationsCount = 0;
  activeInstanceBytesTotal = 0;
  currentResolvedRootIdentity = null;
  currentPluginFsPath = null;
  catalogSnapshot = null;
  catalogSubscribed = false;

  providerManager.tryRegister(context);
  void refreshActiveGeneration(context);

  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => { void refreshActiveGeneration(context); }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void refreshActiveGeneration(context); }),
    ...registerAllCommands(context, {
      getCurrentRootIdentity: () => currentResolvedRootIdentity,
      getPluginFsPath: () => currentPluginFsPath,
      refreshActiveGeneration: () => refreshActiveGeneration(context),
      queryAndRefresh: async () => {
        catalogSnapshot = await queryChatModelCatalog(vscode.lm);
        return refreshActiveGeneration(context);
      },
      getActiveProvider: () => providerManager.getActiveProvider(),
      getInstanceUuid: () => activeInstanceUuid,
      getGenerationId: () => currentGenerationId,
      getCatalogSnapshot: () => catalogSnapshot,
      ensureCatalogSubscribed: () => ensureCatalogSubscribed(context)
    })
  );
}

export function deactivate(): void {
  activeInventoryKey = null;
  providerManager.dispose();
  currentResolvedRootIdentity = null;
  currentPluginFsPath = null;
  catalogSnapshot = null;
  catalogSubscribed = false;
}
