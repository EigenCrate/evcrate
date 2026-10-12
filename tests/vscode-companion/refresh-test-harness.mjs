import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CompanionAgentProvider } from '../../.cache/evcrate/vscode-model-bindings-dist/agent-provider.js';
import { ScopedBindingStore } from '../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js';
import { buildCatalogSnapshot } from '../../.cache/evcrate/vscode-model-bindings-dist/model-catalog.js';
import { RefreshController } from '../../.cache/evcrate/vscode-model-bindings-dist/refresh-controller.js';

export const UUID_1 = '11111111-2222-4333-8444-555555555555';
export const UUID_2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';

export class MockMemento {
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

export function writePluginFixture(rootDir, actorsConfig) {
  const pluginDir = join(rootDir, '.evcrate-vscode');
  const tplDir = join(pluginDir, 'evcrate', 'agent-templates');
  mkdirSync(tplDir, { recursive: true });
  const manifestActors = {};
  for (const [actorId, cfg] of Object.entries(actorsConfig)) {
    const content = cfg.content ?? `---\nname: ${actorId}\n---\nBody for ${actorId}`;
    const sha = cfg.overrideSha ?? createHash('sha256').update(content, 'utf8').digest('hex');
    writeFileSync(join(tplDir, `${actorId}.md`), content, 'utf8');
    manifestActors[actorId] = {
      actorId,
      sourcePath: `.claude/agents/${actorId}.md`,
      templatePath: `evcrate/agent-templates/${actorId}.md`,
      templateSha256: sha,
      referenceBase: 'agents',
      intent: cfg.intent ?? { mode: 'tier', tier: 'opus' }
    };
  }
  writeFileSync(
    join(pluginDir, 'evcrate', 'agent-intent.json'),
    JSON.stringify({ schema: 'evcrate-vscode-agent-intent-v1', pluginName: 'evc', actors: manifestActors }),
    'utf8'
  );
  return pluginDir;
}

export function createHarness(tmp, opts = {}) {
  const projDir = opts.projDir ?? join(tmp, 'proj');
  const storageDir = opts.storageDir ?? join(tmp, 'storage');
  mkdirSync(storageDir, { recursive: true });
  const globalState = new MockMemento();
  const workspaceState = new MockMemento();
  const store = new ScopedBindingStore(globalState, workspaceState);

  let emitterFired = 0;
  const provider = new CompanionAgentProvider({
    event: () => ({ dispose: () => {} }),
    fire: () => { emitterFired += 1; },
    dispose: () => {}
  });

  let workspaceTrusted = opts.workspaceTrusted ?? true;
  let remoteAuthority = opts.remoteAuthority ?? null;
  let workspaceFolders = opts.workspaceFolders ?? [projDir];
  let selectedRootIdentity = opts.selectedRootIdentity ?? null;
  let catalogModels = opts.catalogModels ?? [
    { vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4' },
    { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }
  ];
  let catalogQueryCount = 0;
  let customQueryCatalog = opts.queryCatalog ?? null;
  const errors = [];

  const controller = new RefreshController({
    instanceUuid: opts.instanceUuid ?? UUID_1,
    baseStorageFsPath: storageDir,
    debounceMs: opts.debounceMs ?? 30,
    tryRegisterProvider: () => ({
      qualified: workspaceTrusted && remoteAuthority === null,
      authority: remoteAuthority ? 'unsupported-remote' : 'local-file',
      remoteAuthority,
      workspaceTrusted,
      proposalSupported: true,
      ...(remoteAuthority ? { reason: 'UNSUPPORTED_REMOTE_AUTHORITY' } : !workspaceTrusted ? { reason: 'WORKSPACE_UNTRUSTED' } : {})
    }),
    getActiveProvider: () => (workspaceTrusted && remoteAuthority === null ? provider : null),
    withdrawProvider: () => { provider.withdrawInventory(); },
    disposeProvider: () => { provider.dispose(); },
    getWorkspaceFolderPaths: () => workspaceFolders,
    getCustomHomePath: () => join(tmp, 'nonexistent-home'),
    getApprovedRoots: () => new Set(workspaceFolders.map((p) => `file://${p}`)),
    getExplicitSelectedRootIdentity: () => selectedRootIdentity,
    getStoredBindings: (rootIdentity) => ({
      userRes: store.getUserBindings(),
      rootRes: rootIdentity ? store.getRootBindings(rootIdentity) : { ok: true, bindings: null }
    }),
    queryCatalog: async (rev) => {
      catalogQueryCount += 1;
      if (customQueryCatalog) return customQueryCatalog(rev);
      return buildCatalogSnapshot(catalogModels, rev);
    },
    createUri: (fsPath) => ({
      scheme: 'file', authority: '', path: fsPath, query: '', fragment: '', fsPath,
      toString: () => `file://${fsPath}`
    }),
    watchPluginRoot: () => ({ dispose: () => {} }),
    onErrorMessage: (msg) => { errors.push(msg); }
  });

  return {
    projDir, storageDir, store, provider, controller, errors,
    getEmitterFired: () => emitterFired,
    getCatalogQueryCount: () => catalogQueryCount,
    setWorkspaceTrusted: (v) => { workspaceTrusted = v; },
    setWorkspaceFolders: (v) => { workspaceFolders = v; },
    setSelectedRootIdentity: (v) => { selectedRootIdentity = v; },
    setCatalogModels: (v) => { catalogModels = v; },
    setCustomQueryCatalog: (fn) => { customQueryCatalog = fn; }
  };
}
