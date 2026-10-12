import Module from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const mockVsCode = {
  window: {
    showQuickPick: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined
  },
  lm: { selectChatModels: async () => [] },
  env: { remoteAuthority: undefined }
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = (request, ...rest) =>
  request === 'vscode' ? 'vscode' : origResolve.apply(this, [request, ...rest]);
const origLoad = Module._load;
Module._load = (request, ...rest) =>
  request === 'vscode' ? mockVsCode : origLoad.apply(this, [request, ...rest]);

const {
  handleConfigureAgentModels,
  handleConfigureActorModel
} = await import('../../.cache/evcrate/vscode-model-bindings-dist/configuration-commands.js');
const { handleClearModelBindings } = await import('../../.cache/evcrate/vscode-model-bindings-dist/clear-commands.js');
const { showModelBindingsDiagnostics } = await import('../../.cache/evcrate/vscode-model-bindings-dist/diagnostics-display.js');

class MockMemento {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  get(key, defaultValue) {
    return this.map.has(key) ? this.map.get(key) : defaultValue;
  }
  async update(key, value) {
    if (value === undefined) this.map.delete(key);
    else this.map.set(key, value);
  }
  keys() {
    return [...this.map.keys()];
  }
}

test('handleConfigureAgentModels preserves state on cancellation and aborts on root change', async () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const context = { globalState, workspaceState };
  let refreshCalled = false;

  mockVsCode.window.showQuickPick = async () => undefined;
  const cancelled = await handleConfigureAgentModels(
    context,
    () => 'file:///work/proj',
    async () => { refreshCalled = true; return true; }
  );
  assert.equal(cancelled, false);
  assert.equal(refreshCalled, false);

  mockVsCode.lm.selectChatModels = async () => [
    { vendor: 'copilot', id: 'm1', name: 'M1', family: 'f', version: '1', maxInputTokens: 1000 }
  ];
  let curRoot = 'file:///work/proj';
  mockVsCode.window.showQuickPick = async (items) => {
    curRoot = 'file:///work/other';
    return items[0];
  };
  const rootChanged = await handleConfigureAgentModels(
    context,
    () => curRoot,
    async () => { refreshCalled = true; return true; }
  );
  assert.equal(rootChanged, false);
});

test('handleConfigureAgentModels and handleConfigureActorModel bind model and inherit', async () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const context = { globalState, workspaceState };
  let refreshCount = 0;

  mockVsCode.lm.selectChatModels = async () => [
    { vendor: 'copilot', id: 'claude-3-opus', name: 'Claude 3 Opus', family: 'claude-3', version: '1', maxInputTokens: 128000 }
  ];

  let step = 0;
  mockVsCode.window.showQuickPick = async (items) => {
    step++;
    if (step === 1) return items[0];
    if (step === 2) return items[0];
    if (step === 3) return items[0];
    return undefined;
  };
  const tierSuccess = await handleConfigureAgentModels(
    context,
    () => 'file:///work/proj',
    async () => { refreshCount++; return true; }
  );
  assert.equal(tierSuccess, true);
  assert.equal(refreshCount, 1);

  step = 0;
  mockVsCode.window.showQuickPick = async (items) => {
    step++;
    if (step === 1) return items[0];
    if (step === 2) return items[0];
    if (step === 3) return { label: 'Explicit inherit', kind: 'inherit' };
    return undefined;
  };
  const actorSuccess = await handleConfigureActorModel(
    context,
    () => 'file:///work/proj',
    () => null,
    async () => { refreshCount++; return true; }
  );
  assert.equal(actorSuccess, true);
  assert.equal(refreshCount, 2);
});

test('handleClearModelBindings clears target and showModelBindingsDiagnostics surfaces corrupt state', async () => {
  const globalState = new MockMemento({
    'evcrate.userBindings.v1': { corrupt: true }
  });
  const workspaceState = new MockMemento();
  const context = { globalState, workspaceState };

  let shownItems = [];
  mockVsCode.window.showQuickPick = async (items) => {
    shownItems = items;
    return undefined;
  };

  await showModelBindingsDiagnostics(
    context,
    'file:///work/proj',
    null,
    null,
    '11111111-2222-4333-8444-555555555555',
    1,
    null
  );
  assert.ok(shownItems.some((it) => it.label.includes('CORRUPT USER BINDINGS')));

  // Populate root bindings so clear has something to clear
  const store = new (await import('../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js')).ScopedBindingStore(globalState, workspaceState);
  await store.saveRootBindings('file:///work/proj', {
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: { opus: { vendor: 'copilot', id: 'm1' } },
    actors: {}
  });

  let step = 0;
  mockVsCode.window.showQuickPick = async (items) => {
    step++;
    if (step === 1) return items[0];
    if (step === 2) return items[0];
    if (step === 3) return { label: 'Yes, clear all bindings' };
    return undefined;
  };
  let refreshed = false;
  const cleared = await handleClearModelBindings(
    context,
    () => 'file:///work/proj',
    () => null,
    async () => { refreshed = true; return true; }
  );
  assert.equal(cleared, true);
  assert.equal(refreshed, true);
});
