import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveInstallationRoots,
  findPluginRoot,
  resolveProjectIdentity,
  createSessionContext,
  computeProjectKey,
  computeSessionKey,
  getUserKey
} from '../../dist/adapters/vscode/session-context.js';
import { LOCAL_SESSION_CONTEXT_SOURCE } from '../../dist/adapters/vscode/runtime-sources.js';

function createTempDir(prefix = 'vscode-ctx-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('session-context: findPluginRoot and resolveInstallationRoots discovery', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'my-project');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    const runtimeDir = join(pluginDir, 'evcrate', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });

    const selfFile = join(runtimeDir, 'local-hook-bridge.cjs');
    writeFileSync(selfFile, '// bridge');

    const discovered = findPluginRoot(selfFile);
    assert.equal(realpathSync(discovered), realpathSync(pluginDir));

    // Implicit roots resolution
    const roots = resolveInstallationRoots(selfFile);
    assert.equal(roots.pluginRoot, realpathSync(pluginDir));
    assert.equal(roots.supportRoot, join(roots.pluginRoot, 'evcrate'));
    assert.equal(roots.workflowsRoot, join(roots.pluginRoot, 'evcrate', 'workflows'));
    assert.equal(roots.scriptsRoot, join(roots.pluginRoot, 'evcrate', 'scripts'));
    assert.equal(roots.catalogsRoot, join(roots.pluginRoot, 'evcrate', 'catalogs'));
    assert.equal(roots.skillsRoot, join(roots.pluginRoot, 'skills'));
    assert.equal(roots.boundRoot, realpathSync(projectDir));
    assert.equal(roots.scope, 'project');

    // Outside .evcrate-vscode throws
    const outsideFile = join(base, 'outside.js');
    writeFileSync(outsideFile, '// outside');
    assert.throws(() => findPluginRoot(outsideFile));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-context: resolveInstallationRoots with explicit authorized roots', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'proj');
    const homeDir = join(base, 'home');
    const projectPlugin = join(projectDir, '.evcrate-vscode');
    const homePlugin = join(homeDir, '.evcrate-vscode');

    mkdirSync(join(projectPlugin, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(join(homePlugin, 'evcrate', 'runtime'), { recursive: true });

    const projectSelf = join(projectPlugin, 'evcrate', 'runtime', 'bridge.cjs');
    const homeSelf = join(homePlugin, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(projectSelf, '//');
    writeFileSync(homeSelf, '//');

    // Matching project
    const projRoots = resolveInstallationRoots(projectSelf, { projectRoot: projectDir, homeRoot: homeDir });
    assert.equal(projRoots.scope, 'project');
    assert.equal(projRoots.boundRoot, realpathSync(projectDir));

    // Matching home
    const homeRoots = resolveInstallationRoots(homeSelf, { projectRoot: projectDir, homeRoot: homeDir });
    assert.equal(homeRoots.scope, 'home');
    assert.equal(homeRoots.boundRoot, realpathSync(homeDir));

    // Ambiguous identical roots throw
    assert.throws(() => {
      resolveInstallationRoots(projectSelf, { projectRoot: projectDir, homeRoot: projectDir });
    });

    // Mismatched unauthorized roots throw
    const otherDir = join(base, 'other');
    mkdirSync(otherDir, { recursive: true });
    assert.throws(() => {
      resolveInstallationRoots(projectSelf, { projectRoot: otherDir });
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-context: resolveProjectIdentity project scope and foreign cwd rejection', () => {
  const base = createTempDir();
  try {
    const projectDir = join(base, 'my-project');
    const foreignDir = join(base, 'foreign');
    const pluginDir = join(projectDir, '.evcrate-vscode');
    const subDir = join(projectDir, 'src', 'components');
    mkdirSync(join(pluginDir, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(subDir, { recursive: true });
    mkdirSync(foreignDir, { recursive: true });

    const selfFile = join(pluginDir, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { projectRoot: projectDir });

    // Inside cwd
    const resInside = resolveProjectIdentity({
      installationRoots: roots,
      nativeCwd: subDir
    });
    assert.equal(resInside.status, 'available');
    assert.equal(resInside.identity.projectRoot, realpathSync(projectDir));
    assert.equal(resInside.identity.projectKey, computeProjectKey(realpathSync(projectDir)));

    // Foreign cwd rejected
    const resForeign = resolveProjectIdentity({
      installationRoots: roots,
      nativeCwd: foreignDir
    });
    assert.equal(resForeign.status, 'unavailable');
    assert.equal(resForeign.reason, 'PROJECT_CONTEXT_UNAVAILABLE');

    // Explicit project mismatch rejected
    const resMismatch = resolveProjectIdentity({
      installationRoots: roots,
      explicitProjectRoot: foreignDir
    });
    assert.equal(resMismatch.status, 'unavailable');
    assert.equal(resMismatch.reason, 'SESSION_CONTEXT_PROJECT_MISMATCH');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-context: resolveProjectIdentity home scope requires qualified channel', () => {
  const base = createTempDir();
  try {
    const homeDir = join(base, 'home');
    const projectDir = join(base, 'project');
    const homePlugin = join(homeDir, '.evcrate-vscode');
    mkdirSync(join(homePlugin, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    const selfFile = join(homePlugin, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfFile, '//');

    const roots = resolveInstallationRoots(selfFile, { homeRoot: homeDir });
    assert.equal(roots.scope, 'home');

    // Without qualifiedWorkspaceContract, unavailable
    const resUnqualified = resolveProjectIdentity({
      installationRoots: roots,
      nativeCwd: projectDir,
      explicitProjectRoot: projectDir,
      qualifiedWorkspaceContract: false
    });
    assert.equal(resUnqualified.status, 'unavailable');
    assert.equal(resUnqualified.reason, 'PROJECT_CONTEXT_UNAVAILABLE');

    // With qualifiedWorkspaceContract, available
    const resQualified = resolveProjectIdentity({
      installationRoots: roots,
      nativeCwd: projectDir,
      explicitProjectRoot: projectDir,
      qualifiedWorkspaceContract: true
    });
    assert.equal(resQualified.status, 'available');
    assert.equal(resQualified.identity.projectRoot, realpathSync(projectDir));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('session-context: createSessionContext native vs stateless validation and isolation', () => {
  const base = createTempDir();
  try {
    const projectA = join(base, 'project-a');
    const projectB = join(base, 'project-b');
    const pluginA = join(projectA, '.evcrate-vscode');
    const pluginB = join(projectB, '.evcrate-vscode');
    mkdirSync(join(pluginA, 'evcrate', 'runtime'), { recursive: true });
    mkdirSync(join(pluginB, 'evcrate', 'runtime'), { recursive: true });

    const selfA = join(pluginA, 'evcrate', 'runtime', 'bridge.cjs');
    const selfB = join(pluginB, 'evcrate', 'runtime', 'bridge.cjs');
    writeFileSync(selfA, '//');
    writeFileSync(selfB, '//');

    const rootsA = resolveInstallationRoots(selfA, { projectRoot: projectA });
    const rootsB = resolveInstallationRoots(selfB, { projectRoot: projectB });

    const sessionId = 'session-12345';

    // 1. Same session ID in two different projects stay isolated
    const ctxA = createSessionContext({ sessionId, cwd: projectA }, rootsA, { tmpDir: base });
    const ctxB = createSessionContext({ sessionId, cwd: projectB }, rootsB, { tmpDir: base });

    assert.equal(ctxA.kind, 'native');
    assert.equal(ctxB.kind, 'native');
    assert.notEqual(ctxA.projectKey, ctxB.projectKey);
    assert.notEqual(ctxA.sessionKey, ctxB.sessionKey);
    assert.notEqual(ctxA.handle, ctxB.handle);

    // 2. Two sessions in same project keep distinct session keys and handles
    const ctxA2 = createSessionContext({ sessionId: 'session-67890', cwd: projectA }, rootsA, { tmpDir: base });
    assert.equal(ctxA2.kind, 'native');
    assert.equal(ctxA2.projectKey, ctxA.projectKey);
    assert.notEqual(ctxA2.sessionKey, ctxA.sessionKey);
    assert.notEqual(ctxA2.handle, ctxA.handle);

    // 3. Missing or empty session ID yields stateless
    const ctxMissing = createSessionContext({ sessionId: '', cwd: projectA }, rootsA);
    assert.equal(ctxMissing.kind, 'stateless');
    assert.equal(ctxMissing.reason, 'SESSION_ID_MISSING');

    const ctxNull = createSessionContext({ sessionId: null, cwd: projectA }, rootsA);
    assert.equal(ctxNull.kind, 'stateless');
    assert.equal(ctxNull.reason, 'SESSION_ID_MISSING');

    // 4. Oversized session ID (> 256 bytes) yields stateless
    const longId = 'a'.repeat(257);
    const ctxOversized = createSessionContext({ sessionId: longId, cwd: projectA }, rootsA);
    assert.equal(ctxOversized.kind, 'stateless');
    assert.equal(ctxOversized.reason, 'SESSION_ID_INVALID_LENGTH');

    // 5. Control characters yield stateless
    const ctrlId = 'session\x00bad';
    const ctxCtrl = createSessionContext({ sessionId: ctrlId, cwd: projectA }, rootsA);
    assert.equal(ctxCtrl.kind, 'stateless');
    assert.equal(ctxCtrl.reason, 'SESSION_ID_CONTROL_CHARS');

    // 6. Foreign cwd yields stateless
    const ctxForeign = createSessionContext({ sessionId, cwd: base }, rootsA);
    assert.equal(ctxForeign.kind, 'stateless');
    assert.equal(ctxForeign.reason, 'PROJECT_CONTEXT_UNAVAILABLE');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
