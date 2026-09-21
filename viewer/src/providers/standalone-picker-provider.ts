/**
 * @file standalone-picker-provider.ts
 * G4 transition adapter for standalone EVCrate viewer using File System Access API.
 */

import type { FileSystemDirectoryHandle } from '../io/file-system-access.d.ts';
import { HistoryReader, selectHistoryDirectory, type HistorySnapshot } from '../io/history-reader.js';
import { selectAndReadPolicyFile, type PolicyReaderResult } from '../io/policy-reader.js';
import { selectAndReadEvaluationFiles, type EvaluationReaderResult } from '../io/evaluation-reader.js';
import { calculateHistoryMetrics, type HistoryMetricResultV1 } from '../../../src/protocol/advisor-metrics.js';
import { aggregateEvaluationGroups } from '../../../src/protocol/advisor-evaluation-comparison.js';
import type { EvaluationDocumentV1 } from '../../../src/protocol/advisor-evaluation.js';
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
import {
  createUnavailableRefreshResult,
  mapNormalizedRecordToHistoryRow,
  mapEvaluationDocumentToDescriptor,
  mapPolicyResultToCurrentPolicy,
  buildExecutionFromNormalized,
  buildOutcomeFromNormalized
} from './standalone-data-mappers.ts';

export class StandalonePickerProvider implements AdvisorDataProvider {
  private _rootHandle: FileSystemDirectoryHandle | null = null;
  private _reader = new HistoryReader();
  private _snapshot: HistorySnapshot | null = null;
  private _snapshotId: string | null = null;
  private _policyResult: PolicyReaderResult | null = null;
  private _evaluationResults: readonly EvaluationReaderResult[] = [];
  private _listeners = new Set<ProviderEventListener>();

  get descriptor(): ProviderContextDescriptor {
    return {
      kind: 'standalone',
      label: this._rootHandle?.name ?? 'Local Directory',
      capabilities: [
        'history.refresh', 'history.summary', 'history.page', 'history.detail',
        'policy.readCurrent', 'evaluations.list', 'evaluations.read', 'evaluations.compare'
      ],
      frameSession: null,
      activationGeneration: this._reader.latestGeneration || 1,
      isAvailable: true,
      hasHistorySource: this._rootHandle !== null,
      hasPolicySource: this._policyResult?.status === 'POLICY_READY',
      hasEvaluationSource: this._evaluationResults.some((r) => r.status === 'EVALUATION_READY')
    };
  }

  get rootHandle(): FileSystemDirectoryHandle | null { return this._rootHandle; }
  get currentSnapshot(): HistorySnapshot | null { return this._snapshot; }
  get currentPolicyResult(): PolicyReaderResult | null { return this._policyResult; }
  get currentEvaluationResults(): readonly EvaluationReaderResult[] { return this._evaluationResults; }

  subscribe(listener: ProviderEventListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _emit(event: Parameters<ProviderEventListener>[0]): void {
    for (const l of this._listeners) { try { l(event); } catch {} }
  }

  async promptSelectHistory(): Promise<boolean> {
    const handle = await selectHistoryDirectory();
    if (!handle) return false;
    this._rootHandle = handle;
    this._emit({ type: 'context-changed', descriptor: this.descriptor });
    return true;
  }

  async promptSelectPolicy(): Promise<PolicyReaderResult> {
    const res = await selectAndReadPolicyFile();
    this._policyResult = res;
    this._emit({ type: 'context-changed', descriptor: this.descriptor });
    return res;
  }

  async promptSelectEvaluations(): Promise<readonly EvaluationReaderResult[]> {
    const res = await selectAndReadEvaluationFiles();
    this._evaluationResults = res;
    this._emit({ type: 'context-changed', descriptor: this.descriptor });
    return res;
  }

  async refreshHistory(_requestId: string): Promise<HistoryRefreshResultV1> {
    if (!this._rootHandle) return createUnavailableRefreshResult();
    const scanResult = await this._reader.scan(this._rootHandle, this._snapshot);
    if (scanResult.commit === 'replace' && scanResult.snapshot) {
      this._snapshot = scanResult.snapshot;
      this._snapshotId = `snap-standalone-${Date.now()}`;
      return { state: 'fresh', snapshot_id: this._snapshotId, observed_at: this._snapshot.scannedAt, scan: scanResult.scan, stale_reason: null };
    }
    return {
      state: this._snapshot ? 'stale' : 'unavailable',
      snapshot_id: this._snapshotId,
      observed_at: this._snapshot?.scannedAt ?? Date.now(),
      scan: scanResult.scan,
      stale_reason: 'incomplete'
    };
  }

  async getHistorySummary(_reqId: string, _snapId: string, query: HistorySummaryQueryV1): Promise<HistorySummaryResultV1> {
    if (!this._snapshot) throw new Error('No active snapshot in standalone provider');
    const metrics: HistoryMetricResultV1 = calculateHistoryMetrics({
      records: this._snapshot.records,
      scope: this._snapshot.scope,
      filters: query.filters,
      generated_at: Date.now(),
      scan: this._snapshot.metricsResult.scan
    });
    return { state: 'fresh', snapshot_id: this._snapshotId!, metrics };
  }

  async getHistoryPage(_reqId: string, _snapId: string, query: HistorySummaryQueryV1, _sort: 'started_at_desc', cursor: string | null, limit: number): Promise<HistoryPageResultV1> {
    if (!this._snapshot) throw new Error('No active snapshot in standalone provider');
    const filtered = this._snapshot.records.filter((r) => {
      const f = query.filters;
      if (f.statuses && !f.statuses.includes(r.status)) return false;
      if (f.outcome_states && !f.outcome_states.includes(r.outcome_state)) return false;
      if (f.outcome_results && (!r.outcome_result || !f.outcome_results.includes(r.outcome_result))) return false;
      if (f.backends && !f.backends.includes(r.route.backend)) return false;
      if (f.models && !f.models.includes(r.route.model)) return false;
      if (f.efforts && !f.efforts.includes(r.route.effort)) return false;
      if (f.started_at_from !== null && r.started_at < f.started_at_from) return false;
      if (f.started_at_to !== null && r.started_at > f.started_at_to) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => b.started_at - a.started_at);
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const slice = sorted.slice(startIndex, startIndex + limit);
    const nextIndex = startIndex + limit < sorted.length ? startIndex + limit : null;
    const entries = slice.map(mapNormalizedRecordToHistoryRow);
    return { state: 'fresh', snapshot_id: this._snapshotId!, entries, next_cursor: nextIndex !== null ? String(nextIndex) : null, returned_bytes: JSON.stringify(entries).length };
  }

  async getHistoryDetail(_reqId: string, _snapId: string, recordRef: string): Promise<HistoryDetailResultV1> {
    if (!this._snapshot) return { status: 'missing', snapshot_id: this._snapshotId ?? 'none', record_ref: recordRef, observed_revision: null };
    const r = this._snapshot.records.find((rec) => rec.consultation_id === recordRef);
    if (!r) return { status: 'missing', snapshot_id: this._snapshotId!, record_ref: recordRef, observed_revision: null };
    return {
      status: 'ready',
      snapshot_id: this._snapshotId!,
      record_ref: recordRef,
      detail_revision: `rev-${r.consultation_id}`,
      execution: buildExecutionFromNormalized(r),
      outcome: buildOutcomeFromNormalized(r)
    };
  }

  async readCurrentPolicy(_reqId: string): Promise<PolicyReadCurrentResultV1> {
    return mapPolicyResultToCurrentPolicy(this._policyResult);
  }

  async listEvaluations(_reqId: string, _cursor: string | null, _limit: number): Promise<EvaluationsListResultV1> {
    const ready = this._evaluationResults.filter((r) => r.status === 'EVALUATION_READY' && r.document);
    if (ready.length === 0) {
      return { status: 'not_configured', observed_at: Date.now(), binding_revision: 'none', items: [], next_cursor: null };
    }
    const items = ready.map((r) => mapEvaluationDocumentToDescriptor(r.document!));
    return { status: 'ready', observed_at: Date.now(), binding_revision: 'standalone-eval-rev', items, next_cursor: null };
  }

  async readEvaluation(_reqId: string, evaluationRef: string, _expectedRevision: string): Promise<EvaluationsReadResultV1> {
    const item = this._evaluationResults.find((r) => r.status === 'EVALUATION_READY' && r.document?.evaluation_id === evaluationRef);
    if (!item?.document) return { status: 'missing', evaluation_ref: evaluationRef, observed_revision: null };
    return { status: 'ready', descriptor: mapEvaluationDocumentToDescriptor(item.document), document: item.document };
  }

  async compareEvaluations(_reqId: string, items: readonly { evaluation_ref: string }[]): Promise<EvaluationsCompareResultV1> {
    const docs = items.map((it) => this._evaluationResults.find((r) => r.document?.evaluation_id === it.evaluation_ref)?.document).filter((d): d is EvaluationDocumentV1 => Boolean(d));
    const groups = aggregateEvaluationGroups(docs);
    return {
      status: 'ready', source_revisions: items.map((it) => ({ evaluation_ref: it.evaluation_ref, observed_revision: 'standalone' })),
      groups, next_cursor: null, returned_bytes: 1024
    };
  }

  cancel(_requestId: string): void { this._reader.cancelActiveScan(); }
}
