import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  publishApply, publishDryRun, recoverPublication,
  resolveInvocationContext, resolvePublicationProjectContext
} from '../../dist/index.js';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url)).replace(/[/\\]$/u, '');

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

test('VS Code target project publication commits scoped .evcrate-vscode without clobbering .evcrate.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-vscode-project-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);

  const projectVscode = join(project, '.evcrate-vscode');
  directory(projectVscode);
  const userConfig = join(projectVscode, '.evcrate.json');
  writeFileSync(userConfig, '{"customUserSetting":true}\n', { mode: 0o600 });
  const unownedUserDoc = join(projectVscode, 'my-notes.txt');
  writeFileSync(unownedUserDoc, 'do not delete\n', { mode: 0o600 });

  try {
    const context = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['vscode']
    });
    const request = { scope: 'project', selectedTargets: ['vscode'] };
    const identity = resolvePublicationProjectContext(context).projectIdentity;

    const preview = publishDryRun(context, request);
    assert.equal(preview.scope, 'project');
    assert.equal(preview.phases[0].scope, 'home');
    assert.equal(preview.phases[1].scope, 'project');

    const result = publishApply(context, {}, request);
    assert.equal(result.scope, 'project');
    assert.equal(result.phases[0].scope, 'home');
    assert.equal(result.phases[1].scope, 'project');

    assert.equal(existsSync(join(projectVscode, 'plugin.json')), true);
    assert.equal(readFileSync(userConfig, 'utf8'), '{"customUserSetting":true}\n');
    assert.equal(readFileSync(unownedUserDoc, 'utf8'), 'do not delete\n');
    assert.equal(existsSync(join(project, '.evcrate')), false);
    assert.equal(existsSync(join(home, '.evcrate-vscode')), false);

    const projectState = join(context.stateRoot, 'project-publication', identity);
    const marker = JSON.parse(readFileSync(join(projectState, 'release-marker.json'), 'utf8'));
    assert.equal(marker.schema_version, 2);
    assert.equal(marker.scope, 'project');
    assert.equal(marker.records.harness.status, 'complete');
    assert.equal(marker.records.harness.destination_root, project);
    assert.equal(marker.records.harness.retention, 'none');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Scope-isolated recovery preserves independent scopes for VS Code target', () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-vscode-recovery-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  directory(home);
  directory(project);

  try {
    const homeContext = resolveInvocationContext({ packageRoot, cwd: packageRoot, home, targets: ['vscode'] });
    publishApply(homeContext);

    const projectContext = resolveInvocationContext({
      packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['vscode']
    });
    const request = { scope: 'project', selectedTargets: ['vscode'] };
    const identity = resolvePublicationProjectContext(projectContext).projectIdentity;
    publishApply(projectContext, {}, request);

    const projectRecovery = recoverPublication(projectContext, {
      scope: 'project', projectIdentity: identity, releaseId: null
    });
    assert.equal(projectRecovery.action, 'none');
    assert.equal(existsSync(join(home, '.evcrate-vscode', 'plugin.json')), true);

    const homeRecovery = recoverPublication(homeContext, {
      scope: 'home', projectIdentity: null, releaseId: null
    });
    assert.equal(homeRecovery.action, 'none');
    assert.equal(existsSync(join(project, '.evcrate-vscode', 'plugin.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
