import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { AgentResourceDescriptor } from './agent-provider.js';
import { ScopedBindingStore } from './binding-store.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import { queryChatModelCatalog } from './model-catalog.js';
import { getApprovedRoots } from './installation-commands.js';
import { readHostRemoteAuthority } from './installation-roots.js';
import { registerAllCommands } from './command-registration.js';
import { createProviderManager, type ProviderManager } from './provider-registration.js';
import { RefreshController } from './refresh-controller.js';

const providerManager: ProviderManager = createProviderManager();
let activeController: RefreshController | null = null;
let catalogSubscribed = false;

function ensureCatalogSubscribed(context: vscode.ExtensionContext): void {
  if (catalogSubscribed) return;
  catalogSubscribed = true;
  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      void activeController?.requestRefresh({
        reason: 'catalog-changed',
        forceCatalogQuery: true
      });
    })
  );
}

function ensureController(context: vscode.ExtensionContext): RefreshController {
  if (activeController) return activeController;
  const baseStorage = context.storageUri?.fsPath ?? context.globalStorageUri?.fsPath ?? '';
  activeController = new RefreshController({
    instanceUuid: randomUUID(),
    baseStorageFsPath: baseStorage,
    tryRegisterProvider: () => providerManager.tryRegister(context),
    getActiveProvider: () => providerManager.getActiveProvider(),
    withdrawProvider: () => providerManager.withdrawAndReset(),
    disposeProvider: () => providerManager.dispose(),
    getWorkspaceFolderPaths: () => vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [],
    getApprovedRoots: () => getApprovedRoots(context),
    getExplicitSelectedRootIdentity: () => context.globalState.get<string>('evcrate.selectedRootIdentity') ?? null,
    getStoredBindings: (rootIdentity) => {
      const store = new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env));
      const userRes = store.getUserBindings();
      const rootRes = rootIdentity
        ? store.getRootBindings(rootIdentity)
        : Object.freeze({ ok: true as const, bindings: null });
      return { userRes, rootRes };
    },
    queryCatalog: (revision) => queryChatModelCatalog(vscode.lm, revision),
    createUri: (fsPath) => vscode.Uri.file(fsPath),
    onErrorMessage: (message) => { void vscode.window.showErrorMessage(message); },
    ensureCatalogSubscribed: () => ensureCatalogSubscribed(context),
    syncPluginAgentsDir: true
  });
  return activeController;
}

export async function refreshActiveGeneration(context: vscode.ExtensionContext): Promise<boolean> {
  const controller = ensureController(context);
  return controller.requestRefresh({ reason: 'manual', immediate: true });
}

export interface CompanionExtensionExports {
  readonly getLatestDiagnosticsReport: () => RuntimeDiagnosticsReport | null;
  readonly getCurrentGenerationId: () => number;
  readonly getCurrentRootIdentity: () => string | null;
  readonly getContributedResources: () => readonly AgentResourceDescriptor[];
  readonly refresh: () => Promise<boolean>;
}

export function activate(context: vscode.ExtensionContext): CompanionExtensionExports {
  if (activeController) {
    activeController.dispose();
    activeController = null;
  }
  catalogSubscribed = false;
  const controller = ensureController(context);
  void controller.requestRefresh({ reason: 'startup', immediate: true });

  context.subscriptions.push(
    { dispose: () => controller.dispose() },
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      void controller.requestRefresh({ reason: 'trust-changed', immediate: true });
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void controller.requestRefresh({ reason: 'root-changed' });
    }),
    ...registerAllCommands(context, {
      getCurrentRootIdentity: () => controller.currentRootIdentity,
      getPluginFsPath: () => controller.currentPluginFsPath,
      refreshActiveGeneration: () => controller.requestRefresh({ reason: 'bindings-updated', immediate: true }),
      queryAndRefresh: () => controller.requestRefresh({
        reason: 'bindings-updated',
        immediate: true,
        forceCatalogQuery: true
      }),
      getActiveProvider: () => providerManager.getActiveProvider(),
      getInstanceUuid: () => controller.instanceUuid,
      getGenerationId: () => controller.currentGenerationId,
      getCatalogSnapshot: () => controller.catalogSnapshot,
      getLatestDiagnosticsReport: () => controller.lastDiagnosticsReport,
      ensureCatalogSubscribed: () => ensureCatalogSubscribed(context)
    })
  );

  return Object.freeze({
    getLatestDiagnosticsReport: () => controller.lastDiagnosticsReport,
    getCurrentGenerationId: () => controller.currentGenerationId,
    getCurrentRootIdentity: () => controller.currentRootIdentity,
    getContributedResources: () => providerManager.getActiveProvider()?.currentResources ?? [],
    refresh: () => controller.requestRefresh({ reason: 'manual', immediate: true })
  });
}

export function deactivate(): void {
  if (activeController) {
    activeController.dispose();
    activeController = null;
  } else {
    providerManager.dispose();
  }
  catalogSubscribed = false;
}
