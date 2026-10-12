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
    const guard = inspectHostGuard({
      remoteAuthority: readHostRemoteAuthority(vscode.env),
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
      const candidateProvider = new CompanionAgentProvider(emitter);
      try {
        activeProviderDisposable = vscode.chat.registerCustomAgentProvider(candidateProvider);
      } catch {
        candidateProvider.dispose();
        return inspectHostGuard({
          remoteAuthority: readHostRemoteAuthority(vscode.env),
          workspaceTrusted: vscode.workspace.isTrusted,
          hasProposal: false
        });
      }
      activeProvider = candidateProvider;
      context.subscriptions.push(activeProviderDisposable);
      context.subscriptions.push(activeProvider);
    }
    return guard;
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
