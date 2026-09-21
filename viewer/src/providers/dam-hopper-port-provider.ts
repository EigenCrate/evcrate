/**
 * @file dam-hopper-port-provider.ts
 * Bounded MessagePort data provider for DamHopper Advisor Plugin (Phase E03).
 */

import {
  UI_BRIDGE_VERSION,
  validateBridgeMessage,
  type HostBootstrapMessage,
  type BridgeResponseMessage
} from './bridge-contract.ts';
import type {
  AdvisorDataProvider,
  ProviderContextDescriptor,
  ProviderEventListener,
  HistoryRefreshResultV1,
  HistorySummaryQueryV1,
  HistorySummaryResultV1,
  HistoryPageResultV1,
  HistoryDetailResultV1,
  PolicyReadCurrentResultV1,
  EvaluationsListResultV1,
  EvaluationsReadResultV1,
  EvaluationsCompareResultV1
} from './advisor-data-provider.ts';

interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class DamHopperPortProvider implements AdvisorDataProvider {
  private _port: MessagePort | null = null;
  private _state: 'uninitialized' | 'bootstrapping' | 'awaiting-ack' | 'ready' | 'revoked' = 'uninitialized';
  private _frameSession: string | null = null;
  private _activationGeneration = 0;
  private _capabilities: readonly string[] = [];
  private _isAvailable = false;
  private _listeners = new Set<ProviderEventListener>();
  private _pending = new Map<string, PendingRequest>();
  private _windowListener: ((event: MessageEvent) => void) | null = null;

  constructor(autoBootstrap = true) {
    if (autoBootstrap && typeof window !== 'undefined') this._initWindowBootstrap();
  }

  get descriptor(): ProviderContextDescriptor {
    return {
      kind: 'dam-hopper',
      label: 'DamHopper Workspace',
      capabilities: this._capabilities,
      frameSession: this._frameSession,
      activationGeneration: this._activationGeneration,
      isAvailable: this._isAvailable && this._state === 'ready',
      hasHistorySource: this._capabilities.includes('history.refresh'),
      hasPolicySource: this._capabilities.includes('policy.readCurrent'),
      hasEvaluationSource: this._capabilities.includes('evaluations.list')
    };
  }

  subscribe(listener: ProviderEventListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _emit(event: Parameters<ProviderEventListener>[0]): void {
    for (const l of this._listeners) { try { l(event); } catch {} }
  }

  private _initWindowBootstrap(): void {
    if (this._windowListener) return;
    this._state = 'bootstrapping';
    this._windowListener = (event: MessageEvent) => {
      try {
        const msg = validateBridgeMessage(event.data);
        if (msg.type !== 'host.bootstrap') return;
        this.handleBootstrap(msg as HostBootstrapMessage, event.ports[0]);
      } catch {}
    };
    window.addEventListener('message', this._windowListener);
  }

  handleBootstrap(msg: HostBootstrapMessage, port?: MessagePort): void {
    if (this._state === 'ready' || this._state === 'awaiting-ack') return;
    if (!port) throw new Error('Bootstrap message missing transferred MessagePort');
    if (msg.pluginId !== 'evcrate.advisor') throw new Error(`Unexpected pluginId: ${msg.pluginId}`);

    if (this._windowListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this._windowListener);
      this._windowListener = null;
    }

    this._port = port;
    this._frameSession = msg.frameSession;
    this._activationGeneration = msg.activationGeneration;
    this._capabilities = Object.freeze([...msg.capabilities]);
    this._state = 'awaiting-ack';

    port.onmessage = (e: MessageEvent) => this._handlePortMessage(e.data);
    port.onmessageerror = () => this._revoke('MessagePort serialization error');

    port.postMessage({
      type: 'frame.portAck',
      frameSession: this._frameSession,
      bridgeVersion: UI_BRIDGE_VERSION,
      activationGeneration: this._activationGeneration,
      nonce: msg.nonce
    });
  }

  private _handlePortMessage(data: unknown): void {
    try {
      const msg = validateBridgeMessage(data);
      if (msg.frameSession !== this._frameSession || msg.activationGeneration !== this._activationGeneration) return;
      if (msg.type === 'frame.ready') {
        this._state = 'ready';
        this._isAvailable = true;
        this._emit({ type: 'ready', descriptor: this.descriptor });
      } else if (msg.type === 'context.revoked') {
        this._revoke(msg.reason ?? 'Host revoked context');
      } else if (msg.type === 'availability.changed') {
        this._isAvailable = msg.available;
        this._capabilities = Object.freeze([...msg.capabilities]);
        this._emit({ type: 'availability-changed', available: msg.available, capabilities: this._capabilities });
      } else if (msg.type === 'response') {
        const pending = this._pending.get(msg.requestId);
        if (pending) {
          this._pending.delete(msg.requestId);
          const resp = msg as BridgeResponseMessage;
          if (resp.error) pending.reject(new Error(resp.error.message || `Bridge error: ${resp.error.code}`));
          else pending.resolve(resp.result);
        }
      }
    } catch {}
  }

  private _revoke(reason: string): void {
    this._state = 'revoked';
    this._isAvailable = false;
    for (const [, req] of this._pending) req.reject(new Error(`Operation cancelled: ${reason}`));
    this._pending.clear();
    if (this._port) { try { this._port.close(); } catch {}; this._port = null; }
    this._emit({ type: 'revoked', reason });
  }

  private _invoke<T>(operation: string, requestId: string, params?: unknown): Promise<T> {
    if (this._state !== 'ready' || !this._port) return Promise.reject(new Error(`Provider not ready (state: ${this._state})`));
    return new Promise<T>((resolve, reject) => {
      this._pending.set(requestId, { resolve: resolve as (r: unknown) => void, reject });
      this._port!.postMessage({
        type: 'request', frameSession: this._frameSession, bridgeVersion: UI_BRIDGE_VERSION,
        activationGeneration: this._activationGeneration, requestId, operation, params
      });
    });
  }

  refreshHistory(requestId: string): Promise<HistoryRefreshResultV1> { return this._invoke('history.refresh', requestId, {}); }
  getHistorySummary(requestId: string, snapshotId: string, query: HistorySummaryQueryV1): Promise<HistorySummaryResultV1> { return this._invoke('history.summary', requestId, { snapshot_id: snapshotId, query }); }
  getHistoryPage(requestId: string, snapshotId: string, query: HistorySummaryQueryV1, sort: 'started_at_desc', cursor: string | null, limit: number): Promise<HistoryPageResultV1> { return this._invoke('history.page', requestId, { snapshot_id: snapshotId, query, sort, cursor, limit }); }
  getHistoryDetail(requestId: string, snapshotId: string, recordRef: string): Promise<HistoryDetailResultV1> { return this._invoke('history.detail', requestId, { snapshot_id: snapshotId, record_ref: recordRef }); }
  readCurrentPolicy(requestId: string): Promise<PolicyReadCurrentResultV1> { return this._invoke('policy.readCurrent', requestId, {}); }
  listEvaluations(requestId: string, cursor: string | null, limit: number): Promise<EvaluationsListResultV1> { return this._invoke('evaluations.list', requestId, { cursor, limit }); }
  readEvaluation(requestId: string, evaluationRef: string, expectedRevision: string): Promise<EvaluationsReadResultV1> { return this._invoke('evaluations.read', requestId, { evaluation_ref: evaluationRef, expected_revision: expectedRevision }); }
  compareEvaluations(requestId: string, items: readonly { evaluation_ref: string; expected_revision: string }[], cursor: string | null, limit: number): Promise<EvaluationsCompareResultV1> { return this._invoke('evaluations.compare', requestId, { items, cursor, limit }); }

  cancel(requestId: string): void {
    if (!this._port || this._state !== 'ready') return;
    const req = this._pending.get(requestId);
    if (req) { req.reject(new Error('Operation cancelled by user')); this._pending.delete(requestId); }
    this._port.postMessage({
      type: 'cancel', frameSession: this._frameSession, bridgeVersion: UI_BRIDGE_VERSION,
      activationGeneration: this._activationGeneration, requestId
    });
  }

  destroy(): void {
    if (this._windowListener && typeof window !== 'undefined') {
      window.removeEventListener('message', this._windowListener);
      this._windowListener = null;
    }
    this._revoke('Provider destroyed');
  }
}
