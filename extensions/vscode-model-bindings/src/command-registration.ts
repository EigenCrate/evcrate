import * as vscode from 'vscode';
import type { CompanionAgentProvider } from './agent-provider.js';
import type { CanonicalModelTier } from './binding-contracts.js';
import type { RuntimeDiagnosticsReport } from './diagnostics.js';
import type { CatalogSnapshot } from './model-catalog.js';
import { ACTOR_ID_PATTERN } from './runtime-contracts.js';
import {
  handleConfigureAgentModels,
  handleConfigureActorModel
} from './configuration-commands.js';
import { handleClearModelBindings } from './clear-commands.js';
import { showModelBindingsDiagnostics } from './diagnostics-display.js';
import { handleSelectInstallation } from './installation-commands.js';

export interface CommandContextDeps {
  readonly getCurrentRootIdentity: () => string | null;
  readonly getPluginFsPath: () => string | null;
  readonly refreshActiveGeneration: () => Promise<boolean>;
  readonly queryAndRefresh: () => Promise<boolean>;
  readonly getActiveProvider: () => CompanionAgentProvider | null;
  readonly getInstanceUuid: () => string;
  readonly getGenerationId: () => number;
  readonly getCatalogSnapshot: () => CatalogSnapshot | null;
  readonly getLatestDiagnosticsReport?: () => RuntimeDiagnosticsReport | null;
  readonly ensureCatalogSubscribed: () => void;
}

function isValidTierTarget(value: unknown): value is CanonicalModelTier | 'all' {
  return typeof value === 'string' && (
    value === 'opus' || value === 'sonnet' || value === 'haiku' || value === 'all'
  );
}

export function registerAllCommands(
  context: vscode.ExtensionContext,
  deps: CommandContextDeps
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('evcrate.selectInstallation', async () =>
      handleSelectInstallation(context, deps.refreshActiveGeneration)
    ),
    vscode.commands.registerCommand('evcrate.showModelBindings', async () =>
      showModelBindingsDiagnostics(
        context,
        deps.getCurrentRootIdentity(),
        deps.getPluginFsPath(),
        deps.getActiveProvider(),
        deps.getInstanceUuid(),
        deps.getGenerationId(),
        deps.getCatalogSnapshot(),
        deps.getLatestDiagnosticsReport?.() ?? null
      )
    ),
    vscode.commands.registerCommand('evcrate.configureAgentModels', async (rawTier?: unknown) => {
      if (rawTier !== undefined && !isValidTierTarget(rawTier)) {
        void vscode.window.showErrorMessage('EVCrate: Invalid tier argument for Configure Agent Model Tiers.');
        return false;
      }
      deps.ensureCatalogSubscribed();
      return handleConfigureAgentModels(
        context,
        deps.getCurrentRootIdentity,
        deps.queryAndRefresh,
        rawTier
      );
    }),
    vscode.commands.registerCommand('evcrate.configureActorModel', async (rawActorId?: unknown) => {
      if (
        rawActorId !== undefined
        && (typeof rawActorId !== 'string' || rawActorId.length > 64 || !ACTOR_ID_PATTERN.test(rawActorId))
      ) {
        void vscode.window.showErrorMessage('EVCrate: Invalid actor ID argument for Configure Actor Model Override.');
        return false;
      }
      deps.ensureCatalogSubscribed();
      return handleConfigureActorModel(
        context,
        deps.getCurrentRootIdentity,
        deps.getPluginFsPath,
        deps.queryAndRefresh,
        rawActorId
      );
    }),
    vscode.commands.registerCommand('evcrate.clearModelBindings', async () =>
      handleClearModelBindings(
        context,
        deps.getCurrentRootIdentity,
        deps.getPluginFsPath,
        deps.refreshActiveGeneration
      )
    )
  ];
}
