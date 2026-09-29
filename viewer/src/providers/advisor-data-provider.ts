/**
 * @file advisor-data-provider.ts
 * Provider-neutral interface for EVCrate Advisor viewer/plugin data acquisition.
 *
 * Implements the abstract contract consumed by App and its four views:
 * - Overview
 * - History & Detail
 * - Configuration (current account policy)
 * - Evaluations (descriptors, documents, comparisons)
 *
 * Conceals transport internals (File System Access handles vs. DamHopper MessagePort).
 * Guarantees that neither host credentials nor arbitrary network transport cross into the app.
 */

import type {
  HistoryRefreshResultV1,
  HistoryRefreshResultV2,
  HistorySummaryQueryV1,
  HistorySummaryQueryV2,
  HistorySummaryResultV1,
  HistorySummaryResultV2,
  HistoryPageResultV1,
  HistoryPageResultV2,
  HistoryDetailResultV1,
  PolicyReadCurrentResultV1,
  EvaluationsListResultV1,
  EvaluationsReadResultV1,
  EvaluationsCompareResultV1,
  HistoryRowV1,
  EvaluationDescriptorV1,
  ProjectInventoryV2,
  ProjectInventoryItemV2,
  PluginErrorCode
} from '../../../src/protocol/advisor-plugin-data-api.ts';
import type { AdvisorWorkspaceContext, UiIntent } from './bridge-contract.ts';
export type {
  HistoryRefreshResultV1,
  HistoryRefreshResultV2,
  HistorySummaryQueryV1,
  HistorySummaryQueryV2,
  HistorySummaryResultV1,
  HistorySummaryResultV2,
  HistoryPageResultV1,
  HistoryPageResultV2,
  HistoryDetailResultV1,
  PolicyReadCurrentResultV1,
  EvaluationsListResultV1,
  EvaluationsReadResultV1,
  EvaluationsCompareResultV1,
  HistoryRowV1,
  EvaluationDescriptorV1,
  ProjectInventoryV2,
  ProjectInventoryItemV2,
  PluginErrorCode
};

export type { AdvisorWorkspaceContext, UiIntent };

export type ProviderKind = 'standalone' | 'dam-hopper';

export interface ProviderContextDescriptor {
  readonly kind: ProviderKind;
  readonly label: string;
  readonly capabilities: readonly string[];
  readonly frameSession: string | null;
  readonly activationGeneration: number;
  readonly isAvailable: boolean;
  readonly hasHistorySource: boolean;
  readonly hasPolicySource: boolean;
  readonly hasEvaluationSource: boolean;
  readonly workspaceContext?: AdvisorWorkspaceContext | null;
}
export type ProviderEvent =
  | { readonly type: 'ready'; readonly descriptor: ProviderContextDescriptor }
  | { readonly type: 'context-changed'; readonly descriptor: ProviderContextDescriptor }
  | { readonly type: 'revoked'; readonly reason: string }
  | { readonly type: 'disconnected' }
  | { readonly type: 'incompatible'; readonly reason: string }
  | { readonly type: 'availability-changed'; readonly available: boolean; readonly capabilities: readonly string[] }
  | { readonly type: 'workspace-project-changed'; readonly workspaceContext: AdvisorWorkspaceContext };
export type ProviderEventListener = (event: ProviderEvent) => void;

export interface AdvisorDataProvider {
  readonly descriptor: ProviderContextDescriptor;

  /** Subscribe to provider lifecycle, revocation, and availability changes. */
  subscribe(listener: ProviderEventListener): () => void;

  /** Refresh history snapshot. In DamHopper, binds context and returns fresh/stale snapshot. */
  refreshHistory(requestId: string): Promise<HistoryRefreshResultV1 | HistoryRefreshResultV2>;

  /** Fetch summary metrics for a given snapshot and query. */
  getHistorySummary(
    requestId: string,
    snapshotId: string,
    query: HistorySummaryQueryV1 | HistorySummaryQueryV2
  ): Promise<HistorySummaryResultV1 | HistorySummaryResultV2>;

  /** Fetch a bounded page of history rows (maximum 500, default 100). */
  getHistoryPage(
    requestId: string,
    snapshotId: string,
    query: HistorySummaryQueryV1 | HistorySummaryQueryV2,
    sort: 'started_at_desc',
    cursor: string | null,
    limit: number
  ): Promise<HistoryPageResultV1 | HistoryPageResultV2>;

  /** Fetch full execution & outcome detail for a specific record. */
  getHistoryDetail(
    requestId: string,
    snapshotId: string,
    recordRef: string
  ): Promise<HistoryDetailResultV1>;

  /** Read current account-wide policy. Requires explicit permission grant. */
  readCurrentPolicy(requestId: string): Promise<PolicyReadCurrentResultV1>;

  /** List bound evaluation descriptors. */
  listEvaluations(
    requestId: string,
    cursor: string | null,
    limit: number
  ): Promise<EvaluationsListResultV1>;

  /** Read evaluation document for a specific descriptor and expected revision. */
  readEvaluation(
    requestId: string,
    evaluationRef: string,
    expectedRevision: string
  ): Promise<EvaluationsReadResultV1>;

  /** Compare multiple evaluations across cases and metrics. */
  compareEvaluations(
    requestId: string,
    items: readonly { evaluation_ref: string; expected_revision: string }[],
    cursor: string | null,
    limit: number
  ): Promise<EvaluationsCompareResultV1>;

  /** Cancel an in-flight operation by requestId. */
  cancel(requestId: string): void;

  /** Send UI-only intent (activate or dismiss) to host. */
  sendUiIntent?(intent: UiIntent): void;
  /** Optional lifecycle cleanup when provider is torn down. */
  destroy?(): void;
}
