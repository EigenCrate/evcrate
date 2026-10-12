import * as vscode from 'vscode';
import {
  CANONICAL_TIERS,
  type CanonicalModelTier,
  type VscodeModelBindingsV1
} from './binding-contracts.js';
import {
  ScopedBindingStore,
  createEmptyBindings
} from './binding-store.js';
import { queryChatModelCatalog, type CatalogSnapshot } from './model-catalog.js';
import {
  selectConfigurationScope,
  pickCatalogModel,
  getAvailableActorIds
} from './configuration-pickers.js';
import { readHostRemoteAuthority } from './installation-roots.js';

export async function handleConfigureAgentModels(
  context: vscode.ExtensionContext,
  getCurrentRootIdentity: () => string | null,
  refresh: () => Promise<boolean>
): Promise<boolean> {
  const rootIdentity = getCurrentRootIdentity();
  const scopeChoice = await selectConfigurationScope(rootIdentity);
  if (!scopeChoice) return false;

  const tierOptions: ReadonlyArray<{ readonly label: string; readonly tier: CanonicalModelTier | 'all'; readonly description: string }> = [
    { label: 'All Agents (Default Model)', tier: 'all', description: 'Bind one model to all agent tiers at once' },
    { label: 'opus', tier: 'opus', description: 'Planning & Architecture Tier (evc-planner, evc-brainstormer)' },
    { label: 'sonnet', tier: 'sonnet', description: 'Engineering & Review Tier (evc-fullstack-developer, evc-code-reviewer, evc-debugger, +2 more)' },
    { label: 'haiku', tier: 'haiku', description: 'Fast Discovery & Utility Tier (evc-scout, evc-tester, evc-git-manager, +6 more)' }
  ];
  const tierChoice = await vscode.window.showQuickPick(tierOptions, {
    placeHolder: 'Select agent group or tier to configure'
  });
  if (!tierChoice) return false;
  const targetTier: CanonicalModelTier | 'all' = tierChoice.tier ?? (tierChoice.label as CanonicalModelTier);

  let catalog: CatalogSnapshot;
  try {
    catalog = await queryChatModelCatalog(vscode.lm);
  } catch (err: unknown) {
    void vscode.window.showErrorMessage(`EVCrate: Failed to query model catalog: ${String(err)}`);
    return false;
  }
  const selectedModel = await pickCatalogModel(catalog, `Select model for "${tierChoice.label}"`);
  if (!selectedModel) return false;

  if (scopeChoice.scope === 'root' && getCurrentRootIdentity() !== scopeChoice.rootIdentity) {
    void vscode.window.showErrorMessage('EVCrate: Active workspace root changed during selection. Aborting.');
    return false;
  }

  const selection = { vendor: selectedModel.vendor, id: selectedModel.id };
  const tierPatch: Partial<Record<CanonicalModelTier, { vendor: string; id: string }>> =
    targetTier === 'all'
      ? { opus: selection, sonnet: selection, haiku: selection }
      : { [targetTier]: selection };

  const store = new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env));
  if (scopeChoice.scope === 'user') {
    const res = store.getUserBindings();
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = { ...current, tiers: { ...current.tiers, ...tierPatch } };
    await store.saveUserBindings(updated, res.bindings?.revision);
  } else if (scopeChoice.rootIdentity) {
    const res = store.getRootBindings(scopeChoice.rootIdentity);
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = { ...current, tiers: { ...current.tiers, ...tierPatch } };
    await store.saveRootBindings(scopeChoice.rootIdentity, updated, res.bindings?.revision);
  }
  await refresh();
  void vscode.window.showInformationMessage(
    `EVCrate: Configured "${tierChoice.label}" → "${selectedModel.selector}" (${scopeChoice.label})`
  );
  return true;
}

export async function handleConfigureActorModel(
  context: vscode.ExtensionContext,
  getCurrentRootIdentity: () => string | null,
  getPluginFsPath: () => string | null,
  refresh: () => Promise<boolean>
): Promise<boolean> {
  const rootIdentity = getCurrentRootIdentity();
  const scopeChoice = await selectConfigurationScope(rootIdentity);
  if (!scopeChoice) return false;

  const actorIds = getAvailableActorIds(getPluginFsPath());
  const actorChoice = await vscode.window.showQuickPick(
    actorIds.map((id) => ({ label: id })),
    { placeHolder: 'Select actor to configure' }
  );
  if (!actorChoice) return false;
  const actorId = actorChoice.label;

  const kindChoice = await vscode.window.showQuickPick(
    [
      { label: 'Select catalog model override', kind: 'model' as const },
      { label: 'Explicit inherit (omit model)', kind: 'inherit' as const }
    ],
    { placeHolder: `Select override kind for actor "${actorId}"` }
  );
  if (!kindChoice) return false;

  let binding: { kind: 'inherit' } | { kind: 'model'; vendor: string; id: string };
  if (kindChoice.kind === 'inherit') {
    binding = { kind: 'inherit' };
  } else {
    let catalog: CatalogSnapshot;
    try {
      catalog = await queryChatModelCatalog(vscode.lm);
    } catch (err: unknown) {
      void vscode.window.showErrorMessage(`EVCrate: Failed to query model catalog: ${String(err)}`);
      return false;
    }
    const selected = await pickCatalogModel(catalog, `Select model override for "${actorId}"`);
    if (!selected) return false;
    binding = { kind: 'model', vendor: selected.vendor, id: selected.id };
  }

  if (scopeChoice.scope === 'root' && getCurrentRootIdentity() !== scopeChoice.rootIdentity) {
    void vscode.window.showErrorMessage('EVCrate: Active workspace root changed during selection. Aborting.');
    return false;
  }

  const store = new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env));
  if (scopeChoice.scope === 'user') {
    const res = store.getUserBindings();
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = {
      ...current,
      actors: { ...current.actors, [actorId]: binding }
    };
    await store.saveUserBindings(updated, res.bindings?.revision);
  } else if (scopeChoice.rootIdentity) {
    const res = store.getRootBindings(scopeChoice.rootIdentity);
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = {
      ...current,
      actors: { ...current.actors, [actorId]: binding }
    };
    await store.saveRootBindings(scopeChoice.rootIdentity, updated, res.bindings?.revision);
  }
  await refresh();
  void vscode.window.showInformationMessage(
    `EVCrate: Configured actor "${actorId}" override in ${scopeChoice.label}`
  );
  return true;
}
