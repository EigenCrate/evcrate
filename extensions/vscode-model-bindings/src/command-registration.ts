import * as vscode from 'vscode';
import type { CompanionAgentProvider } from './agent-provider.js';
import type { CatalogSnapshot } from './model-catalog.js';
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
  readonly ensureCatalogSubscribed: () => void;
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
        deps.getCatalogSnapshot()
      )
    ),
    vscode.commands.registerCommand('evcrate.configureAgentModels', async () => {
      deps.ensureCatalogSubscribed();
      return handleConfigureAgentModels(
        context,
        deps.getCurrentRootIdentity,
        deps.queryAndRefresh
      );
    }),
    vscode.commands.registerCommand('evcrate.configureActorModel', async () => {
      deps.ensureCatalogSubscribed();
      return handleConfigureActorModel(
        context,
        deps.getCurrentRootIdentity,
        deps.getPluginFsPath,
        deps.queryAndRefresh
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
