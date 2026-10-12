import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CACHED_SELECTION_RESELECTION_GUIDANCE, CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE, buildRuntimeDiagnosticsSnapshot
} from '../../.cache/evcrate/vscode-model-bindings-dist/diagnostics.js';
import { fsPathToLocalRootUri } from '../../.cache/evcrate/vscode-model-bindings-dist/installation-roots.js';
import { buildCatalogSnapshot } from '../../.cache/evcrate/vscode-model-bindings-dist/model-catalog.js';
import { createScopedTemplateWatcher } from '../../.cache/evcrate/vscode-model-bindings-dist/template-watcher.js';
import { UUID_1, createHarness, writePluginFixture } from './refresh-test-harness.mjs';

async function waitForCondition(predicate, timeoutMs = 1500, intervalMs = 15) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return predicate();
}

test('refresh-lifecycle: coalesces event bursts, preserves forced catalog requery on supersession, and reuses A->B->A generations', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-coalesce-'));
  try {
    const h = createHarness(tmp, { debounceMs: 30 });
    writePluginFixture(h.projDir, { 'evc-planner': { intent: { mode: 'tier', tier: 'opus' } } });
    const rootId = fsPathToLocalRootUri(h.projDir).rootIdentity;
    await h.store.saveRootBindings(rootId, {
      schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: {}
    });
    await Promise.all([1, 2, 3, 4, 5].map(() => h.controller.requestRefresh({ reason: 'bindings-updated' })));
    assert.equal(h.controller.currentGenerationId, 1);
    assert.equal(h.getCatalogQueryCount(), 1);
    const gen1File = h.provider.currentResources[0].fsPath;
    assert.equal(existsSync(gen1File), true);

    // Forced catalog query superseded by non-forcing template-changed still re-queries catalog on next pass
    let resolveSlowCatalog;
    let callIdx = 0;
    h.setCustomQueryCatalog((rev) => {
      callIdx += 1;
      if (callIdx === 1) {
        return new Promise((resolve) => {
          resolveSlowCatalog = () => resolve(buildCatalogSnapshot([
            { vendor: 'copilot', id: 'claude-opus-4', name: 'Stale Opus Name' }
          ], rev));
        });
      }
      return Promise.resolve(buildCatalogSnapshot([
        { vendor: 'copilot', id: 'claude-opus-4', name: 'Updated Opus Name' },
        { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
      ], rev));
    });

    const slowPromise = h.controller.requestRefresh({ reason: 'catalog-changed', immediate: true, forceCatalogQuery: true });
    assert.equal(h.provider.currentResources.length, 0);
    // Supersede with a non-forcing template-changed refresh
    const supersedingPromise = h.controller.requestRefresh({ reason: 'template-changed', immediate: true });
    resolveSlowCatalog();
    await Promise.all([slowPromise, supersedingPromise]);

    assert.equal(callIdx, 2);
    assert.equal(h.controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'Updated Opus Name (copilot)');
    assert.equal(h.controller.currentGenerationId, 2);

    // A -> B -> A binding flip reuses gen-2 without allocating gen-4
    await h.store.saveRootBindings(rootId, {
      schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: { vendor: 'copilot', id: 'claude-sonnet-4' } }, actors: {}
    });
    await h.controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(h.controller.currentGenerationId, 3);

    await h.store.saveRootBindings(rootId, {
      schema: 'evcrate-vscode-bindings-v1', revision: 3, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: {}
    });
    await h.controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(h.controller.currentGenerationId, 3);
    assert.equal(h.controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'Updated Opus Name (copilot)');
    assert.equal(existsSync(gen1File), true);
    h.controller.dispose();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('refresh-lifecycle: removed catalog model withdraws actor without deleting bindings; lock contention retains active inventory', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-catalog-'));
  try {
    const h = createHarness(tmp, { debounceMs: 10 });
    writePluginFixture(h.projDir, {
      'evc-planner': { intent: { mode: 'tier', tier: 'opus' } },
      'evc-scout': { intent: { mode: 'inherit', tier: null } }
    });
    await h.store.saveUserBindings({
      schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: {},
      actors: { 'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-opus-4' } }
    });

    await h.controller.requestRefresh({ reason: 'startup', immediate: true });
    assert.equal(h.provider.currentResources.length, 2);
    assert.equal(h.controller.currentGenerationId, 1);

    // Stage lock contention during binding update retains existing provider inventory until lock clears
    const lockDir = join(h.storageDir, '.authority-stage.lock');
    mkdirSync(lockDir, { recursive: true });
    await h.store.saveUserBindings({
      schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: {},
      actors: { 'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-sonnet-4' } }
    });
    await h.controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(h.provider.currentResources.length, 2);
    rmSync(lockDir, { recursive: true, force: true });
    await h.controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(h.controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'Claude Sonnet 4 (copilot)');

    h.setCatalogModels([]);
    await h.controller.requestRefresh({ reason: 'catalog-changed', immediate: true, forceCatalogQuery: true });
    assert.equal(h.provider.currentResources.length, 1);
    assert.equal(h.provider.currentResources[0].actorId, 'evc-scout');
    assert.equal(h.store.getUserBindings().bindings.actors['evc-planner'].id, 'claude-sonnet-4');

    h.setCatalogModels([{ vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }]);
    await h.controller.requestRefresh({ reason: 'catalog-changed', immediate: true, forceCatalogQuery: true });
    assert.equal(h.provider.currentResources.length, 2);
    h.controller.dispose();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('refresh-lifecycle: real watcher survives atomic directory swap; handles schema incompatibility, root switch, trust revoke, and deactivation', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-p06-transitions-'));
  try {
    const projA = join(tmp, 'proj-a');
    const projB = join(tmp, 'proj-b');
    const pluginA = writePluginFixture(projA, {
      'evc-planner': { intent: { mode: 'inherit', tier: null } },
      'evc-legacy': { intent: { mode: 'inherit', tier: null } }
    });
    writePluginFixture(projB, { 'evc-reviewer': { intent: { mode: 'inherit', tier: null } } });

    // Real watcher test across publication-style atomic swap (rename dest->backup; rename stage->dest)
    const watchedEvents = [];
    const storagePath = join(tmp, 'storage');
    mkdirSync(storagePath, { recursive: true });
    const realWatcher = createScopedTemplateWatcher(pluginA, storagePath, (p) => watchedEvents.push(p));
    const stageRoot = join(tmp, 'stage-root');
    writePluginFixture(stageRoot, { 'evc-planner': { content: '---\nname: evc-planner\n---\nSwapped v2', intent: { mode: 'inherit', tier: null } } });
    const backupPlugin = join(projA, '.evcrate-vscode.bak');
    renameSync(pluginA, backupPlugin);
    renameSync(join(stageRoot, '.evcrate-vscode'), pluginA);
    assert.equal(await waitForCondition(() => watchedEvents.length >= 1), true, 'Watcher must detect atomic swap');

    // Unrelated workspace file and derived storage writes must be ignored
    watchedEvents.length = 0;
    writeFileSync(join(projA, 'unrelated-readme.txt'), 'unrelated change', 'utf8');
    writeFileSync(join(storagePath, 'derived-artifact.md'), 'derived storage write', 'utf8');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(watchedEvents.length, 0, 'Unrelated workspace and storage writes must not fire watcher');

    // Subsequent edit inside replacement directory must fire watcher
    writeFileSync(join(pluginA, 'evcrate', 'agent-templates', 'evc-planner.md'), '---\nname: evc-planner\n---\nPost-swap edit', 'utf8');
    assert.equal(await waitForCondition(() => watchedEvents.length >= 1), true, 'Watcher must survive swap and detect subsequent template edit');

    realWatcher.dispose();
    watchedEvents.length = 0;
    writeFileSync(join(pluginA, 'evcrate', 'agent-templates', 'evc-planner.md'), '---\nname: evc-planner\n---\nAfter dispose', 'utf8');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(watchedEvents.length, 0, 'Disposed watcher must not emit events');

    const h = createHarness(tmp, {
      projDir: projA, workspaceFolders: [projA, projB], selectedRootIdentity: fsPathToLocalRootUri(projA).rootIdentity, debounceMs: 10
    });
    await h.store.saveUserBindings({
      schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: {}, actors: { 'evc-legacy': { kind: 'inherit' } }
    });
    writePluginFixture(projA, { 'evc-planner': { intent: { mode: 'inherit', tier: null } } });
    await h.controller.requestRefresh({ reason: 'startup', immediate: true });
    assert.deepEqual(h.provider.currentResources.map((r) => r.actorId), ['evc-planner']);
    assert.deepEqual(h.controller.lastDiagnosticsReport.removedStoredActors, ['evc-legacy']);

    // Unsupported future manifest schema withdraws inventory with SCHEMA_UNSUPPORTED while preserving bindings
    writeFileSync(join(pluginA, 'evcrate', 'agent-intent.json'), JSON.stringify({ schema: 'evcrate-vscode-agent-intent-v99', actors: {} }), 'utf8');
    await h.controller.requestRefresh({ reason: 'template-changed', immediate: true });
    assert.equal(h.provider.currentResources.length, 0);
    assert.equal(h.controller.lastDiagnosticsReport.setupOrInvalidationReason, 'SCHEMA_UNSUPPORTED');

    h.setSelectedRootIdentity(fsPathToLocalRootUri(projB).rootIdentity);
    await h.controller.requestRefresh({ reason: 'root-changed', immediate: true });
    assert.deepEqual(h.provider.currentResources.map((r) => r.actorId), ['evc-reviewer']);

    h.setWorkspaceTrusted(false);
    await h.controller.requestRefresh({ reason: 'trust-changed', immediate: true });
    assert.equal(h.provider.currentResources.length, 0);
    assert.equal(h.controller.lastDiagnosticsReport.setupOrInvalidationReason, 'WORKSPACE_UNTRUSTED');
    h.controller.dispose();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('diagnostics: buildRuntimeDiagnosticsSnapshot separates renderedSelector from hostObservedModel and surfaces storage cleanup guidance', () => {
  const report = buildRuntimeDiagnosticsSnapshot({
    rootIdentity: 'file:///work/proj', authority: 'local-file', instanceUuid: UUID_1, generationId: 4,
    baseStorageFsPath: '/tmp/evc-store', catalogRevision: 2, templateInventorySha256: 'a'.repeat(64),
    manifestActors: { 'evc-planner': { intent: { mode: 'tier', tier: 'opus' } } },
    rootBindings: { schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: {} },
    userBindings: { schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: {}, actors: {} },
    catalog: [{ vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4' }],
    publishedActorIds: [], setupOrInvalidationReason: 'STORAGE_BUDGET_EXCEEDED', storageExhausted: true
  });
  assert.equal(report.rootBindingRevision, 2);
  assert.equal(report.userBindingRevision, 1);
  assert.equal(report.diagnostics.bindingRevision, 2_000_001);
  assert.equal(report.reselectionGuidance, CACHED_SELECTION_RESELECTION_GUIDANCE);
  assert.ok(report.storageCleanupGuidance.includes(CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE));
  assert.ok(report.storageCleanupGuidance.includes(join('/tmp/evc-store', 'resolved')));
  assert.equal(report.diagnostics.actors['evc-planner'].renderedSelector, null);
  assert.equal(report.diagnostics.actors['evc-planner'].hostObservedModel, null);
});
