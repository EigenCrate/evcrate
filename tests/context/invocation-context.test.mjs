import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHomeRoot, resolveStateRoot, resolveInvocationContext, loadTargetRegistry,
  loadTargetManifest, validateManifestSet, assertNoDescriptorOverlap,
  canonicalProjectRoot, projectIdentity, resolvePublicationProjectContext, loadSelectedTargets
} from '../../dist/index.js';

const packageRoot = new URL('../..', import.meta.url).pathname.replace(/\/$/u, '');

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'evcrate-cli-context-'));
}

test('resolves explicit HOME/state/project values and target roots independently', () => {
  const root = temporaryDirectory();
  const home = join(root, 'home');
  const state = join(root, 'state');
  const project = join(root, 'project');
  mkdirSync(home); mkdirSync(state); mkdirSync(project);
  const context = resolveInvocationContext({
    packageRoot, cwd: packageRoot, home, stateHome: state, projectRoot: project,
    projectId: 'project-1', targets: ['omp', 'copilot']
  });
  assert.deepEqual(context.selectedTargetIds, ['copilot', 'omp']);
  assert.equal(context.canonicalHarnessRoot, join(packageRoot, '.evcrate/source/.claude'));
  assert.equal(context.controllerRoot, join(packageRoot, '.evcrate/source/.evcrate/bin'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'omp').generatedRoots[0], join(packageRoot, '.evcrate/source/.omp'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'copilot').generatedRoots[0], join(packageRoot, '.evcrate/source/.copilot'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'omp').homeBindings[0].homeRoot, join(home, '.omp'));
  assert.equal(context.selectedTargets.find(({ id }) => id === 'copilot').homeBindings[0].homeRoot, join(home, '.copilot'));
  assert.equal(context.stateRoot, state);
  assert.equal(context.projectRoot, project);
  assert.equal(context.projectId, 'project-1');
  const registry = loadTargetRegistry(join(packageRoot, '.evcrate', 'targets', 'manifest.json'));
  assert.deepEqual(
    loadSelectedTargets(registry, ['copilot', 'pi', 'claude', 'codex']).map(({ id }) => id),
    ['claude', 'codex', 'copilot', 'pi']
  );
});

test('applies HOME and state precedence without inventing state suffixes for overrides', () => {
  const root = temporaryDirectory();
  const home = join(root, 'home');
  const envHome = join(root, 'env-home');
  const stateBase = join(root, 'state-base');
  const xdgBase = join(root, 'xdg-base');
  mkdirSync(home); mkdirSync(envHome); mkdirSync(stateBase); mkdirSync(xdgBase);
  const env = { EVCRATE_HOME: envHome, EVCRATE_STATE_HOME: stateBase, XDG_STATE_HOME: xdgBase };
  assert.equal(resolveHomeRoot({ home, env }), home);
  assert.equal(resolveStateRoot({ home, env }), join(stateBase, 'evcrate'));
  assert.equal(resolveStateRoot({ home, env: { XDG_STATE_HOME: xdgBase } }), join(xdgBase, 'evcrate'));
  assert.equal(resolveStateRoot({ home, env: {} }), join(home, '.local/state/evcrate'));
  assert.equal(resolveStateRoot({ home, stateHome: stateBase, env }), stateBase);
});

test('rejects unknown targets, traversal, and symlinked context roots', () => {
  const root = temporaryDirectory();
  const link = join(root, 'home-link');
  const actual = join(root, 'actual-home');
  mkdirSync(actual); symlinkSync(actual, link, 'dir');
  assert.throws(() => resolveInvocationContext({ packageRoot, cwd: packageRoot, home: link }), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => resolveInvocationContext({ packageRoot, cwd: packageRoot, targets: ['unknown'] }), (error) => error.code === 'CAPABILITY_UNSUPPORTED');
  const registryPath = join(root, 'manifest.json');
  writeFileSync(registryPath, JSON.stringify({ schema_version: 2, targets: { omp: '../escape/manifest.json' } }));
  assert.throws(() => loadTargetRegistry(registryPath), (error) => error.code === 'PROTOCOL_INVALID');
});

test('exposes immutable manifest-derived project directory and document descriptors in declaration order', () => {
  const root = temporaryDirectory();
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(home); mkdirSync(project);
  const context = resolveInvocationContext({
    packageRoot, cwd: packageRoot, home, projectRoot: project,
    targets: ['codex', 'gemini']
  });

  // Check Codex descriptors
  const codex = context.selectedTargets.find(({ id }) => id === 'codex');
  assert.ok(codex);
  assert.equal(codex.projectDirectoryDescriptors.length, 2);
  assert.equal(codex.projectDirectoryDescriptors[0].kind, 'directory');
  assert.equal(codex.projectDirectoryDescriptors[0].targetId, 'codex');
  assert.equal(codex.projectDirectoryDescriptors[0].relativeDestination, '.codex');
  assert.equal(codex.projectDirectoryDescriptors[0].declarationIndex, 0);
  assert.equal(codex.projectDirectoryDescriptors[0].localSource, join(packageRoot, '.evcrate/source/.codex'));
  assert.equal(codex.projectDirectoryDescriptors[0].generatedSource, join(packageRoot, '.evcrate/source/.codex'));

  assert.equal(codex.projectDirectoryDescriptors[1].kind, 'directory');
  assert.equal(codex.projectDirectoryDescriptors[1].targetId, 'codex');
  assert.equal(codex.projectDirectoryDescriptors[1].relativeDestination, '.agents');
  assert.equal(codex.projectDirectoryDescriptors[1].declarationIndex, 1);
  assert.equal(codex.projectDirectoryDescriptors[1].localSource, join(packageRoot, '.evcrate/source/.agents'));

  assert.equal(codex.projectDocumentDescriptors.length, 1);
  assert.equal(codex.projectDocumentDescriptors[0].kind, 'document');
  assert.equal(codex.projectDocumentDescriptors[0].targetId, 'codex');
  assert.equal(codex.projectDocumentDescriptors[0].relativeDestination, 'AGENTS.md');
  assert.equal(codex.projectDocumentDescriptors[0].declarationIndex, 0);
  assert.equal(codex.projectDocumentDescriptors[0].localSource, join(packageRoot, '.evcrate/source/AGENTS.md'));

  assert.equal(codex.projectDescriptors.length, 3);
  assert.deepEqual(codex.projectDescriptors.map((d) => d.relativeDestination), ['.codex', '.agents', 'AGENTS.md']);
  assert.deepEqual(codex.projectDirectoryBindings, codex.projectDirectoryDescriptors);
  assert.deepEqual(codex.projectDocumentBindings, codex.projectDocumentDescriptors);
  assert.ok(Object.isFrozen(codex.projectDirectoryDescriptors));
  assert.ok(Object.isFrozen(codex.projectDocumentDescriptors));
  assert.ok(Object.isFrozen(codex.projectDescriptors));

  // Check Gemini descriptors
  const gemini = context.selectedTargets.find(({ id }) => id === 'gemini');
  assert.ok(gemini);
  assert.equal(gemini.projectDirectoryDescriptors.length, 1);
  assert.equal(gemini.projectDirectoryDescriptors[0].relativeDestination, '.gemini');
  assert.equal(gemini.projectDocumentDescriptors.length, 1);
  assert.equal(gemini.projectDocumentDescriptors[0].relativeDestination, 'GEMINI.md');
  assert.equal(gemini.projectDocumentDescriptors[0].kind, 'document');

  // Check InvocationContext top-level aggregate descriptors
  assert.equal(context.projectDirectoryDescriptors.length, 3);
  assert.equal(context.projectDocumentDescriptors.length, 2);
  assert.equal(context.projectDescriptors.length, 5);
  assert.ok(Object.isFrozen(context.projectDirectoryDescriptors));
  assert.ok(Object.isFrozen(context.projectDocumentDescriptors));
  assert.ok(Object.isFrozen(context.projectDescriptors));
});

test('rejects intra-manifest and cross-target directory overlap, document collisions, and root/doc collisions', () => {
  const root = temporaryDirectory();
  const dir = join(root, 'manifests');
  mkdirSync(dir, { recursive: true });

  // Intra-target overlapping output_roots
  const manifestSelfOverlap = join(dir, 'self-overlap.json');
  writeFileSync(manifestSelfOverlap, JSON.stringify({
    schema_version: 2, name: 'claude', adapter: null, adapter_sources: [],
    output_roots: ['dir', 'dir/nested'], project_docs: [], owned_paths: [], patches: [],
    home_policy: { bindings: { dir: 'dir-home', 'dir/nested': 'nested-home' }, preserve_paths: {}, promotion_order: 10 }
  }));
  assert.throws(() => loadTargetManifest(manifestSelfOverlap), (error) => error.code === 'PROTOCOL_INVALID');

  // Intra-target project_doc overlapping output_root
  const manifestDocOverlap = join(dir, 'doc-overlap.json');
  writeFileSync(manifestDocOverlap, JSON.stringify({
    schema_version: 2, name: 'claude', adapter: null, adapter_sources: [],
    output_roots: ['mydoc'], project_docs: ['mydoc'], owned_paths: [], patches: [],
    home_policy: { bindings: { mydoc: 'mydoc-home' }, preserve_paths: {}, promotion_order: 10 }
  }));
  assert.throws(() => loadTargetManifest(manifestDocOverlap), (error) => error.code === 'PROTOCOL_INVALID');

  // Cross-target document collision
  const targetA = {
    id: 'claude', name: 'claude', manifestPath: 'm1', adapter: null, adapterSources: [],
    outputRoots: ['.claude'], ownedPaths: [], patches: [], projectDocs: ['SHARED.md'],
    homePolicy: { bindings: { '.claude': '.claude' }, preservePaths: {}, promotionOrder: 10, rejectUnmanagedCollisions: false, publicationRules: [] },
    sourceRoot: root, overlayRoot: null, sharedJson: null
  };
  const targetB = {
    id: 'codex', name: 'codex', manifestPath: 'm2', adapter: null, adapterSources: [],
    outputRoots: ['.codex'], ownedPaths: [], patches: [], projectDocs: ['SHARED.md'],
    homePolicy: { bindings: { '.codex': '.codex' }, preservePaths: {}, promotionOrder: 20, rejectUnmanagedCollisions: false, publicationRules: [] },
    sourceRoot: root, overlayRoot: null, sharedJson: null
  };
  assert.throws(() => validateManifestSet([targetA, targetB]), (error) => error.code === 'PROTOCOL_INVALID');

  // Cross-target root/doc collision (target A outputRoot matches target B projectDoc)
  const targetC = {
    id: 'gemini', name: 'gemini', manifestPath: 'm3', adapter: null, adapterSources: [],
    outputRoots: ['SHARED_DOC.md'], ownedPaths: [], patches: [], projectDocs: [],
    homePolicy: { bindings: { 'SHARED_DOC.md': 'SHARED_DOC.md' }, preservePaths: {}, promotionOrder: 30, rejectUnmanagedCollisions: false, publicationRules: [] },
    sourceRoot: root, overlayRoot: null, sharedJson: null
  };
  const targetD = {
    id: 'omp', name: 'omp', manifestPath: 'm4', adapter: null, adapterSources: [],
    outputRoots: ['.omp'], ownedPaths: [], patches: [], projectDocs: ['SHARED_DOC.md'],
    homePolicy: { bindings: { '.omp': '.omp' }, preservePaths: {}, promotionOrder: 40, rejectUnmanagedCollisions: false, publicationRules: [] },
    sourceRoot: root, overlayRoot: null, sharedJson: null
  };
  assert.throws(() => validateManifestSet([targetC, targetD]), (error) => error.code === 'PROTOCOL_INVALID');
});

test('assertNoDescriptorOverlap rejects duplicate document destination and overlapping directory destination', () => {
  const doc1 = { kind: 'document', targetId: 'codex', localSource: '/src/1', generatedSource: '/src/1', relativeDestination: 'DOC.md', declarationIndex: 0 };
  const doc2 = { kind: 'document', targetId: 'gemini', localSource: '/src/2', generatedSource: '/src/2', relativeDestination: 'DOC.md', declarationIndex: 0 };
  assert.throws(() => assertNoDescriptorOverlap([doc1, doc2]), (error) => error.code === 'PROTOCOL_INVALID');

  const dir1 = { kind: 'directory', targetId: 'claude', localSource: '/src/d1', generatedSource: '/src/d1', relativeDestination: 'root', declarationIndex: 0 };
  const dir2 = { kind: 'directory', targetId: 'omp', localSource: '/src/d2', generatedSource: '/src/d2', relativeDestination: 'root/child', declarationIndex: 0 };
  assert.throws(() => assertNoDescriptorOverlap([dir1, dir2]), (error) => error.code === 'PROTOCOL_INVALID');

  const doc3 = { kind: 'document', targetId: 'gemini', localSource: '/src/3', generatedSource: '/src/3', relativeDestination: 'root/child.md', declarationIndex: 0 };
  assert.throws(() => assertNoDescriptorOverlap([dir1, doc3]), (error) => error.code === 'PROTOCOL_INVALID');
});

test('enforces canonical project root and owner-controlled identity at publication boundary while keeping general invocation lexical', () => {
  const root = temporaryDirectory();
  const project = join(root, 'project');
  mkdirSync(project);
  const canonical = canonicalProjectRoot(project);
  assert.equal(typeof canonical, 'string');
  assert.ok(canonical.length > 0);

  const id = projectIdentity(project);
  assert.match(id, /^[a-f0-9]{64}$/u);

  const pubCtx = resolvePublicationProjectContext({ projectRoot: project });
  assert.equal(pubCtx.canonicalRoot, canonical);
  assert.equal(pubCtx.projectIdentity, id);

  // Symlinked project root must fail at publication boundary
  const symlinkProject = join(root, 'project-symlink');
  symlinkSync(project, symlinkProject, 'dir');
  assert.throws(() => canonicalProjectRoot(symlinkProject), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => projectIdentity(symlinkProject), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => resolvePublicationProjectContext({ projectRoot: symlinkProject }), (error) => error.code === 'PATH_UNSAFE');

  // Absent project root must fail at publication boundary
  const absentProject = join(root, 'nonexistent');
  assert.throws(() => canonicalProjectRoot(absentProject), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => projectIdentity(absentProject), (error) => error.code === 'PATH_UNSAFE');

  // Regular file as project root must fail at publication boundary
  const fileProject = join(root, 'file-project');
  writeFileSync(fileProject, 'not a dir');
  assert.throws(() => canonicalProjectRoot(fileProject), (error) => error.code === 'PATH_UNSAFE');
  assert.throws(() => projectIdentity(fileProject), (error) => error.code === 'PATH_UNSAFE');

  // General invocation context resolution remains lexical (does NOT fail on symlinked or nonexistent projectRoot)
  const lexicalContext = resolveInvocationContext({
    packageRoot, cwd: packageRoot, projectRoot: absentProject, projectId: 'custom-project-id'
  });
  assert.equal(lexicalContext.projectRoot, absentProject);
  assert.equal(lexicalContext.projectId, 'custom-project-id');
});

