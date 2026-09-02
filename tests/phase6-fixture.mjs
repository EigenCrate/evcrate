import '../dist/adapters/index.js';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJsonBytes } from '../dist/filesystem/hashing.js';
import { resolveInvocationContext } from '../dist/context/invocation-context.js';
import { resourceDocumentBytes } from '../dist/registry/store.js';
import { scanCanonicalResources } from '../dist/registry/scanner.js';

export const RESOURCE_ROOTS = Object.freeze({
  agent: 'agents', command: 'commands', hook: 'hooks', skill: 'skills', workflow: 'workflows'
});
export const TARGETS = Object.freeze(['claude', 'codex', 'gemini', 'antigravity', 'pi', 'omp', 'copilot']);

function directory(path, mode = 0o755) {
  mkdirSync(path, { recursive: true, mode });
  chmodSync(path, mode);
  return path;
}
function write(path, text, mode = 0o644) {
  writeFileSync(path, text, { mode });
  chmodSync(path, mode);
}
function manifest(id) {
  const root = `.${id}`;
  return {
    schema_version: 2, name: id, adapter: null, adapter_sources: [], output_root: root,
    additional_roots: [], project_docs: [], patches: [],
    home_policy: { bindings: { [root]: root }, preserve_paths: {}, promotion_order: TARGETS.indexOf(id) + 1 }
  };
}
function createManifests(root) {
  const targets = {};
  const targetRoot = directory(join(root, '.evcrate', 'targets'));
  for (const id of TARGETS) {
    const path = join(targetRoot, id, 'manifest.json');
    directory(join(targetRoot, id));
    write(path, canonicalJsonBytes(manifest(id)));
    targets[id] = `${id}/manifest.json`;
  }
  write(join(targetRoot, 'manifest.json'), canonicalJsonBytes({ schema_version: 2, resource_roots: RESOURCE_ROOTS, targets }));
}
function createCanonical(root) {
  const canonical = directory(join(root, '.evcrate', 'source', '.claude'));
  for (const resourceRoot of Object.values(RESOURCE_ROOTS)) directory(join(canonical, resourceRoot));
  write(join(canonical, 'agents', 'alpha.md'), '# Alpha agent\n');
  write(join(canonical, 'agents', 'beta.md'), '# Beta agent\n');
  write(join(canonical, 'workflows', 'release.md'), '# Release workflow\n');
  directory(join(canonical, 'commands', 'nested'));
  write(join(canonical, 'commands', 'nested', 'deploy.md'), '# Deploy command\n');
  directory(join(canonical, 'skills', 'kit'));
  write(join(canonical, 'skills', 'kit', 'SKILL.md'), '# Kit skill\n');
  write(join(canonical, 'skills', 'kit', 'README.md'), 'supporting content\n');
  write(join(canonical, 'hooks', 'notify.sh'), '#!/bin/sh\nprintf notify\n', 0o755);
  write(join(canonical, 'hooks', 'notes.txt'), 'hook notes\n');
  write(join(canonical, 'hooks', '.env.example'), 'ignored\n');
  return canonical;
}
export function createPhase6Fixture(prefix = 'evcrate-phase6-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const canonical = createCanonical(root);
  createManifests(root);
  const resources = scanCanonicalResources(canonical, RESOURCE_ROOTS);
  const registryPath = join(root, '.evcrate', 'registry.json');
  write(registryPath, resourceDocumentBytes({ schema_version: 1, revision: 1, resources }), 0o600);
  return Object.freeze({
    root, canonical, registryPath, resources, source: join(root, 'incoming', 'import.md'),
    home: join(root, 'home'), state: join(root, 'state'),
    context(options = {}) {
      return resolveInvocationContext({
        packageRoot: root, cwd: root, projectRoot: root, home: join(root, 'home'), stateHome: join(root, 'state'),
        targets: ['claude'], ...options
      });
    }
  });
}
export function writeSource(fixture, name, content, mode = 0o644) {
  const path = join(fixture.root, 'incoming', name);
  directory(join(path, '..'));
  write(path, content, mode);
  return path;
}
export function closePhase6Fixture(fixture) { rmSync(fixture.root, { recursive: true, force: true }); }
