import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoredBindings,
  createEmptyBindings,
  ScopedBindingStore
} from '../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js';

class MockMemento {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  get(key, defaultValue) {
    return this.map.has(key) ? this.map.get(key) : defaultValue;
  }
  async update(key, value) {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
  }
  keys() {
    return [...this.map.keys()];
  }
}

test('parseStoredBindings handles empty, valid, and corrupt bindings', () => {
  const empty = parseStoredBindings(undefined);
  assert.equal(empty.ok, true);
  assert.equal(empty.bindings, null);

  const valid = parseStoredBindings({
    schema: 'evcrate-vscode-bindings-v1',
    revision: 2,
    tiers: { opus: { vendor: 'copilot', id: 'claude-3-opus' } },
    actors: { 'evc-planner': { kind: 'inherit' } }
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.bindings?.revision, 2);
  assert.equal(valid.bindings?.tiers.opus?.vendor, 'copilot');

  const corrupt = parseStoredBindings({ schema: 'invalid-schema', revision: 1, tiers: {}, actors: {} });
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.error.code, 'SCHEMA_UNSUPPORTED');
});

test('ScopedBindingStore persists and increments revisions', async () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const store = new ScopedBindingStore(globalState, workspaceState);

  const emptyUser = store.getUserBindings();
  assert.equal(emptyUser.ok, true);
  assert.equal(emptyUser.bindings, null);

  const toSave = {
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: { opus: { vendor: 'copilot', id: 'model-a' } },
    actors: {}
  };
  const saved = await store.saveUserBindings(toSave);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.tiers.opus, { vendor: 'copilot', id: 'model-a' });

  // Next update auto-increments revision
  const saved2 = await store.saveUserBindings({
    ...saved,
    tiers: { ...saved.tiers, sonnet: { vendor: 'copilot', id: 'model-b' } }
  });
  assert.equal(saved2.revision, 2);

  // Optimistic concurrency conflict check
  await assert.rejects(
    () => store.saveUserBindings(saved2, 1),
    (err) => err.code === 'CONTRACT_INVALID'
  );
});

test('ScopedBindingStore partitions root bindings by rootIdentity and isolates roots', async () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const store = new ScopedBindingStore(globalState, workspaceState);

  const rootA = 'file:///workspace/project-a';
  const rootB = 'file:///workspace/project-b';

  await store.saveRootBindings(rootA, {
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: { haiku: { vendor: 'copilot', id: 'haiku-a' } },
    actors: {}
  });

  await store.saveRootBindings(rootB, {
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: { haiku: { vendor: 'copilot', id: 'haiku-b' } },
    actors: {}
  });

  const loadA = store.getRootBindings(rootA);
  const loadB = store.getRootBindings(rootB);
  assert.equal(loadA.ok && loadA.bindings?.tiers.haiku?.id, 'haiku-a');
  assert.equal(loadB.ok && loadB.bindings?.tiers.haiku?.id, 'haiku-b');
});

test('ScopedBindingStore rejects unsupported remote authority without fallback', () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  assert.throws(
    () => new ScopedBindingStore(globalState, workspaceState, 'ssh-remote+server'),
    (err) => err.code === 'UNSUPPORTED_REMOTE_AUTHORITY'
  );
});

test('ScopedBindingStore clear operations preserve unrelated bindings', async () => {
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const store = new ScopedBindingStore(globalState, workspaceState);

  await store.saveUserBindings({
    schema: 'evcrate-vscode-bindings-v1',
    revision: 1,
    tiers: {
      opus: { vendor: 'copilot', id: 'opus-id' },
      sonnet: { vendor: 'copilot', id: 'sonnet-id' }
    },
    actors: {
      'evc-planner': { kind: 'inherit' },
      'evc-tester': { kind: 'model', vendor: 'copilot', id: 'tester-id' }
    }
  });

  // Clear single tier
  await store.clearUserBindings({ tier: 'opus' });
  const afterTierClear = store.getUserBindings().bindings;
  assert.equal(afterTierClear?.tiers.opus, undefined);
  assert.notEqual(afterTierClear?.tiers.sonnet, undefined);
  assert.notEqual(afterTierClear?.actors['evc-planner'], undefined);

  // Clear single actor
  await store.clearUserBindings({ actor: 'evc-planner' });
  const afterActorClear = store.getUserBindings().bindings;
  assert.equal(afterActorClear?.actors['evc-planner'], undefined);
  assert.notEqual(afterActorClear?.actors['evc-tester'], undefined);

  // Clear all
  await store.clearUserBindings();
  assert.equal(store.getUserBindings().bindings, null);
});

test('ScopedBindingStore preserves corrupt state and refuses to overwrite', async () => {
  const globalState = new MockMemento({
    'evcrate.userBindings.v1': { corrupt: true }
  });
  const workspaceState = new MockMemento();
  const store = new ScopedBindingStore(globalState, workspaceState);

  const res = store.getUserBindings();
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'SCHEMA_UNSUPPORTED');

  await assert.rejects(
    () => store.saveUserBindings(createEmptyBindings()),
    (err) => err.code === 'SCHEMA_UNSUPPORTED'
  );
});
