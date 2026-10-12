import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { AgentResourceDescriptor } from './agent-provider.js';
import { ScopedBindingStore, type StoredBindingResult } from './binding-store.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import { queryChatModelCatalog } from './model-catalog.js';
import { getApprovedRoots } from './installation-commands.js';
import { readHostRemoteAuthority } from './installation-roots.js';
import { registerAllCommands } from './command-registration.js';
import { createProviderManager, type ProviderManager } from './provider-registration.js';
import { RefreshController } from './refresh-controller.js';
import {
  captureCommittedSidebarSnapshot,
  createInitialSidebarSnapshot,
  type SidebarSnapshot
} from './sidebar-snapshot.js';
import { EvcrateSidebarTreeProvider } from './sidebar-tree-provider.js';

const providerManager: ProviderManager = createProviderManager();
let activeController: RefreshController | null = null;
let activeSidebarProvider: EvcrateSidebarTreeProvider | null = null;
let activeTreeViewRegistration: vscode.Disposable | null = null;
let currentSidebarSnapshot: SidebarSnapshot = createInitialSidebarSnapshot();
let mismatchFollowUpUsed = false;
let catalogSubscribed = false;

function readStoredBindingsForContext(
  context: vscode.ExtensionContext,
  rootIdentity: string | null
): { readonly userRes: StoredBindingResult; readonly rootRes: StoredBindingResult } {
  const store = new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env));
  const userRes = store.getUserBindings();
  const rootRes = rootIdentity
    ? store.getRootBindings(rootIdentity)
    : Object.freeze({ ok: true as const, bindings: null });
  return { userRes, rootRes };
}

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
    getStoredBindings: (rootIdentity) => readStoredBindingsForContext(context, rootIdentity),
    queryCatalog: (revision) => queryChatModelCatalog(vscode.lm, revision),
    createUri: (fsPath) => vscode.Uri.file(fsPath),
    onErrorMessage: (message) => { void vscode.window.showErrorMessage(message); },
    ensureCatalogSubscribed: () => ensureCatalogSubscribed(context),
    syncPluginAgentsDir: true,
    onDidCompleteRefresh: () => {
      if (!activeController || !activeSidebarProvider) return;
      const nextSnapshot = captureCommittedSidebarSnapshot({
        report: activeController.lastDiagnosticsReport,
        currentRootIdentity: activeController.currentRootIdentity,
        getStoredBindings: (rootIdentity) => readStoredBindingsForContext(context, rootIdentity),
        catalog: activeController.catalogSnapshot
      });
      currentSidebarSnapshot = nextSnapshot;
      activeSidebarProvider.refresh();
      if (nextSnapshot.report !== null) {
        if (nextSnapshot.settingsPending) {
          if (!mismatchFollowUpUsed) {
            mismatchFollowUpUsed = true;
            void activeController.requestRefresh({ reason: 'bindings-updated' });
          }
        } else {
          mismatchFollowUpUsed = false;
        }
      }
    }
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
  deactivate();
  currentSidebarSnapshot = createInitialSidebarSnapshot();
  const sidebarProvider = new EvcrateSidebarTreeProvider(() => currentSidebarSnapshot);
  activeSidebarProvider = sidebarProvider;
  const treeRegistration = vscode.window.registerTreeDataProvider('evcrate.modelBindingsView', sidebarProvider);
  activeTreeViewRegistration = treeRegistration;
  const controller = ensureController(context);
  void controller.requestRefresh({ reason: 'startup', immediate: true });

  context.subscriptions.push(
    {
      dispose: () => {
        if (activeController === controller) activeController = null;
        controller.dispose();
      }
    },
    {
      dispose: () => {
        if (activeTreeViewRegistration === treeRegistration) activeTreeViewRegistration = null;
        treeRegistration.dispose();
      }
    },
    {
      dispose: () => {
        if (activeSidebarProvider === sidebarProvider) activeSidebarProvider = null;
        sidebarProvider.dispose();
      }
    },
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
    const controller = activeController;
    activeController = null;
    controller.dispose();
  } else {
    providerManager.dispose();
  }
  if (activeTreeViewRegistration) {
    const registration = activeTreeViewRegistration;
    activeTreeViewRegistration = null;
    registration.dispose();
  }
  if (activeSidebarProvider) {
    const provider = activeSidebarProvider;
    activeSidebarProvider = null;
    provider.dispose();
  }
  currentSidebarSnapshot = createInitialSidebarSnapshot();
  mismatchFollowUpUsed = false;
  catalogSubscribed = false;
}
