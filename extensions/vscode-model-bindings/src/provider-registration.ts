import * as vscode from 'vscode';
import { inspectHostGuard, readHostRemoteAuthority, type HostGuardStatus } from './installation-roots.js';
import { CompanionAgentProvider } from './agent-provider.js';

export interface ProviderManager {
  readonly getActiveProvider: () => CompanionAgentProvider | null;
  readonly getActiveProviderDisposable: () => vscode.Disposable | null;
  readonly tryRegister: (context: vscode.ExtensionContext) => HostGuardStatus;
  readonly withdrawAndReset: () => void;
  readonly dispose: () => void;
}

export function createProviderManager(): ProviderManager {
  let activeProvider: CompanionAgentProvider | null = null;
  let activeProviderDisposable: vscode.Disposable | null = null;

  function withdrawAndReset(): void {
    activeProvider?.withdrawInventory();
  }

  function tryRegister(context: vscode.ExtensionContext): HostGuardStatus {
    const remoteAuthority = readHostRemoteAuthority(vscode.env);
    const workspaceTrusted = vscode.workspace.isTrusted;
    const baseGuard = inspectHostGuard({
      remoteAuthority,
      workspaceTrusted,
      hasProposal: true
    });
    if (!baseGuard.qualified) {
      if (activeProviderDisposable) {
        activeProviderDisposable.dispose();
        activeProviderDisposable = null;
      }
      if (activeProvider) {
        activeProvider.dispose();
        activeProvider = null;
      }
      return baseGuard;
    }
    if (!activeProvider) {
      const emitter = new vscode.EventEmitter<void>();
      const candidateProvider = new CompanionAgentProvider(emitter);
      let proposalSupported = false;
      if (typeof vscode.chat?.registerCustomAgentProvider === 'function') {
        try {
          activeProviderDisposable = vscode.chat.registerCustomAgentProvider({
            onDidChangeCustomAgents: candidateProvider.onDidChangeCustomAgents,
            provideCustomAgents: (
              ctxOrToken?: vscode.CancellationToken | Record<string, unknown>,
              token?: vscode.CancellationToken
            ) => {
              if (typeof vscode.workspace.getConfiguration === 'function') {
                const pluginLocs = vscode.workspace.getConfiguration('chat').get<Record<string, boolean>>('pluginLocations');
                if (pluginLocs && Object.values(pluginLocs).some(Boolean)) {
                  return [];
                }
              }
              return candidateProvider.provideCustomAgents(ctxOrToken, token);
            }
          });
          proposalSupported = true;
          context.subscriptions.push(activeProviderDisposable);
        } catch {
          proposalSupported = false;
        }
      }
      activeProvider = candidateProvider;
      context.subscriptions.push(activeProvider);
      return Object.freeze({
        qualified: true,
        authority: 'local-file',
        remoteAuthority: null,
        workspaceTrusted: true,
        proposalSupported
      });
    }
    return Object.freeze({
      qualified: true,
      authority: 'local-file',
      remoteAuthority: null,
      workspaceTrusted: true,
      proposalSupported: activeProviderDisposable !== null
    });
  }

  function dispose(): void {
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

  return {
    getActiveProvider: () => activeProvider,
    getActiveProviderDisposable: () => activeProviderDisposable,
    tryRegister,
    withdrawAndReset,
    dispose
  };
}
