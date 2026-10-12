import type { StoredBindingResult } from './binding-store.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import type { CatalogSnapshot } from './model-catalog.js';
import type { SidebarSnapshot } from './sidebar-tree-provider.js';

export type { SidebarSnapshot };

export interface SidebarSnapshotCaptureInput {
  readonly report: RuntimeDiagnosticsReport | null;
  readonly currentRootIdentity: string | null;
  readonly getStoredBindings: (rootIdentity: string | null) => {
    readonly userRes: StoredBindingResult;
    readonly rootRes: StoredBindingResult;
  };
  readonly catalog: CatalogSnapshot | null;
}

export function createInitialSidebarSnapshot(): SidebarSnapshot {
  return Object.freeze({
    report: null,
    rootBindings: null,
    userBindings: null,
    catalog: null,
    settingsPending: true
  });
}

export function captureCommittedSidebarSnapshot(
  input: SidebarSnapshotCaptureInput
): SidebarSnapshot {
  const { report } = input;
  if (!report) {
    return createInitialSidebarSnapshot();
  }

  const isLocalAuthority = report.diagnostics.authority === 'local-file';
  const rootMatches = input.currentRootIdentity === report.diagnostics.rootIdentity;
  if (!isLocalAuthority || !rootMatches) {
    return Object.freeze({
      report,
      rootBindings: null,
      userBindings: null,
      catalog: null,
      settingsPending: isLocalAuthority && !rootMatches
    });
  }

  let stored: { readonly userRes: StoredBindingResult; readonly rootRes: StoredBindingResult };
  try {
    stored = input.getStoredBindings(report.diagnostics.rootIdentity);
  } catch {
    return Object.freeze({
      report,
      rootBindings: null,
      userBindings: null,
      catalog: null,
      settingsPending: false
    });
  }

  const { userRes, rootRes } = stored;
  if (!userRes.ok || !rootRes.ok) {
    return Object.freeze({
      report,
      rootBindings: null,
      userBindings: null,
      catalog: null,
      settingsPending: false
    });
  }

  const userRevMatches = (userRes.bindings?.revision ?? 0) === report.userBindingRevision;
  const rootRevMatches = (rootRes.bindings?.revision ?? 0) === report.rootBindingRevision;
  const catalogRevMatches = input.catalog === null
    ? report.diagnostics.catalogRevision === 0
    : input.catalog.revision === report.diagnostics.catalogRevision;

  if (!userRevMatches || !rootRevMatches || !catalogRevMatches) {
    return Object.freeze({
      report,
      rootBindings: null,
      userBindings: null,
      catalog: null,
      settingsPending: true
    });
  }

  return Object.freeze({
    report,
    rootBindings: rootRes.bindings,
    userBindings: userRes.bindings,
    catalog: input.catalog,
    settingsPending: false
  });
}
