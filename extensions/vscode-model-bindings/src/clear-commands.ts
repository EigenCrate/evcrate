import * as vscode from 'vscode';
import { CANONICAL_TIERS, type CanonicalModelTier } from './binding-contracts.js';
import { ScopedBindingStore } from './binding-store.js';
import { selectConfigurationScope, getAvailableActorIds } from './configuration-pickers.js';

export async function handleClearModelBindings(
  context: vscode.ExtensionContext,
  getCurrentRootIdentity: () => string | null,
  getPluginFsPath: () => string | null,
  refresh: () => Promise<boolean>
): Promise<boolean> {
  const rootIdentity = getCurrentRootIdentity();
  const scopeChoice = await selectConfigurationScope(rootIdentity);
  if (!scopeChoice) return false;

  const targetChoice = await vscode.window.showQuickPick(
    [
      { label: 'Clear all bindings in scope', action: 'all' as const },
      { label: 'Clear specific tier binding', action: 'tier' as const },
      { label: 'Clear specific actor override', action: 'actor' as const }
    ],
    { placeHolder: 'Select what to clear' }
  );
  if (!targetChoice) return false;

  const store = new ScopedBindingStore(context.globalState, context.workspaceState, vscode.env.remoteAuthority);
  let cleared = false;
  if (targetChoice.action === 'all') {
    const confirm = await vscode.window.showQuickPick(
      [{ label: 'Yes, clear all bindings' }, { label: 'Cancel' }],
      { placeHolder: `Confirm clearing all bindings in ${scopeChoice.label}?` }
    );
    if (confirm?.label !== 'Yes, clear all bindings') return false;
    if (scopeChoice.scope === 'user') {
      cleared = await store.clearUserBindings();
    } else if (scopeChoice.rootIdentity) {
      cleared = await store.clearRootBindings(scopeChoice.rootIdentity);
    }
  } else if (targetChoice.action === 'tier') {
    const tier = await vscode.window.showQuickPick(
      Object.keys(CANONICAL_TIERS).map((t) => ({ label: t })),
      { placeHolder: 'Select tier to clear' }
    );
    if (!tier) return false;
    if (scopeChoice.scope === 'user') {
      cleared = await store.clearUserBindings({ tier: tier.label as CanonicalModelTier });
    } else if (scopeChoice.rootIdentity) {
      cleared = await store.clearRootBindings(scopeChoice.rootIdentity, { tier: tier.label as CanonicalModelTier });
    }
  } else {
    const actorIds = getAvailableActorIds(getPluginFsPath());
    const actor = await vscode.window.showQuickPick(
      actorIds.map((id) => ({ label: id })),
      { placeHolder: 'Select actor override to clear' }
    );
    if (!actor) return false;
    if (scopeChoice.scope === 'user') {
      cleared = await store.clearUserBindings({ actor: actor.label });
    } else if (scopeChoice.rootIdentity) {
      cleared = await store.clearRootBindings(scopeChoice.rootIdentity, { actor: actor.label });
    }
  }

  if (cleared) {
    await refresh();
    void vscode.window.showInformationMessage(`EVCrate: Cleared bindings in ${scopeChoice.label}`);
  } else {
    void vscode.window.showInformationMessage(`EVCrate: No bindings found to clear in ${scopeChoice.label}`);
  }
  return true;
}
