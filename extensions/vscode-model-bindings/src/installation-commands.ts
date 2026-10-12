import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { inspectCandidateRoot } from './installation-roots.js';

export function getApprovedRoots(context: vscode.ExtensionContext): Set<string> {
  const saved = context.globalState.get<readonly string[]>('evcrate.approvedRoots') ?? [];
  const set = new Set<string>(saved);
  const homeCand = inspectCandidateRoot(join(homedir(), '.evcrate-vscode'), false, false);
  if (homeCand.present && homeCand.valid && typeof homeCand.uri === 'string') {
    set.add(homeCand.uri);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const projCand = inspectCandidateRoot(folder.uri.fsPath, false, true);
    if (projCand.present && projCand.valid && typeof projCand.uri === 'string') {
      set.add(projCand.uri);
    }
  }
  return set;
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
