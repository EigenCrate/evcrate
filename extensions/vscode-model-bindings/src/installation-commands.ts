import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { inspectCandidateRoot } from './installation-roots.js';

export function getApprovedRoots(context: vscode.ExtensionContext): Set<string> {
  const saved = context.globalState.get<readonly string[]>('evcrate.approvedRoots') ?? [];
  return new Set<string>(saved);
}

export async function handleSelectInstallation(
  context: vscode.ExtensionContext,
  refresh: () => Promise<boolean>
): Promise<void> {
  const folderPaths = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const candidates = folderPaths
    .map((p) => inspectCandidateRoot(p, false, true))
    .filter((c) => c.present && c.valid);
  const homePath = join(homedir(), '.evcrate-vscode');
  const homeCand = inspectCandidateRoot(homePath, false, false);
  if (homeCand.present && homeCand.valid) {
    candidates.push(homeCand);
  }

  if (candidates.length === 0) {
    void vscode.window.showWarningMessage('EVCrate: No valid installations found in workspace or HOME');
    return;
  }
  const items = candidates.map((c) => ({
    label: typeof c.uri === 'string' ? c.uri : c.uri.path,
    description: c === homeCand ? 'HOME installation' : 'Project installation'
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select EVCrate installation root to approve and activate'
  });
  if (picked) {
    const approved = getApprovedRoots(context);
    approved.add(picked.label);
    await context.globalState.update('evcrate.approvedRoots', [...approved]);
    await context.globalState.update('evcrate.selectedRootIdentity', picked.label);
    await refresh();
    void vscode.window.showInformationMessage(`EVCrate: Activated root "${picked.label}"`);
  }
}
