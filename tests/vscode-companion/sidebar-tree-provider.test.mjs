import Module from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mockVsCode = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } },
  EventEmitter: class {
    constructor() { this.listeners = []; this.event = (fn) => { this.listeners.push(fn); return { dispose: () => {} }; }; }
    fire(d) { for (const fn of this.listeners) fn(d); }
    dispose() { this.listeners = []; }
  }
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = (req, ...rest) => req === 'vscode' ? 'vscode' : origResolve.apply(this, [req, ...rest]);
const origLoad = Module._load;
Module._load = (req, ...rest) => req === 'vscode' ? mockVsCode : origLoad.apply(this, [req, ...rest]);

const { EvcrateSidebarTreeProvider } = await import('../../.cache/evcrate/vscode-model-bindings-dist/sidebar-tree-provider.js');
const { createInitialSidebarSnapshot, captureCommittedSidebarSnapshot } = await import('../../.cache/evcrate/vscode-model-bindings-dist/sidebar-snapshot.js');
const { buildRuntimeDiagnosticsSnapshot } = await import('../../.cache/evcrate/vscode-model-bindings-dist/diagnostics.js');
const { CANONICAL_ACTOR_IDS } = await import('../../.cache/evcrate/vscode-model-bindings-dist/configuration-pickers.js');
const { buildCatalogSnapshot } = await import('../../.cache/evcrate/vscode-model-bindings-dist/model-catalog.js');
const { RefreshController } = await import('../../.cache/evcrate/vscode-model-bindings-dist/refresh-controller.js');
const { CompanionAgentProvider } = await import('../../.cache/evcrate/vscode-model-bindings-dist/agent-provider.js');
const { ScopedBindingStore } = await import('../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js');
const { fsPathToLocalRootUri } = await import('../../.cache/evcrate/vscode-model-bindings-dist/installation-roots.js');
const { UUID_1, MockMemento, writePluginFixture } = await import('./refresh-test-harness.mjs');

const CATALOG = buildCatalogSnapshot([{ vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4' }, { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }], 1);

test('sidebar snapshot capture, initial pending topology, root states, and tier precedence', () => {
  let snap = createInitialSidebarSnapshot();
  assert.deepEqual(snap, { report: null, rootBindings: null, userBindings: null, catalog: null, settingsPending: true });
  const provider = new EvcrateSidebarTreeProvider(() => snap);
  const roots = provider.getChildren();
  assert.deepEqual(roots.map((r) => [r.id, r.label, r.collapsibleState]), [
    ['section:root', 'Installation Root', 2], ['section:tiers', 'Model Tiers', 2], ['section:actors', 'Agents (0)', 2]
  ]);
  const rootLeaf = provider.getChildren(roots[0])[0];
  assert.equal(rootLeaf.description, 'Initial refresh pending');
  assert.deepEqual(rootLeaf.command, { title: 'Select Installation Root', command: 'evcrate.selectInstallation', arguments: [] });
  assert.equal(provider.getTreeItem(rootLeaf).collapsibleState, 0);
  assert.deepEqual(provider.getChildren(rootLeaf), []);
  assert.deepEqual(provider.getChildren(roots[1]).map((t) => [t.id, t.description, t.command.arguments]), [
    ['tier:opus', 'Settings pending refresh', ['opus']], ['tier:sonnet', 'Settings pending refresh', ['sonnet']],
    ['tier:haiku', 'Settings pending refresh', ['haiku']], ['tier:all', 'Settings pending refresh', ['all']]
  ]);
  assert.equal(provider.getChildren(roots[2])[0].label, 'No agents loaded yet');

  const makeReport = (overrides = {}) => buildRuntimeDiagnosticsSnapshot({
    rootIdentity: 'file:///work/proj', authority: 'local-file', instanceUuid: UUID_1, generationId: 1,
    catalogRevision: 1, catalog: CATALOG.models, manifestActors: {}, ...overrides
  });
  for (const [ov, expectedRootDesc] of [
    [{ authority: 'unsupported-remote', rootIdentity: null, setupOrInvalidationReason: 'UNSUPPORTED_REMOTE_AUTHORITY' }, 'Unsupported remote authority'],
    [{ rootIdentity: null, setupOrInvalidationReason: 'WORKSPACE_UNTRUSTED' }, 'Workspace untrusted'],
    [{ rootIdentity: null, setupOrInvalidationReason: 'NO_INSTALLATION_FOUND' }, 'No installation found'],
    [{ rootIdentity: null, setupOrInvalidationReason: 'MULTI_ROOT_SELECTION_REQUIRED' }, 'Multi-root selection required'],
    [{ storageExhausted: true, setupOrInvalidationReason: 'STORAGE_BUDGET_EXCEEDED' }, 'STORAGE_BUDGET_EXCEEDED (file:///work/proj)'],
    [{}, 'Empty inventory (file:///work/proj)']
  ]) {
    snap = { report: makeReport(ov), rootBindings: null, userBindings: null, catalog: CATALOG, settingsPending: false };
    assert.equal(provider.getChildren(roots[0])[0].description, expectedRootDesc);
  }
  assert.equal(provider.getChildren(roots[2])[0].label, 'No agents in manifest');

  const rootB = { schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: {} };
  const userB = { schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { opus: { vendor: 'copilot', id: 'claude-sonnet-4' }, sonnet: { vendor: 'copilot', id: 'claude-sonnet-4' } }, actors: {} };
  const report = makeReport({ rootBindings: rootB, userBindings: userB });
  const okStore = () => ({ userRes: { ok: true, bindings: userB }, rootRes: { ok: true, bindings: rootB } });

  for (const bad of [
    { report: null, currentRootIdentity: 'file:///work/proj', getStoredBindings: okStore, catalog: CATALOG },
    { report, currentRootIdentity: 'file:///work/other', getStoredBindings: okStore, catalog: CATALOG },
    { report, currentRootIdentity: 'file:///work/proj', getStoredBindings: okStore, catalog: buildCatalogSnapshot([], 9) },
    { report, currentRootIdentity: 'file:///work/proj', catalog: CATALOG, getStoredBindings: () => ({ userRes: { ok: true, bindings: { ...userB, revision: 9 } }, rootRes: { ok: true, bindings: rootB } }) }
  ]) assert.equal(captureCommittedSidebarSnapshot(bad).settingsPending, true);
  const corruptSnap = captureCommittedSidebarSnapshot({ report: makeReport(), currentRootIdentity: 'file:///work/proj', catalog: CATALOG, getStoredBindings: () => ({ userRes: { ok: false, error: new Error('corrupt') }, rootRes: { ok: true, bindings: null } }) });
  assert.deepEqual([corruptSnap.settingsPending, corruptSnap.userBindings], [false, null]);
  snap = captureCommittedSidebarSnapshot({ report, currentRootIdentity: 'file:///work/proj', getStoredBindings: okStore, catalog: CATALOG });
  assert.equal(snap.settingsPending, false);
  assert.deepEqual(provider.getChildren(roots[1]).map((t) => t.description), [
    'Claude Opus 4 (copilot) [root.tier]', 'Claude Sonnet 4 (copilot) [user.tier]', 'Unbound', 'Configure all 3 tiers'
  ]);
  const allSame = { schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: rootB.tiers.opus, sonnet: rootB.tiers.opus, haiku: rootB.tiers.opus }, actors: {} };
  snap = { report, rootBindings: allSame, userBindings: null, catalog: CATALOG, settingsPending: false };
  assert.equal(provider.getChildren(roots[1])[3].description, 'Claude Opus 4 (copilot) (all 3 tiers)');
});

test('sidebar actor truth: 17 canonical actors, removedStoredActors filtered, inherit retained, badges, and events', () => {
  const manifestActors = Object.fromEntries(CANONICAL_ACTOR_IDS.map((id, i) => [
    id, { intent: i === 0 ? { mode: 'inherit', tier: null } : { mode: 'tier', tier: i % 2 === 0 ? 'opus' : 'sonnet' } }
  ]));
  const rootBindings = {
    schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } },
    actors: { 'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-sonnet-4' }, 'evc-removed-legacy': { kind: 'inherit' } }
  };
  const userBindings = {
    schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { sonnet: { vendor: 'copilot', id: 'claude-sonnet-4' } },
    actors: { 'evc-debugger': { kind: 'model', vendor: 'copilot', id: 'missing-model' }, 'evc-scout': { kind: 'model', vendor: 'copilot', id: 'claude-opus-4' } }
  };
  const report = buildRuntimeDiagnosticsSnapshot({
    rootIdentity: 'file:///work/proj', authority: 'local-file', instanceUuid: UUID_1, generationId: 2,
    catalogRevision: 1, catalog: CATALOG.models, manifestActors, rootBindings, userBindings
  });
  assert.deepEqual(report.removedStoredActors, ['evc-removed-legacy']);
  let events = 0;
  const provider = new EvcrateSidebarTreeProvider(
    () => ({ report, rootBindings, userBindings, catalog: CATALOG, settingsPending: false }),
    { event: () => ({ dispose: () => {} }), fire: () => { events += 1; }, dispose: () => { events = -100; } }
  );
  const sections = provider.getChildren();
  assert.equal(sections[2].label, 'Agents (17)');
  const actors = provider.getChildren(sections[2]);
  assert.equal(actors.length, 17);
  assert.equal(actors.some((a) => a.actorId === 'evc-removed-legacy'), false);
  const byId = Object.fromEntries(actors.map((a) => [a.actorId, a]));
  assert.deepEqual(
    ['evc-brainstormer', 'evc-planner', 'evc-scout', 'evc-copywriter', 'evc-code-reviewer', 'evc-debugger'].map((k) => byId[k].description),
    ['Inherit [canonical.inherit]', 'Claude Sonnet 4 (copilot) [root.actor]', 'Claude Opus 4 (copilot) [user.actor]', 'Claude Opus 4 (copilot) [root.tier]', 'Claude Sonnet 4 (copilot) [user.tier]', 'Withheld [user.actor]']
  );
  assert.match(byId['evc-debugger'].tooltip, /Reason: MODEL_NOT_FOUND[\s\S]*Host observed model: unavailable/);
  assert.deepEqual(byId['evc-planner'].command, { title: 'Configure evc-planner', command: 'evcrate.configureActorModel', arguments: ['evc-planner'] });
  assert.equal(events, 0);
  provider.refresh();
  assert.equal(events, 1);
  provider.dispose();
  provider.refresh();
  assert.equal(events, -100);
});

test('RefreshController onDidCompleteRefresh: fires on new report, skips lock retry, catches throw, handles catalog await race', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-sidebar-ctrl-'));
  let controller = null;
  try {
    const projDir = join(tmp, 'proj'), storageDir = join(tmp, 'storage');
    mkdirSync(storageDir, { recursive: true });
    writePluginFixture(projDir, { 'evc-planner': { intent: { mode: 'tier', tier: 'opus' } } });
    const rootId = fsPathToLocalRootUri(projDir).rootIdentity;
    const store = new ScopedBindingStore(new MockMemento(), new MockMemento());
    const agentProvider = new CompanionAgentProvider({ event: () => ({ dispose: () => {} }), fire: () => {}, dispose: () => {} });
    const errors = [];
    let completedCount = 0, shouldThrow = false, customCatalog = null;
    const getStoredBindings = (rid) => ({ userRes: store.getUserBindings(), rootRes: rid ? store.getRootBindings(rid) : { ok: true, bindings: null } });
    controller = new RefreshController({
      instanceUuid: UUID_1, baseStorageFsPath: storageDir, debounceMs: 10,
      tryRegisterProvider: () => ({ qualified: true, authority: 'local-file', remoteAuthority: null, workspaceTrusted: true, proposalSupported: true }),
      getActiveProvider: () => agentProvider, withdrawProvider: () => agentProvider.withdrawInventory(), disposeProvider: () => agentProvider.dispose(),
      getWorkspaceFolderPaths: () => [projDir], getCustomHomePath: () => join(tmp, 'no-home'),
      getApprovedRoots: () => new Set([rootId]), getExplicitSelectedRootIdentity: () => rootId, getStoredBindings,
      queryCatalog: async (rev) => customCatalog ? customCatalog(rev) : buildCatalogSnapshot(CATALOG.models, rev),
      createUri: (fsPath) => ({ scheme: 'file', authority: '', path: fsPath, query: '', fragment: '', fsPath, toString: () => rootId }),
      watchPluginRoot: () => ({ dispose: () => {} }), onErrorMessage: (m) => errors.push(m),
      onDidCompleteRefresh: () => { completedCount += 1; if (shouldThrow) throw new Error('boom'); }
    });
    await controller.requestRefresh({ reason: 'startup', immediate: true });
    assert.equal(completedCount, 1);

    shouldThrow = true;
    await Promise.all([controller.requestRefresh({ reason: 'manual', immediate: true }), controller.requestRefresh({ reason: 'manual', immediate: true })]);
    assert.equal(completedCount, 2);
    assert.match(errors[0] ?? '', /Sidebar callback failed: boom/);
    shouldThrow = false;

    const lockDir = join(storageDir, '.authority-stage.lock');
    mkdirSync(lockDir, { recursive: true });
    await store.saveUserBindings({ schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: {} });
    await controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(completedCount, 2);
    rmSync(lockDir, { recursive: true, force: true });
    await controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(completedCount, 3);

    let releaseCatalog, notifyEntered;
    const catalogEntered = new Promise((r) => { notifyEntered = r; });
    customCatalog = (rev) => new Promise((r) => { notifyEntered(); releaseCatalog = () => r(buildCatalogSnapshot(CATALOG.models, rev)); });
    const pendingPass = controller.requestRefresh({ reason: 'catalog-changed', immediate: true, forceCatalogQuery: true });
    await catalogEntered;
    await store.saveUserBindings({ schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: { vendor: 'copilot', id: 'claude-sonnet-4' } }, actors: {} });
    releaseCatalog();
    await pendingPass;
    const raceSnap = captureCommittedSidebarSnapshot({ report: controller.lastDiagnosticsReport, currentRootIdentity: controller.currentRootIdentity, getStoredBindings, catalog: controller.catalogSnapshot });
    assert.equal(raceSnap.settingsPending, true);
    assert.equal(raceSnap.report.diagnostics.actors['evc-planner'].renderedSelector, 'Claude Opus 4 (copilot)');
    customCatalog = null;
    await controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    const syncedSnap = captureCommittedSidebarSnapshot({ report: controller.lastDiagnosticsReport, currentRootIdentity: controller.currentRootIdentity, getStoredBindings, catalog: controller.catalogSnapshot });
    assert.deepEqual([syncedSnap.settingsPending, syncedSnap.report.diagnostics.actors['evc-planner'].renderedSelector], [false, 'Claude Sonnet 4 (copilot)']);
    assert.equal(new EvcrateSidebarTreeProvider(() => syncedSnap).getChildren()[2].label, 'Agents (1)');
  } finally {
    controller?.dispose();
    rmSync(tmp, { recursive: true, force: true });
  }
});
