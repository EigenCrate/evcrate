import type * as vscode from 'vscode';

export interface AgentResourceDescriptor {
  readonly actorId: string;
  readonly uri: vscode.Uri;
  readonly fsPath: string;
}

export interface ProviderEventEmitter {
  readonly event: vscode.Event<void>;
  fire(): void;
  dispose(): void;
}

export class CompanionAgentProvider implements vscode.chat.ChatCustomAgentProvider {
  private _disposed = false;
  private _activeResources: readonly AgentResourceDescriptor[] = [];
  private readonly _emitter: ProviderEventEmitter;

  constructor(emitter: ProviderEventEmitter) {
    this._emitter = emitter;
  }

  get onDidChangeCustomAgents(): vscode.Event<void> {
    return this._emitter.event;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  get currentResources(): readonly AgentResourceDescriptor[] {
    return this._activeResources;
  }

  provideCustomAgents(
    contextOrToken?: vscode.CancellationToken | Record<string, unknown>,
    maybeToken?: vscode.CancellationToken
  ): vscode.chat.ChatResource[] {
    const cancelled =
      (contextOrToken !== undefined &&
        contextOrToken !== null &&
        'isCancellationRequested' in contextOrToken &&
        contextOrToken.isCancellationRequested === true) ||
      maybeToken?.isCancellationRequested === true;
    if (this._disposed || cancelled) {
      return [];
    }
    return this._activeResources.map((res) => ({ uri: res.uri }));
  }

  updateInventory(newResources: readonly AgentResourceDescriptor[]): boolean {
    if (this._disposed) return false;
    const oldKeys = this._activeResources.map((r) => `${r.actorId}:${r.uri.toString()}`).sort().join(';');
    const newKeys = newResources.map((r) => `${r.actorId}:${r.uri.toString()}`).sort().join(';');
    if (oldKeys === newKeys) {
      return false;
    }
    this._activeResources = Object.freeze([...newResources]);
    this._emitter.fire();
    return true;
  }

  withdrawInventory(): boolean {
    if (this._disposed || this._activeResources.length === 0) return false;
    this._activeResources = [];
    this._emitter.fire();
    return true;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._activeResources = [];
    this._emitter.dispose();
  }
}
