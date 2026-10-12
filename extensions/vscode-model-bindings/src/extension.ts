import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { inspectHostGuard, resolveCandidateRoots, inspectCandidateRoot, type HostGuardStatus } from './installation-roots.js';
import { loadAndStageGeneration } from './generation-loader.js';
import { CompanionAgentProvider, type AgentResourceDescriptor } from './agent-provider.js';

let activeProvider: CompanionAgentProvider | null = null;
let activeProviderDisposable: vscode.Disposable | null = null;
let activeInstanceUuid: string = randomUUID();
let currentGenerationId = 0;
let activeInventoryKey: string | null = null;
let activeInstanceGenerationsCount = 0;
let activeInstanceBytesTotal = 0;

function getApprovedRoots(context: vscode.ExtensionContext): Set<string> {
  const saved = context.globalState.get<readonly string[]>('evcrate.approvedRoots') ?? [];
  return new Set<string>(saved);
}

function withdrawAndReset(): void {
  activeInventoryKey = null;
  activeProvider?.withdrawInventory();
}

export function tryRegisterProvider(context: vscode.ExtensionContext): HostGuardStatus {
  const guard = inspectHostGuard({
    remoteAuthority: vscode.env.remoteAuthority,
    workspaceTrusted: vscode.workspace.isTrusted,
    hasProposal: typeof vscode.chat?.registerCustomAgentProvider === 'function'
  });
  if (!guard.qualified) {
    if (activeProviderDisposable) {
      activeProviderDisposable.dispose();
      activeProviderDisposable = null;
    }
    if (activeProvider) {
      activeProvider.dispose();
      activeProvider = null;
    }
    return guard;
  }
  if (!activeProvider) {
    const emitter = new vscode.EventEmitter<void>();
    activeProvider = new CompanionAgentProvider(emitter);
    activeProviderDisposable = vscode.chat.registerCustomAgentProvider(activeProvider);
    context.subscriptions.push(activeProviderDisposable);
    context.subscriptions.push(activeProvider);
  }
  return guard;
}

export async function refreshActiveGeneration(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    const guard = tryRegisterProvider(context);
    if (!guard.qualified || !activeProvider) {
      withdrawAndReset();
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
      withdrawAndReset();
      return false;
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
      }
    });
    if (loadResult.staged) {
      currentGenerationId += 1;
      activeInstanceGenerationsCount += 1;
      activeInstanceBytesTotal += loadResult.staged.totalBytes;
      activeInventoryKey = loadResult.inventoryKey;
      const resources: AgentResourceDescriptor[] = Object.entries(loadResult.staged.publishedActorFiles).map(([id, filePath]) => ({
        actorId: id,
        uri: vscode.Uri.file(filePath),
        fsPath: filePath
      }));
      return activeProvider.updateInventory(resources);
    }
    if (loadResult.contributedCount === 0) {
      withdrawAndReset();
      return false;
    }
    return false;
  } catch {
    withdrawAndReset();
    return false;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  activeInstanceUuid = randomUUID();
  currentGenerationId = 0;
  activeInventoryKey = null;
  activeInstanceGenerationsCount = 0;
  activeInstanceBytesTotal = 0;

  tryRegisterProvider(context);
  void refreshActiveGeneration(context);

  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => { void refreshActiveGeneration(context); }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void refreshActiveGeneration(context); }),
    vscode.commands.registerCommand('evcrate.selectInstallation', async () => {
      const folderPaths = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
      const candidates = folderPaths.map((p) => inspectCandidateRoot(p, false, true)).filter((c) => c.present && c.valid);
      const homePath = join(homedir(), '.evcrate-vscode');
      const homeCand = inspectCandidateRoot(homePath, false, false);
      if (homeCand.present && homeCand.valid) candidates.push(homeCand);

      if (candidates.length === 0) {
        void vscode.window.showWarningMessage('EVCrate: No valid installations found in workspace or HOME');
        return;
      }
      const items = candidates.map((c) => ({
        label: typeof c.uri === 'string' ? c.uri : c.uri.path,
        description: typeof c.uri === 'string' && c.uri.includes('.evcrate-vscode') ? 'Project installation' : 'HOME installation'
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select EVCrate installation root to approve and activate' });
      if (picked) {
        const approved = getApprovedRoots(context);
        approved.add(picked.label);
        await context.globalState.update('evcrate.approvedRoots', [...approved]);
        await context.globalState.update('evcrate.selectedRootIdentity', picked.label);
        await refreshActiveGeneration(context);
        void vscode.window.showInformationMessage(`EVCrate: Activated root "${picked.label}"`);
      }
    }),
    vscode.commands.registerCommand('evcrate.showModelBindings', async () => {
      const count = activeProvider?.currentResources.length ?? 0;
      void vscode.window.showInformationMessage(`EVCrate: Active (Instance: ${activeInstanceUuid}, Generation: ${currentGenerationId}, Actors: ${count})`);
    }),
    vscode.commands.registerCommand('evcrate.configureAgentModels', async () => {
      void vscode.window.showInformationMessage('EVCrate: Configure Agent Model Tiers (runtime model picker)');
    }),
    vscode.commands.registerCommand('evcrate.configureActorModel', async () => {
      void vscode.window.showInformationMessage('EVCrate: Configure Actor Model Override');
    }),
    vscode.commands.registerCommand('evcrate.clearModelBindings', async () => {
      await refreshActiveGeneration(context);
      void vscode.window.showInformationMessage('EVCrate: Model bindings reset');
    })
  );
}

export function deactivate(): void {
  withdrawAndReset();
  if (activeProviderDisposable) {
    activeProviderDisposable.dispose();
    activeProviderDisposable = null;
  }
  if (activeProvider) {
    activeProvider.dispose();
    activeProvider = null;
  }
}
