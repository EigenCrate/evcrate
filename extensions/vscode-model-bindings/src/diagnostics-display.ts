import * as vscode from 'vscode';
import type { CompanionAgentProvider } from './agent-provider.js';
import { ScopedBindingStore, type StoredBindingResult } from './binding-store.js';
import {
  buildRuntimeDiagnosticsSnapshot,
  type RuntimeDiagnosticsReport
} from './diagnostics.js';
import { readManifestActorsSafe } from './generation-loader.js';
import { readHostRemoteAuthority } from './installation-roots.js';
import type { CatalogSnapshot } from './model-catalog.js';

export interface ShowDiagnosticsOptions {
  readonly context: vscode.ExtensionContext;
  readonly rootIdentity: string | null;
  readonly pluginFsPath: string | null;
  readonly activeProvider: CompanionAgentProvider | null;
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly catalog: CatalogSnapshot | null;
  readonly latestReport?: RuntimeDiagnosticsReport | null;
}

export async function showModelBindingsDiagnostics(
  contextOrOpts: vscode.ExtensionContext | ShowDiagnosticsOptions,
  rootIdentityArg?: string | null,
  pluginFsPathArg?: string | null,
  activeProviderArg?: CompanionAgentProvider | null,
  instanceUuidArg?: string,
  generationIdArg?: number,
  catalogArg?: CatalogSnapshot | null,
  latestReportArg?: RuntimeDiagnosticsReport | null
): Promise<RuntimeDiagnosticsReport> {
  const isOptionsObj = 'context' in contextOrOpts && 'instanceUuid' in contextOrOpts;
  const context = isOptionsObj ? contextOrOpts.context : contextOrOpts;
  const rootIdentity = isOptionsObj ? contextOrOpts.rootIdentity : (rootIdentityArg ?? null);
  const pluginFsPath = isOptionsObj ? contextOrOpts.pluginFsPath : (pluginFsPathArg ?? null);
  const activeProvider = isOptionsObj ? contextOrOpts.activeProvider : (activeProviderArg ?? null);
  const instanceUuid = isOptionsObj ? contextOrOpts.instanceUuid : (instanceUuidArg ?? '');
  const generationId = isOptionsObj ? contextOrOpts.generationId : (generationIdArg ?? 0);
  const catalog = isOptionsObj ? contextOrOpts.catalog : (catalogArg ?? null);
  const latestReport = isOptionsObj ? (contextOrOpts.latestReport ?? null) : (latestReportArg ?? null);

  const remoteAuthority = readHostRemoteAuthority(vscode.env);
  const authority: 'local-file' | 'unsupported-remote' =
    typeof remoteAuthority === 'string' && remoteAuthority.trim() !== '' ? 'unsupported-remote' : 'local-file';

  let userRes: StoredBindingResult = Object.freeze({ ok: true, bindings: null });
  let rootRes: StoredBindingResult = Object.freeze({ ok: true, bindings: null });
  if (authority === 'local-file') {
    const store = new ScopedBindingStore(context.globalState, context.workspaceState, remoteAuthority);
    userRes = store.getUserBindings();
    rootRes = rootIdentity ? store.getRootBindings(rootIdentity) : Object.freeze({ ok: true, bindings: null });
  }

  let report: RuntimeDiagnosticsReport;
  if (latestReport && userRes.ok && rootRes.ok) {
    report = latestReport;
  } else {
    const publishedIds = activeProvider
      ? new Set(activeProvider.currentResources.map((r) => r.actorId))
      : null;
    const corruptError = !userRes.ok
      ? `CORRUPT_STORED_BINDINGS: ${userRes.error.code}`
      : !rootRes.ok
        ? `CORRUPT_STORED_BINDINGS: ${rootRes.error.code}`
        : null;
    report = buildRuntimeDiagnosticsSnapshot({
      rootIdentity,
      authority,
      instanceUuid,
      generationId,
      baseStorageFsPath: context.storageUri?.fsPath ?? context.globalStorageUri?.fsPath ?? null,
      catalogRevision: catalog?.revision ?? 0,
      manifestActors: readManifestActorsSafe(pluginFsPath),
      rootBindings: rootRes.ok ? rootRes.bindings : null,
      userBindings: userRes.ok ? userRes.bindings : null,
      catalog: catalog?.models ?? [],
      publishedActorIds: publishedIds,
      corruptBindingsError: corruptError
    });
  }

  const diag = report.diagnostics;
  const activeCount = activeProvider?.currentResources.length ?? report.contributedActors.length;
  const items: vscode.QuickPickItem[] = [
    {
      label: `EVCrate Diagnostics: Gen #${report.generationId} (${activeCount} active actors)`,
      description: `Root: ${diag.rootIdentity ?? 'None'} (${diag.authority})`,
      detail: `Instance: ${diag.instanceUuid} • Bindings rev: root=${report.rootBindingRevision}/user=${report.userBindingRevision} • Catalog rev: ${diag.catalogRevision} • Template SHA: ${diag.templateInventorySha256 ? diag.templateInventorySha256.slice(0, 12) : 'none'}`
    },
    {
      label: 'ℹ Cached Selection Recovery (Reselect or Reload Window)',
      description: 'RESELECTION_OR_RELOAD_REQUIRED',
      detail: report.reselectionGuidance
    }
  ];

  if (report.storageExhausted && report.storageCleanupGuidance) {
    items.push({
      label: '⚠ STORAGE BUDGET EXHAUSTED (Closed-Editor Cleanup Required)',
      description: 'STORAGE_BUDGET_EXCEEDED',
      detail: report.storageCleanupGuidance
    });
  }
  if (!userRes.ok) {
    items.push({
      label: '⚠ CORRUPT USER BINDINGS',
      description: userRes.error.code,
      detail: userRes.error.message
    });
  }
  if (!rootRes.ok) {
    items.push({
      label: '⚠ CORRUPT ROOT BINDINGS',
      description: rootRes.error.code,
      detail: rootRes.error.message
    });
  }
  if (report.setupOrInvalidationReason && userRes.ok && rootRes.ok && !report.storageExhausted) {
    items.push({
      label: '⚠ SETUP / INVALIDATION STATUS',
      description: report.setupOrInvalidationReason,
      detail: 'Provider inventory withdrawn until installation/trust/schema state is valid.'
    });
  }

  for (const actorId of Object.keys(diag.actors).sort()) {
    const res = diag.actors[actorId];
    const modelTag = res.selectedModel ? ` (${res.selectedModel.vendor}/${res.selectedModel.id})` : '';
    const observedLabel = res.hostObservedModel ?? 'unavailable (no native evidence)';
    items.push({
      label: `${res.status === 'contributed' ? '✔' : '✖'} ${res.actorId}`,
      description: res.renderedSelector ?? (res.status === 'contributed' ? 'inherit' : 'UNBOUND'),
      detail: `Tier: ${res.canonicalTier ?? 'none'} • Source: ${res.effectiveSource}${modelTag}${res.reason ? ` • Reason: ${res.reason}` : ''} • hostObserved: ${observedLabel}`
    });
  }

  await vscode.window.showQuickPick(items, {
    placeHolder: 'EVCrate Model Bindings Diagnostics (hostObservedModel requires live native execution)'
  });
  return report;
}
