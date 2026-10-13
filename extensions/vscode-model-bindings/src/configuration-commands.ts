import * as vscode from 'vscode';
import type { CanonicalModelTier, VscodeModelBindingsV1 } from './binding-contracts.js';
import { ScopedBindingStore, createEmptyBindings } from './binding-store.js';
import { queryChatModelCatalog, type CatalogSnapshot } from './model-catalog.js';
import {
  selectConfigurationScope,
  pickCatalogModel,
  getAvailableActorIds,
  type ScopeChoice
} from './configuration-pickers.js';
import { readHostRemoteAuthority } from './installation-roots.js';
import { ACTOR_ID_PATTERN } from './runtime-contracts.js';

const TIER_OPTIONS: ReadonlyArray<{ readonly label: string; readonly tier: CanonicalModelTier | 'all'; readonly description: string }> = [
  { label: 'All Tiers (Default Model)', tier: 'all', description: 'Bind one default model to all 3 tiers (per-actor overrides still win)' },
  { label: 'opus', tier: 'opus', description: 'Planning & Architecture Tier (evc-planner, evc-brainstormer)' },
  { label: 'sonnet', tier: 'sonnet', description: 'Engineering & Review Tier (evc-fullstack-developer, evc-code-reviewer, evc-debugger, +2 more)' },
  { label: 'haiku', tier: 'haiku', description: 'Fast Discovery & Utility Tier (evc-scout, evc-tester, evc-git-manager, +6 more)' }
];

function isTierTarget(value: unknown): value is CanonicalModelTier | 'all' {
  return value === 'all' || value === 'opus' || value === 'sonnet' || value === 'haiku';
}

async function saveScopedBindings(
  context: vscode.ExtensionContext,
  scopeChoice: ScopeChoice,
  applyPatch: (current: VscodeModelBindingsV1) => VscodeModelBindingsV1
): Promise<void> {
  const store = new ScopedBindingStore(context.globalState, context.workspaceState, readHostRemoteAuthority(vscode.env));
  if (scopeChoice.scope === 'user') {
    const res = store.getUserBindings();
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    await store.saveUserBindings(applyPatch(current), res.bindings?.revision);
  } else if (scopeChoice.rootIdentity) {
    const res = store.getRootBindings(scopeChoice.rootIdentity);
    if (!res.ok) throw res.error;
    const current = res.bindings ?? createEmptyBindings();
    await store.saveRootBindings(scopeChoice.rootIdentity, applyPatch(current), res.bindings?.revision);
  }
}

export async function handleConfigureAgentModels(
  context: vscode.ExtensionContext,
  getCurrentRootIdentity: () => string | null,
  refresh: () => Promise<boolean>,
  preselectedTier?: CanonicalModelTier | 'all'
): Promise<boolean> {
  let preselectedOption: (typeof TIER_OPTIONS)[number] | undefined;
  if (preselectedTier !== undefined) {
    if (!isTierTarget(preselectedTier)) {
      void vscode.window.showErrorMessage(`EVCrate: Invalid model tier "${String(preselectedTier)}".`);
      return false;
    }
    preselectedOption = TIER_OPTIONS.find((item) => item.tier === preselectedTier);
  }

  const initialRoot = getCurrentRootIdentity();
  const scopeChoice = await selectConfigurationScope(initialRoot);
  if (!scopeChoice) return false;

  const tierChoice = preselectedOption ?? await vscode.window.showQuickPick(TIER_OPTIONS, {
    placeHolder: 'Select agent group or tier to configure'
  });
  if (!tierChoice) return false;
  const targetTier: CanonicalModelTier | 'all' | null = isTierTarget(tierChoice.tier)
    ? tierChoice.tier
    : isTierTarget(tierChoice.label)
      ? tierChoice.label
      : null;
  if (!targetTier) return false;

  let catalog: CatalogSnapshot;
  try {
    catalog = await queryChatModelCatalog(vscode.lm);
  } catch (err: unknown) {
    void vscode.window.showErrorMessage(`EVCrate: Failed to query model catalog: ${String(err)}`);
    return false;
  }
  const selectedModel = await pickCatalogModel(catalog, `Select model for "${tierChoice.label}"`);
  if (!selectedModel) return false;

  if (
    getCurrentRootIdentity() !== initialRoot
    || (scopeChoice.scope === 'root' && getCurrentRootIdentity() !== scopeChoice.rootIdentity)
  ) {
    void vscode.window.showErrorMessage('EVCrate: Active workspace root changed during selection. Aborting.');
    return false;
  }

  const selection = { vendor: selectedModel.vendor, id: selectedModel.id };
  const tierPatch: Partial<Record<CanonicalModelTier, { vendor: string; id: string }>> =
    targetTier === 'all'
      ? { opus: selection, sonnet: selection, haiku: selection }
      : { [targetTier]: selection };

  await saveScopedBindings(context, scopeChoice, (current) => ({
    ...current,
    tiers: { ...current.tiers, ...tierPatch }
  }));
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
  refresh: () => Promise<boolean>,
  preselectedActorId?: string
): Promise<boolean> {
  const initialRoot = getCurrentRootIdentity();
  const initialPluginPath = getPluginFsPath();
  const initialActors = getAvailableActorIds(initialPluginPath);

  if (preselectedActorId !== undefined) {
    if (
      typeof preselectedActorId !== 'string'
      || preselectedActorId.length > 64
      || !ACTOR_ID_PATTERN.test(preselectedActorId)
      || !initialActors.includes(preselectedActorId)
    ) {
      void vscode.window.showErrorMessage(`EVCrate: Unknown or unavailable actor "${String(preselectedActorId)}".`);
      return false;
    }
  }

  const scopeChoice = await selectConfigurationScope(initialRoot);
  if (!scopeChoice) return false;

  let actorId: string;
  if (preselectedActorId !== undefined) {
    actorId = preselectedActorId;
  } else {
    const actorIds = getAvailableActorIds(getPluginFsPath());
    const actorChoice = await vscode.window.showQuickPick(
      actorIds.map((id) => ({ label: id })),
      { placeHolder: 'Select actor to configure' }
    );
    if (!actorChoice) return false;
    actorId = actorChoice.label;
  }

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

  const currentPluginPath = getPluginFsPath();
  if (
    getCurrentRootIdentity() !== initialRoot
    || currentPluginPath !== initialPluginPath
    || (scopeChoice.scope === 'root' && getCurrentRootIdentity() !== scopeChoice.rootIdentity)
    || !getAvailableActorIds(currentPluginPath).includes(actorId)
  ) {
    void vscode.window.showErrorMessage('EVCrate: Active installation or actor inventory changed during selection. Aborting.');
    return false;
  }

  await saveScopedBindings(context, scopeChoice, (current) => ({
    ...current,
    actors: { ...current.actors, [actorId]: binding }
  }));
  await refresh();
  void vscode.window.showInformationMessage(
    `EVCrate: Configured actor "${actorId}" override in ${scopeChoice.label}`
  );
  return true;
}
