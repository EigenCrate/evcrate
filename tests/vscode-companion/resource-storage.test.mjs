import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAgentTemplate } from '../../.cache/evcrate/vscode-model-bindings-dist/agent-renderer.js';
import { canReclaimGeneration } from '../../.cache/evcrate/vscode-model-bindings-dist/contracts.js';
import { stageAgentGeneration } from '../../.cache/evcrate/vscode-model-bindings-dist/resource-storage.js';
import {
  CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE,
  formatStorageCleanupGuidance,
  inspectAuthorityStorageUsage
} from '../../.cache/evcrate/vscode-model-bindings-dist/storage-accounting.js';
import { UUID_1, UUID_2 } from './refresh-test-harness.mjs';

test('resource-storage: inspectAuthorityStorageUsage tracks per-instance and shared authority bytes across roots and staging', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-storage-'));
  try {
    const agent = renderAgentTemplate({
      actorId: 'evc-planner',
      templateContent: '---\nname: evc-planner\n---\nPlanner body content',
      modelSelector: 'Claude Opus 4 (copilot)'
    });
    const gen1 = stageAgentGeneration({
      baseStorageFsPath: tmp, rootIdentity: 'file:///work/root-a', instanceUuid: UUID_1,
      generationId: 1, renderedAgents: [agent]
    });
    const gen2 = stageAgentGeneration({
      baseStorageFsPath: tmp, rootIdentity: 'file:///work/root-b', instanceUuid: UUID_2,
      generationId: 1, renderedAgents: [agent]
    });

    const usage1 = inspectAuthorityStorageUsage(tmp, UUID_1);
    assert.equal(usage1.activeInstanceGenerations, 1);
    assert.equal(usage1.activeInstanceBytes, gen1.totalBytes);
    assert.equal(usage1.persistentAuthorityBytes, gen1.totalBytes + gen2.totalBytes);

    // Benign regular file inside resolved/ is counted without failing scan
    writeFileSync(join(tmp, 'resolved', '.DS_Store'), '1234', 'utf8');
    const usageWithMeta = inspectAuthorityStorageUsage(tmp, UUID_1);
    assert.equal(usageWithMeta.persistentAuthorityBytes, gen1.totalBytes + gen2.totalBytes + 4);

    // Recent staging directory counts toward authority bytes; stale staging directory is cleaned on next stage
    const staleStage = join(tmp, `.staging-${UUID_2}-abandoned`);
    mkdirSync(staleStage, { recursive: true });
    writeFileSync(join(staleStage, 'partial.agent.md'), '1234567890', 'utf8');
    const usageWithStage = inspectAuthorityStorageUsage(tmp, UUID_1);
    assert.equal(usageWithStage.persistentAuthorityBytes, gen1.totalBytes + gen2.totalBytes + 14);

    const past = new Date(Date.now() - 120_000);
    utimesSync(staleStage, past, past);
    stageAgentGeneration({
      baseStorageFsPath: tmp, rootIdentity: 'file:///work/root-a', instanceUuid: UUID_1,
      generationId: 2, renderedAgents: [agent], lockStaleAfterMs: 1_000
    });
    assert.equal(existsSync(staleStage), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resource-storage: on-disk 32-generation cap and authority budget block new derivation without deleting existing generations', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-cap-'));
  try {
    const agent = renderAgentTemplate({
      actorId: 'evc-scout', templateContent: '---\nname: evc-scout\n---\nScout body', modelSelector: null
    });
    const stagedPaths = [];
    for (let i = 1; i <= 32; i++) {
      const res = stageAgentGeneration({
        baseStorageFsPath: tmp, rootIdentity: 'file:///work/proj', instanceUuid: UUID_1,
        generationId: i, renderedAgents: [agent]
      });
      stagedPaths.push(res.generationFsPath);
    }

    assert.throws(
      () => stageAgentGeneration({
        baseStorageFsPath: tmp, rootIdentity: 'file:///work/proj', instanceUuid: UUID_1,
        generationId: 33, renderedAgents: [agent]
      }),
      (err) => {
        assert.equal(err.code, 'STORAGE_BUDGET_EXCEEDED');
        assert.equal(err.message, formatStorageCleanupGuidance(tmp));
        assert.ok(err.message.includes(CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE));
        return true;
      }
    );
    for (const p of stagedPaths) assert.equal(existsSync(p), true);

    // Reclamation contract policy guard checks
    assert.equal(canReclaimGeneration({
      ownerInstanceUuid: UUID_2, currentInstanceUuid: UUID_1, isActiveTurnGeneration: false,
      automaticReclamationProven: true, allEditorWindowsClosed: false, referencingSessionsRetired: false
    }), false);
    assert.equal(canReclaimGeneration({
      ownerInstanceUuid: UUID_1, currentInstanceUuid: UUID_1, isActiveTurnGeneration: false,
      automaticReclamationProven: false, allEditorWindowsClosed: false, referencingSessionsRetired: false
    }), false);
    assert.equal(canReclaimGeneration({
      ownerInstanceUuid: UUID_1, currentInstanceUuid: UUID_1, isActiveTurnGeneration: true,
      automaticReclamationProven: true, allEditorWindowsClosed: true, referencingSessionsRetired: true
    }), false);
    assert.equal(canReclaimGeneration({
      ownerInstanceUuid: UUID_1, currentInstanceUuid: UUID_2, isActiveTurnGeneration: false,
      automaticReclamationProven: false, allEditorWindowsClosed: true, referencingSessionsRetired: true
    }), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('resource-storage: fails closed on symlinks, scan entry bounds, and active lock contention while recovering stale locks safely', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-locks-'));
  try {
    const agent = renderAgentTemplate({
      actorId: 'evc-planner', templateContent: '---\nname: evc-planner\n---\nBody', modelSelector: null
    });
    const lockDir = join(tmp, '.authority-stage.lock');
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ instanceUuid: UUID_2, pid: 99999, token: 'other-token' }), 'utf8');
    assert.throws(
      () => stageAgentGeneration({
        baseStorageFsPath: tmp, rootIdentity: 'file:///work/proj', instanceUuid: UUID_1,
        generationId: 1, renderedAgents: [agent], lockStaleAfterMs: 60_000, lockRetryAttempts: 1, lockRetryDelayMs: 5
      }),
      { code: 'STORAGE_LOCK_CONTENTION' }
    );
    // Lock owned by other instance remains intact after failed contention
    assert.equal(existsSync(lockDir), true);

    const past = new Date(Date.now() - 120_000);
    utimesSync(lockDir, past, past);
    const staged = stageAgentGeneration({
      baseStorageFsPath: tmp, rootIdentity: 'file:///work/proj', instanceUuid: UUID_1,
      generationId: 1, renderedAgents: [agent], lockStaleAfterMs: 1_000, lockRetryAttempts: 0
    });
    assert.equal(existsSync(staged.generationFsPath), true);

    assert.throws(() => inspectAuthorityStorageUsage(tmp, UUID_1, { maxScanEntries: 2 }), { code: 'BOUNDS_EXCEEDED' });
    symlinkSync(staged.generationFsPath, join(tmp, 'resolved', 'evil-link'));
    assert.throws(() => inspectAuthorityStorageUsage(tmp, UUID_1), { code: 'PATH_UNSAFE' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
