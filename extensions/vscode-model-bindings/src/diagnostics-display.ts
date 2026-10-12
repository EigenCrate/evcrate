import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { CompanionAgentProvider } from './agent-provider.js';
import {
  type EffectiveActorBindingResult
} from './binding-contracts.js';
import { resolveInventoryBindings } from './binding-resolver.js';
import { ScopedBindingStore, type StoredBindingResult } from './binding-store.js';
import type { CatalogSnapshot } from './model-catalog.js';
import { isPlainObject } from './runtime-contracts.js';

export async function showModelBindingsDiagnostics(
  context: vscode.ExtensionContext,
  rootIdentity: string | null,
  pluginFsPath: string | null,
  activeProvider: CompanionAgentProvider | null,
  instanceUuid: string,
  generationId: number,
  catalog: CatalogSnapshot | null
): Promise<void> {
  const store = new ScopedBindingStore(context.globalState, context.workspaceState, vscode.env.remoteAuthority);
  const userRes: StoredBindingResult = store.getUserBindings();
  const rootRes: StoredBindingResult = rootIdentity
    ? store.getRootBindings(rootIdentity)
    : Object.freeze({ ok: true, bindings: null });
  const userBindings = userRes.ok ? userRes.bindings : null;
  const rootBindings = rootRes.ok ? rootRes.bindings : null;
  const catalogModels = catalog?.models ?? [];

  let manifestActors: Record<string, { intent?: unknown }> = {};
  if (pluginFsPath) {
    try {
      const manifestPath = join(pluginFsPath, 'evcrate', 'agent-intent.json');
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (isPlainObject(raw) && isPlainObject(raw.actors)) {
        manifestActors = raw.actors as Record<string, { intent?: unknown }>;
      }
    } catch {
      manifestActors = {};
    }
  }

  const inventoryRes = resolveInventoryBindings({
    manifestActors,
    rootBindings,
    userBindings,
    catalog: catalogModels
  });

  const activeCount = activeProvider?.currentResources.length ?? 0;
  const items: vscode.QuickPickItem[] = [
    {
      label: `EVCrate Diagnostics: Gen #${generationId} (${activeCount} active actors)`,
      description: `Root: ${rootIdentity ?? 'None'}`,
      detail: `Instance: ${instanceUuid} • Notice: Cached chat selections may execute previous models until explicit reselection/reload.`
    }
  ];

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
  const isCorrupt = !userRes.ok || !rootRes.ok;
  const sortedActorIds = Object.keys(manifestActors).length > 0
    ? Object.keys(manifestActors).sort()
    : Object.keys(inventoryRes.actors).sort();

  for (const actorId of sortedActorIds) {
    if (isCorrupt) {
      items.push({
        label: `✖ ${actorId}`,
        description: 'WITHHELD',
        detail: 'Reason: CORRUPT_STORED_BINDINGS • Provider withdrawn • hostObserved: null'
      });
    } else {
      const res: EffectiveActorBindingResult = inventoryRes.actors[actorId];
      items.push({
        label: `${res.status === 'contributed' ? '✔' : '✖'} ${res.actorId}`,
        description: res.renderedSelector ?? (res.status === 'contributed' ? 'inherit' : 'UNBOUND'),
        detail: `Tier: ${res.canonicalTier ?? 'none'} • Source: ${res.effectiveSource}${res.reason ? ` • Reason: ${res.reason}` : ''} • hostObserved: null`
      });
    }
  }

  await vscode.window.showQuickPick(items, {
    placeHolder: 'EVCrate Model Bindings Diagnostics (hostObservedModel requires live native execution)'
  });
}
