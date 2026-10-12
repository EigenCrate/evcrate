import * as vscode from 'vscode';
import {
  resolveCatalogModelSelector, type CanonicalModelTier, type EffectiveActorBindingResult,
  type EffectiveBindingSource, type ModelIdentitySelection, type VscodeModelBindingsV1
} from './binding-contracts.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import type { CatalogSnapshot } from './model-catalog.js';

export interface SidebarSnapshot {
  readonly report: RuntimeDiagnosticsReport | null;
  readonly rootBindings: VscodeModelBindingsV1 | null;
  readonly userBindings: VscodeModelBindingsV1 | null;
  readonly catalog: CatalogSnapshot | null;
  readonly settingsPending: boolean;
}

export type SidebarSectionId = 'section:root' | 'section:tiers' | 'section:actors';
export type SidebarTierTarget = CanonicalModelTier | 'all';

export interface SidebarTreeNodeBase {
  readonly label: string;
  readonly description?: string;
  readonly tooltip: string;
  readonly iconId: string;
  readonly command?: vscode.Command;
}

export type SidebarTreeNode = SidebarTreeNodeBase & (
  | { readonly kind: 'section'; readonly id: SidebarSectionId; readonly collapsibleState: vscode.TreeItemCollapsibleState }
  | { readonly kind: 'root-action'; readonly id: 'root:action'; readonly description: string; readonly command: vscode.Command }
  | { readonly kind: 'tier'; readonly id: `tier:${SidebarTierTarget}`; readonly tier: SidebarTierTarget; readonly description: string; readonly command: vscode.Command }
  | { readonly kind: 'actor'; readonly id: `actor:${string}`; readonly actorId: string; readonly description: string; readonly status: 'contributed' | 'withheld'; readonly effectiveSource: EffectiveBindingSource; readonly command: vscode.Command }
  | { readonly kind: 'status'; readonly id: `status:${string}` }
);

export interface ProviderEventEmitter {
  readonly event: vscode.Event<SidebarTreeNode | undefined | null | void>;
  fire(data: SidebarTreeNode | undefined | null | void): void;
  dispose(): void;
}

type DiagnosticActorEntry = EffectiveActorBindingResult & { readonly hostObservedModel: string | null };
const TIER_ORDER: readonly CanonicalModelTier[] = ['opus', 'sonnet', 'haiku'];

function formatConfiguredModel(catalog: CatalogSnapshot | null, sel: ModelIdentitySelection): string {
  if (catalog) {
    const res = resolveCatalogModelSelector(catalog.models, sel.vendor, sel.id);
    if (res.ok) return res.selector;
  }
  return `${sel.vendor}/${sel.id}`;
}

function buildRootActionNode(snapshot: SidebarSnapshot, actorCount: number): SidebarTreeNode {
  const report = snapshot.report;
  const reason = report?.setupOrInvalidationReason ?? null;
  const rootId = report?.diagnostics.rootIdentity ?? null;
  const command: vscode.Command = { title: 'Select Installation Root', command: 'evcrate.selectInstallation', arguments: [] };

  if (!report) {
    return { kind: 'root-action', id: 'root:action', label: 'Select Installation Root', description: 'Initial refresh pending', tooltip: 'Initial refresh pending. Click to select an EVCrate installation root.', iconId: 'sync', command };
  }
  if (report.diagnostics.authority === 'unsupported-remote' || reason === 'UNSUPPORTED_REMOTE_AUTHORITY') {
    return { kind: 'root-action', id: 'root:action', label: 'Select Installation Root', description: 'Unsupported remote authority', tooltip: 'Unsupported remote authority (UNSUPPORTED_REMOTE_AUTHORITY). Local file:// workspace is required.', iconId: 'warning', command };
  }
  if (reason === 'WORKSPACE_UNTRUSTED') {
    return { kind: 'root-action', id: 'root:action', label: 'Select Installation Root', description: 'Workspace untrusted', tooltip: 'Workspace untrusted (WORKSPACE_UNTRUSTED). Trust the workspace to load EVCrate agents.', iconId: 'shield', command };
  }
  if (!rootId) {
    const code = reason ?? 'NO_INSTALLATION_FOUND';
    const desc = code === 'NO_INSTALLATION_FOUND' ? 'No installation found' : code === 'MULTI_ROOT_SELECTION_REQUIRED' ? 'Multi-root selection required' : code;
    return { kind: 'root-action', id: 'root:action', label: 'Select Installation Root', description: desc, tooltip: `No active installation root (${code}). Click to select an EVCrate installation root.`, iconId: 'warning', command };
  }
  if (reason || report.storageExhausted) {
    const status = reason ?? 'STORAGE_BUDGET_EXCEEDED';
    return { kind: 'root-action', id: 'root:action', label: rootId, description: `${status} (${rootId})`, tooltip: `Root: ${rootId}\nStatus: ${status}${report.storageCleanupGuidance ? `\n${report.storageCleanupGuidance}` : ''}`, iconId: 'error', command };
  }
  if (actorCount === 0) {
    return { kind: 'root-action', id: 'root:action', label: rootId, description: `Empty inventory (${rootId})`, tooltip: `Root: ${rootId}\nGeneration: #${report.generationId}\nStatus: Empty valid inventory (0 actors in manifest)`, iconId: 'info', command };
  }
  return {
    kind: 'root-action', id: 'root:action', label: rootId,
    description: `Gen #${report.generationId} (${report.contributedActors.length}/${actorCount} active) • ${rootId}`,
    tooltip: `Root: ${rootId}\nAuthority: ${report.diagnostics.authority}\nGeneration: #${report.generationId}\nContributed: ${report.contributedActors.length}/${actorCount} actors\nClick to switch installation root.`,
    iconId: 'folder-active', command
  };
}

function buildTierNodes(snapshot: SidebarSnapshot): SidebarTreeNode[] {
  const nodes: SidebarTreeNode[] = TIER_ORDER.map((tier) => {
    const command: vscode.Command = { title: `Configure ${tier} Tier`, command: 'evcrate.configureAgentModels', arguments: [tier] };
    const rootSel = snapshot.rootBindings?.tiers[tier];
    const userSel = snapshot.userBindings?.tiers[tier];
    const sel = rootSel ?? userSel;
    const source = rootSel ? 'root.tier' : userSel ? 'user.tier' : null;
    const rendered = !snapshot.settingsPending && sel && source ? formatConfiguredModel(snapshot.catalog, sel) : null;
    const description = snapshot.settingsPending ? 'Settings pending refresh' : rendered && source ? `${rendered} [${source}]` : 'Unbound';
    const tooltip = rendered && sel && source
      ? `Configured ${tier} tier (${source}): ${sel.vendor}/${sel.id} (${rendered})\nConfigured tier default only; per-actor overrides and canonical.inherit may supersede this tier.`
      : `Configured ${tier} tier: ${description}. Actor overrides and canonical.inherit may supersede tier defaults.`;
    const iconId = snapshot.settingsPending ? 'sync' : rendered ? 'symbol-enum' : 'circle-outline';
    return { kind: 'tier', id: `tier:${tier}`, tier, label: tier, description, tooltip, iconId, command };
  });
  const resolved = TIER_ORDER.map((t) => snapshot.rootBindings?.tiers[t] ?? snapshot.userBindings?.tiers[t] ?? null);
  const first = resolved[0];
  const allDesc = snapshot.settingsPending
    ? 'Settings pending refresh'
    : resolved.every((s) => s === null)
      ? 'Unbound'
      : first !== null && resolved.every((s) => s !== null && s.vendor === first.vendor && s.id === first.id)
        ? `${formatConfiguredModel(snapshot.catalog, first)} (all 3 tiers)`
        : 'Configure all 3 tiers';
  nodes.push({
    kind: 'tier', id: 'tier:all', tier: 'all', label: 'Bind All Tiers', description: allDesc,
    tooltip: 'Bind one catalog model across opus, sonnet, and haiku tiers (configured tier defaults; per-actor overrides and canonical.inherit still take precedence).',
    iconId: 'layers', command: { title: 'Bind All Tiers', command: 'evcrate.configureAgentModels', arguments: ['all'] }
  });
  return nodes;
}

function buildActorNodes(snapshot: SidebarSnapshot, actors: readonly DiagnosticActorEntry[]): SidebarTreeNode[] {
  if (actors.length === 0) {
    const report = snapshot.report;
    const invalidReason = report?.setupOrInvalidationReason ?? (report?.storageExhausted ? 'STORAGE_BUDGET_EXCEEDED' : null);
    const hasEmptyRoot = Boolean(report && report.diagnostics.rootIdentity && !invalidReason);
    const reason = !report ? 'Initial refresh pending' : hasEmptyRoot ? 'Empty inventory' : (invalidReason ?? 'NO_INSTALLATION_FOUND');
    return [{
      kind: 'status', id: 'status:no-actors',
      label: !report ? 'No agents loaded yet' : hasEmptyRoot ? 'No agents in manifest' : 'No agents available',
      description: reason, tooltip: !report ? 'Initial refresh pending.' : `No active actor inventory (${reason}).`, iconId: 'info'
    }];
  }
  const guidance = snapshot.report?.reselectionGuidance ?? '';
  return actors.map((actor) => {
    const selectorText = actor.renderedSelector ?? (actor.status === 'contributed' ? 'Inherit' : 'Withheld');
    const selectedText = actor.selectedModel ? `${actor.selectedModel.vendor}/${actor.selectedModel.id}` : 'none (inherit/unbound)';
    const contributedText = actor.status === 'contributed' ? (actor.renderedSelector ?? 'inherit (model omitted)') : 'none (withheld)';
    const observedText = actor.hostObservedModel ?? 'unavailable (not inferred from settings)';
    return {
      kind: 'actor', id: `actor:${actor.actorId}`, actorId: actor.actorId, label: actor.actorId,
      description: `${selectorText} [${actor.effectiveSource}]`,
      tooltip: `Actor: ${actor.actorId}\nStatus: ${actor.status}\nTier: ${actor.canonicalTier ?? 'inherit'}\nSource: ${actor.effectiveSource}\nSelected model: ${selectedText}\nContributed selector: ${contributedText}${actor.reason ? `\nReason: ${actor.reason}` : ''}\nHost observed model: ${observedText}${guidance ? `\n${guidance}` : ''}`,
      iconId: actor.status === 'contributed' ? 'pass' : 'warning',
      status: actor.status, effectiveSource: actor.effectiveSource,
      command: { title: `Configure ${actor.actorId}`, command: 'evcrate.configureActorModel', arguments: [actor.actorId] }
    };
  });
}

export class EvcrateSidebarTreeProvider implements vscode.TreeDataProvider<SidebarTreeNode>, vscode.Disposable {
  private readonly _emitter: ProviderEventEmitter;
  private _disposed = false;
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeNode | undefined | null | void>;

  constructor(private readonly _getSnapshot: () => SidebarSnapshot, emitter?: ProviderEventEmitter) {
    this._emitter = emitter ?? new vscode.EventEmitter<SidebarTreeNode | undefined | null | void>();
    this.onDidChangeTreeData = this._emitter.event;
  }

  getChildren(element?: SidebarTreeNode): SidebarTreeNode[] {
    const snapshot = this._getSnapshot();
    const report = snapshot.report;
    const actors = report
      ? Object.keys(report.diagnostics.actors).filter((id) => !report.removedStoredActors.includes(id)).sort().map((id) => report.diagnostics.actors[id])
      : [];
    if (!element) {
      return [
        { kind: 'section', id: 'section:root', label: 'Installation Root', tooltip: 'Active EVCrate installation root', iconId: 'root-folder', collapsibleState: vscode.TreeItemCollapsibleState.Expanded },
        { kind: 'section', id: 'section:tiers', label: 'Model Tiers', tooltip: 'Configured model tier defaults (opus, sonnet, haiku)', iconId: 'symbol-class', collapsibleState: vscode.TreeItemCollapsibleState.Expanded },
        { kind: 'section', id: 'section:actors', label: `Agents (${actors.length})`, tooltip: 'Canonical EVCrate agents and effective model bindings', iconId: 'organization', collapsibleState: vscode.TreeItemCollapsibleState.Expanded }
      ];
    }
    if (element.kind !== 'section') return [];
    if (element.id === 'section:root') return [buildRootActionNode(snapshot, actors.length)];
    if (element.id === 'section:tiers') return buildTierNodes(snapshot);
    return buildActorNodes(snapshot, actors);
  }

  getTreeItem(element: SidebarTreeNode): vscode.TreeItem {
    const state = element.kind === 'section' ? element.collapsibleState : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.label, state);
    item.id = element.id;
    if (element.description !== undefined) item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = new vscode.ThemeIcon(element.iconId);
    item.contextValue = element.kind;
    if (element.command !== undefined) item.command = element.command;
    return item;
  }

  refresh(): void { if (!this._disposed) this._emitter.fire(undefined); }
  dispose(): void { if (!this._disposed) { this._disposed = true; this._emitter.dispose(); } }
}
