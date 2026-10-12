import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { CatalogSnapshot, ValidatedCatalogModel } from './model-catalog.js';

export const CANONICAL_ACTOR_IDS: readonly string[] = Object.freeze([
  'evc-brainstormer',
  'evc-code-reviewer',
  'evc-copywriter',
  'evc-database-admin',
  'evc-debugger',
  'evc-docs-manager',
  'evc-fullstack-developer',
  'evc-git-manager',
  'evc-journal-writer',
  'evc-mcp-manager',
  'evc-planner',
  'evc-project-manager',
  'evc-researcher',
  'evc-scout-external',
  'evc-scout',
  'evc-tester',
  'evc-ui-ux-designer'
]);

export function getAvailableActorIds(pluginFsPath?: string | null): readonly string[] {
  if (pluginFsPath) {
    try {
      const manifestPath = join(pluginFsPath, 'evcrate', 'agent-intent.json');
      const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (raw && typeof raw.actors === 'object' && !Array.isArray(raw.actors)) {
        return Object.keys(raw.actors).sort();
      }
    } catch {
      return [];
    }
    return [];
  }
  return CANONICAL_ACTOR_IDS;
}

export interface ScopeChoice {
  readonly label: string;
  readonly scope: 'user' | 'root';
  readonly rootIdentity?: string;
}

export async function selectConfigurationScope(
  currentRootIdentity: string | null
): Promise<ScopeChoice | null> {
  const items: ScopeChoice[] = [
    { label: 'User Defaults (global across all projects)', scope: 'user' }
  ];
  if (currentRootIdentity) {
    items.unshift({
      label: `Current Workspace Root (${currentRootIdentity})`,
      scope: 'root',
      rootIdentity: currentRootIdentity
    });
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select configuration scope'
  });
  return picked ?? null;
}

export async function pickCatalogModel(
  catalog: CatalogSnapshot,
  title: string
): Promise<ValidatedCatalogModel | null> {
  if (catalog.models.length === 0) {
    void vscode.window.showWarningMessage('EVCrate: No models available in language model catalog.');
    return null;
  }
  const seen = new Set<string>();
  const uniqueModels: ValidatedCatalogModel[] = [];
  for (const m of catalog.models) {
    if (seen.has(m.selector)) continue;
    seen.add(m.selector);
    uniqueModels.push(m);
  }
  const items = uniqueModels.map((m) => ({
    label: m.selector,
    description: `id: ${m.id}`,
    detail: m.family ? `family: ${m.family}` : undefined,
    model: m
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: title });
  return picked ? picked.model : null;
}
