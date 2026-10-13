import Module from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPANION_MEDIA_HELPER_REL_PATH, REQUIRED_COMPANION_ICON_ARCHIVE_PATH, REQUIRED_COMPANION_ICON_SOURCE_PATH,
  assertCompanionMediaEntries, assertRecordedCompanionMediaInputs, listCompanionSvgMedia
} from '../../scripts/vscode-companion-media.mjs';
import { parseZipEntries } from '../../scripts/verify-vscode-companion.mjs';

const registeredCommands = new Map();
const registeredTrees = [];
const shownErrors = [];
const mockVsCode = {
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  TreeItem: class { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } },
  EventEmitter: class {
    constructor() { this.listeners = []; this.event = (fn) => { this.listeners.push(fn); return { dispose: () => {} }; }; }
    fire(d) { for (const fn of this.listeners) fn(d); }
    dispose() { this.listeners = []; }
  },
  commands: {
    registerCommand: (id, cb) => { registeredCommands.set(id, cb); return { dispose: () => registeredCommands.delete(id) }; }
  },
  window: {
    showQuickPick: async () => undefined, showInformationMessage: async () => undefined, showWarningMessage: async () => undefined,
    showErrorMessage: async (m) => { shownErrors.push(m); return undefined; },
    registerTreeDataProvider: (viewId, provider) => {
      const entry = { viewId, provider, disposed: false };
      registeredTrees.push(entry);
      return { dispose: () => { entry.disposed = true; } };
    }
  },
  lm: { selectChatModels: async () => [], onDidChangeChatModels: () => ({ dispose: () => {} }) },
  workspace: { isTrusted: true, workspaceFolders: [], onDidGrantWorkspaceTrust: () => ({ dispose: () => {} }), onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }) },
  Uri: { file: (fsPath) => ({ scheme: 'file', authority: '', path: fsPath, fsPath, toString: () => `file://${fsPath}` }) },
  env: { remoteAuthority: undefined, remoteName: undefined }
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = (req, ...rest) => req === 'vscode' ? 'vscode' : origResolve.apply(this, [req, ...rest]);
const origLoad = Module._load;
Module._load = (req, ...rest) => req === 'vscode' ? mockVsCode : origLoad.apply(this, [req, ...rest]);

const { registerAllCommands } = await import('../../.cache/evcrate/vscode-model-bindings-dist/command-registration.js');
const { handleConfigureAgentModels, handleConfigureActorModel } = await import('../../.cache/evcrate/vscode-model-bindings-dist/configuration-commands.js');
const { ScopedBindingStore } = await import('../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js');
const { activate, deactivate } = await import('../../.cache/evcrate/vscode-model-bindings-dist/extension.js');
const { MockMemento, writePluginFixture } = await import('./refresh-test-harness.mjs');

test('targeted tier/actor commands, palette flow, invalid argument rejection, and mid-flight root/actor guards', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-sidebar-cmd-'));
  try {
    let pluginPath = writePluginFixture(tmp, { 'evc-planner': { intent: { mode: 'tier', tier: 'opus' } }, 'evc-scout': { intent: { mode: 'tier', tier: 'haiku' } } });
    let curRoot = 'file:///work/proj', refreshCalls = 0;
    const context = { globalState: new MockMemento(), workspaceState: new MockMemento(), subscriptions: [] };
    const store = new ScopedBindingStore(context.globalState, context.workspaceState);
    await store.saveUserBindings({ schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: {}, actors: { 'evc-scout': { kind: 'inherit' } } });
    mockVsCode.lm.selectChatModels = async () => [
      { vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4', family: 'claude', version: '1', maxInputTokens: 1000 },
      { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4', family: 'claude', version: '1', maxInputTokens: 1000 }
    ];
    registerAllCommands(context, {
      getCurrentRootIdentity: () => curRoot, getPluginFsPath: () => pluginPath,
      refreshActiveGeneration: async () => { refreshCalls += 1; return true; }, queryAndRefresh: async () => { refreshCalls += 1; return true; },
      getActiveProvider: () => null, getInstanceUuid: () => '11111111-2222-4333-8444-555555555555',
      getGenerationId: () => 1, getCatalogSnapshot: () => null, getLatestDiagnosticsReport: () => null, ensureCatalogSubscribed: () => {}
    });

    // Reject invalid command arguments without writes or refreshes
    const beforeRev = store.getUserBindings().bindings.revision;
    for (const badTier of [null, {}, 42, 'invalid-tier', '']) assert.equal(await registeredCommands.get('evcrate.configureAgentModels')(badTier), false);
    for (const badActor of [null, {}, 42, '../bad-actor', 'a'.repeat(65), 'evc-not-in-manifest']) assert.equal(await registeredCommands.get('evcrate.configureActorModel')(badActor), false);
    assert.equal(store.getUserBindings().bindings.revision, beforeRev);
    assert.equal(refreshCalls, 0);
    assert.ok(shownErrors.length >= 6);

    // Preselected 'all' from empty tiers writes all 3 tiers and preserves actors; individual tiers skip tier picker
    let pickModelId = 'claude-opus-4';
    const pickedPlaceholders = [];
    mockVsCode.window.showQuickPick = async (items, opts) => {
      pickedPlaceholders.push(opts?.placeHolder ?? '');
      return items.find((i) => i.scope === 'user') ?? items.find((i) => i.model?.id === pickModelId) ?? items[0];
    };
    assert.equal(await registeredCommands.get('evcrate.configureAgentModels')('all'), true);
    assert.equal(pickedPlaceholders.some((p) => p.includes('Select agent group or tier')), false);
    const afterAll = store.getUserBindings().bindings;
    const opusSel = { vendor: 'copilot', id: 'claude-opus-4' };
    assert.deepEqual(afterAll.tiers, { opus: opusSel, sonnet: opusSel, haiku: opusSel });
    assert.deepEqual(afterAll.actors['evc-scout'], { kind: 'inherit' });
    pickModelId = 'claude-sonnet-4';
    for (const tier of ['opus', 'sonnet', 'haiku']) {
      pickedPlaceholders.length = 0;
      assert.equal(await (tier === 'opus' ? handleConfigureAgentModels(context, () => curRoot, async () => { refreshCalls += 1; return true; }, tier) : registeredCommands.get('evcrate.configureAgentModels')(tier)), true);
      assert.equal(pickedPlaceholders.some((p) => p.includes('Select agent group or tier')), false);
    }
    assert.equal(store.getUserBindings().bindings.tiers.opus.id, 'claude-sonnet-4');
    assert.equal(refreshCalls, 4);

    // Preselected actor ('evc-planner') skips actor picker; undefined arg keeps full Command Palette picker sequence for both commands
    pickedPlaceholders.length = 0;
    assert.equal(await registeredCommands.get('evcrate.configureActorModel')('evc-planner'), true);
    assert.equal(pickedPlaceholders.some((p) => p.includes('Select actor to configure')), false);
    assert.deepEqual(store.getUserBindings().bindings.actors['evc-planner'], { kind: 'model', vendor: 'copilot', id: 'claude-sonnet-4' });
    for (const [cmd, expectedPrompt] of [['evcrate.configureAgentModels', 'Select agent group or tier'], ['evcrate.configureActorModel', 'Select actor to configure']]) {
      pickedPlaceholders.length = 0;
      assert.equal(await registeredCommands.get(cmd)(undefined), true);
      assert.equal(pickedPlaceholders.some((p) => p.includes(expectedPrompt)), true);
    }

    // Mid-flight actor removal (user scope) or root switch (root scope) aborts with zero writes/refreshes
    const revBeforeAbort = store.getUserBindings().bindings.revision, callsBeforeAbort = refreshCalls;
    mockVsCode.window.showQuickPick = async (items, opts) => {
      if ((opts?.placeHolder ?? '').includes('override kind')) {
        writePluginFixture(tmp, { 'evc-scout': { intent: { mode: 'tier', tier: 'haiku' } } });
        return { label: 'Explicit inherit', kind: 'inherit' };
      }
      return items.find((i) => i.scope === 'user') ?? items[0];
    };
    assert.equal(await handleConfigureActorModel(context, () => curRoot, () => pluginPath, async () => { refreshCalls += 1; return true; }, 'evc-planner'), false);
    assert.deepEqual([store.getUserBindings().bindings.revision, refreshCalls], [revBeforeAbort, callsBeforeAbort]);

    pluginPath = writePluginFixture(tmp, { 'evc-planner': { intent: { mode: 'tier', tier: 'opus' } } });
    mockVsCode.window.showQuickPick = async (items, opts) => {
      if ((opts?.placeHolder ?? '').includes('override kind')) {
        curRoot = 'file:///work/switched';
        return { label: 'Explicit inherit', kind: 'inherit' };
      }
      return items.find((i) => i.scope === 'root') ?? items[0];
    };
    assert.equal(await handleConfigureActorModel(context, () => curRoot, () => pluginPath, async () => { refreshCalls += 1; return true; }, 'evc-planner'), false);
    assert.deepEqual([store.getUserBindings().bindings.revision, store.getRootBindings('file:///work/proj').bindings, store.getRootBindings('file:///work/switched').bindings, refreshCalls], [revBeforeAbort, null, null, callsBeforeAbort]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('extension activate/deactivate registers evcrate.modelBindingsView and companion media helpers enforce SVG safety', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-media-test-'));
  try {
    registeredTrees.length = 0;
    const ctx = {
      storageUri: { fsPath: join(tmp, 'storage') }, globalStorageUri: { fsPath: join(tmp, 'gstorage') },
      globalState: new MockMemento(), workspaceState: new MockMemento(), subscriptions: []
    };
    activate(ctx);
    assert.deepEqual([registeredTrees.length, registeredTrees[0].viewId], [1, 'evcrate.modelBindingsView']);
    for (const d of ctx.subscriptions.splice(0)) d.dispose();
    deactivate();
    assert.equal(registeredTrees[0].disposed, true);
    activate(ctx);
    assert.deepEqual([registeredTrees.length, registeredTrees[1].disposed], [2, false]);
    for (const d of ctx.subscriptions.splice(0)) d.dispose();
    deactivate();
    assert.equal(registeredTrees.every((t) => t.disposed), true);

    // Real repository media inventory & VSIX/receipt verification
    const repoMedia = listCompanionSvgMedia(process.cwd());
    const iconRecord = repoMedia.find((r) => r.archivePath === REQUIRED_COMPANION_ICON_ARCHIVE_PATH);
    assert.ok(iconRecord);
    const svgText = iconRecord.data.toString('utf8');
    assert.match(svgText, /<svg[^>]*viewBox=/);
    assert.match(svgText, /currentColor/);
    assertCompanionMediaEntries(new Map([[REQUIRED_COMPANION_ICON_ARCHIVE_PATH, { data: iconRecord.data }]]));
    assert.throws(() => assertCompanionMediaEntries(new Map()), /VSIX missing required entry/);

    const companionDir = join(process.cwd(), '.evcrate/targets/vscode/files/evcrate/companion');
    const receipt = JSON.parse(readFileSync(join(companionDir, 'source-receipt.json'), 'utf8'));
    const desc = JSON.parse(readFileSync(join(companionDir, 'package.json'), 'utf8'));
    assertRecordedCompanionMediaInputs(process.cwd(), receipt.inputs);
    const vsixEntries = parseZipEntries(readFileSync(join(companionDir, `evcrate-model-bindings-${desc.version}.vsix`)));
    assertCompanionMediaEntries(vsixEntries);
    assert.deepEqual(vsixEntries.get(REQUIRED_COMPANION_ICON_ARCHIVE_PATH).data, iconRecord.data);
    assert.match(vsixEntries.get('[Content_Types].xml').data.toString('utf8'), /Extension="svg"\s+ContentType="image\/svg\+xml"/);

    // Isolated temp media mutation checks (missing icon, unsafe name, nested dir, unrecorded input)
    assert.throws(() => listCompanionSvgMedia(tmp), /Required companion media file missing/);
    const mediaDir = join(tmp, 'extensions/vscode-model-bindings/media');
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, 'evcrate-icon.svg'), iconRecord.data);
    assert.equal(listCompanionSvgMedia(tmp).length, 1);
    assert.throws(() => assertRecordedCompanionMediaInputs(tmp, {}), /Unrecorded companion source file/);
    assert.throws(() => assertRecordedCompanionMediaInputs(tmp, { [COMPANION_MEDIA_HELPER_REL_PATH]: 'a' }), /Unrecorded companion media/);
    assertRecordedCompanionMediaInputs(tmp, { [COMPANION_MEDIA_HELPER_REL_PATH]: 'a', [REQUIRED_COMPANION_ICON_SOURCE_PATH]: 'b' });
    writeFileSync(join(mediaDir, 'empty.svg'), '');
    assert.throws(() => listCompanionSvgMedia(tmp), /must not be empty/);
    rmSync(join(mediaDir, 'empty.svg'));
    writeFileSync(join(mediaDir, 'bad name.svg'), '<svg/>');
    assert.throws(() => listCompanionSvgMedia(tmp), /Unsafe or unexpected companion media filename/);
    rmSync(join(mediaDir, 'bad name.svg'));
    mkdirSync(join(mediaDir, 'nested'));
    assert.throws(() => listCompanionSvgMedia(tmp), /Nested directories forbidden/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
