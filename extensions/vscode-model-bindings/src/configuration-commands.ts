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

export async function handleConfigureAgentModels(
  context: vscode.ExtensionContext,
  getCurrentRootIdentity: () => string | null,
  refresh: () => Promise<boolean>
): Promise<boolean> {
  const rootIdentity = getCurrentRootIdentity();
  const scopeChoice = await selectConfigurationScope(rootIdentity);
  if (!scopeChoice) return false;

  const tierChoice = await vscode.window.showQuickPick(
    Object.keys(CANONICAL_TIERS).map((t) => ({ label: t, description: `Canonical ${t} tier` })),
    { placeHolder: 'Select canonical model tier to configure' }
  );
  if (!tierChoice) return false;
  const tier = tierChoice.label as CanonicalModelTier;

  let catalog: CatalogSnapshot;
  try {
    catalog = await queryChatModelCatalog(vscode.lm);
  } catch (err: unknown) {
    void vscode.window.showErrorMessage(`EVCrate: Failed to query model catalog: ${String(err)}`);
    return false;
  }
  const selectedModel = await pickCatalogModel(catalog, `Select model for tier "${tier}"`);
  if (!selectedModel) return false;

  if (scopeChoice.scope === 'root' && getCurrentRootIdentity() !== scopeChoice.rootIdentity) {
    void vscode.window.showErrorMessage('EVCrate: Active workspace root changed during selection. Aborting.');
    return false;
  }

  const store = new ScopedBindingStore(context.globalState, context.workspaceState, vscode.env.remoteAuthority);
  if (scopeChoice.scope === 'user') {
    const res = store.getUserBindings();
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = {
      ...current,
      tiers: { ...current.tiers, [tier]: { vendor: selectedModel.vendor, id: selectedModel.id } }
    };
    await store.saveUserBindings(updated, res.bindings?.revision);
  } else if (scopeChoice.rootIdentity) {
    const res = store.getRootBindings(scopeChoice.rootIdentity);
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    const updated: VscodeModelBindingsV1 = {
      ...current,
      tiers: { ...current.tiers, [tier]: { vendor: selectedModel.vendor, id: selectedModel.id } }
    };
    await store.saveRootBindings(scopeChoice.rootIdentity, updated, res.bindings?.revision);
  }
  await refresh();
  void vscode.window.showInformationMessage(
    `EVCrate: Configured tier "${tier}" → "${selectedModel.selector}" (${scopeChoice.label})`
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

  const store = new ScopedBindingStore(context.globalState, context.workspaceState, vscode.env.remoteAuthority);
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
