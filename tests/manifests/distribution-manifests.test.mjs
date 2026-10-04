import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  ADVISOR_CONTROLLER_FILES, buildManifestBytes, controllerHashes, loadSelectedManifests,
  loadTargetManifest, loadTargetManifestRegistry, manifestAdapterHashes, manifestSourceHashes,
  readBuildManifest, validateAdvisorControllerProjection, validateAdvisorControllerSource, validateBuildManifest, validateManifestSet, verifyBuild
} from '../../dist/index.js';

const packageRoot = process.cwd();
const registryPath = join(packageRoot, '.evcrate', 'targets', 'manifest.json');
const controllerRoot = join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin');
const temporaryRoots = [];
function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-manifest-'));
  temporaryRoots.push(root);
  return root;
}
function code(errorCode) {
  return (error) => error?.code === errorCode;
}
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('schema-2 registry selection and input hashes follow persisted target declarations', () => {
  const registry = loadTargetManifestRegistry(registryPath);
  assert.deepEqual([...registry.targets.keys()], ['antigravity', 'claude', 'codex', 'copilot', 'gemini', 'omp', 'pi', 'vscode']);
  assert.equal(loadSelectedManifests(registry, ['agy'])[0].name, 'antigravity');
  assert.equal(loadSelectedManifests(registry).length, 8);
  assert.deepEqual(
    loadSelectedManifests(registry, ['copilot', 'pi', 'claude', 'codex']).map(({ id }) => id),
    ['claude', 'codex', 'copilot', 'pi']
  );
  assert.throws(() => loadSelectedManifests(registry, ['not-a-target']), code('CAPABILITY_UNSUPPORTED'));
  const manifests = [...registry.targets.values()];
  assert.ok(Object.keys(manifestSourceHashes(manifests)).length > 0);
  assert.ok(Object.keys(manifestAdapterHashes(manifests, packageRoot)).length > 0);
});

test('verified build checks complete metadata, independent roots, and controller bytes', () => {
  const root = temporaryDirectory();
  const manifestPath = join(root, '.evcrate', 'build-manifest.json');
  mkdirSync(join(root, '.evcrate'), { recursive: true });
  const outputRoots = Object.fromEntries([
    '.agents', '.antigravity', '.claude', '.codex', '.copilot', '.evcrate',
    '.gemini', '.omp', '.pi', 'AGENTS.md', 'GEMINI.md'
  ].map((name) => [name, join(packageRoot, '.evcrate', 'source', name)]));
  writeFileSync(manifestPath, buildManifestBytes({
    sourceHashes: {}, adapterHashes: {}, controllerHashes: controllerHashes(controllerRoot),
    owners: {}, outputRoots, validation: { complete: true }, homePolicy: {}
  }));
  assert.equal(verifyBuild({ manifestPath, outputRoots, controllerRoot, sourceHashes: {}, adapterHashes: {} }).schema_version, 2);
  assert.throws(() => verifyBuild({ manifestPath, outputRoots: { ...outputRoots, '.wrong': outputRoots['.claude'] } }), code('PUBLICATION_FAILED'));
});
test('controller verifier rejects an extra production tree entry', () => {
  const root = temporaryDirectory();
  const copy = join(root, 'bin');
  cpSync(controllerRoot, copy, { recursive: true });
  writeFileSync(join(copy, 'lib', 'advisor', 'extra.cjs'), 'module.exports = {}');
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
});
test('controller closure enforces exact 36 files, regular files, and require boundaries', () => {
  assert.equal(ADVISOR_CONTROLLER_FILES.length, 36);
  const hashes = controllerHashes(controllerRoot);
  assert.equal(Object.keys(hashes).length, 36);
  const root = temporaryDirectory();
  const copy = join(root, 'bin');
  cpSync(controllerRoot, copy, { recursive: true });
  writeFileSync(join(copy, 'viewer.js'), 'export const viewer = true;');
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
  rmSync(join(copy, 'viewer.js'));
  writeFileSync(join(copy, 'lib', 'advisor', 'runner.cjs'), "require('lodash');\n");
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
});
test('controller validator treats native text assets (.cs and .ps1) as owned text data, not JavaScript modules', () => {
  const root = temporaryDirectory();
  const copy = join(root, 'bin');
  cpSync(controllerRoot, copy, { recursive: true });

  const csPath = join(copy, 'lib', 'advisor', 'windows-native.cs');
  const originalCs = readFileSync(csPath, 'utf8');

  const ps1Path = join(copy, 'lib', 'advisor', 'windows-native.ps1');
  const originalPs1 = readFileSync(ps1Path, 'utf8');

  // Reject UTF-8 BOM in native text assets.
  writeFileSync(csPath, `\uFEFF${originalCs}`);
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
  writeFileSync(csPath, originalCs);

  writeFileSync(ps1Path, `\uFEFF${originalPs1}`);
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
  writeFileSync(ps1Path, originalPs1);

  // 3. Reject requiring a native text asset from a JavaScript module
  const runnerPath = join(copy, 'lib', 'advisor', 'runner.cjs');
  const originalRunner = readFileSync(runnerPath, 'utf8');
  writeFileSync(runnerPath, `${originalRunner}\nrequire('./windows-native.cs');\n`);
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
  writeFileSync(runnerPath, `${originalRunner}\nrequire('./windows-native.ps1');\n`);
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
  writeFileSync(runnerPath, originalRunner);

  // 4. Reject arbitrary executable file kinds in controller (no broad executable allowance)
  const execPath = join(copy, 'lib', 'advisor', 'helper.exe');
  writeFileSync(execPath, 'binary');
  assert.throws(() => validateAdvisorControllerSource(copy), code('PATH_UNSAFE'));
});



test('manifest adapters must be regular files', () => {
  const root = temporaryDirectory();
  const manifestDirectory = join(root, '.evcrate', 'targets', 'claude');
  mkdirSync(manifestDirectory, { recursive: true });
  mkdirSync(join(root, 'adapter'));
  writeFileSync(join(manifestDirectory, 'manifest.json'), JSON.stringify({
    schema_version: 2, name: 'claude', adapter: 'adapter', adapter_sources: [],
    output_root: '.claude', additional_roots: [], project_docs: [], patches: [],
    home_policy: { bindings: { '.claude': '.claude' }, preserve_paths: {}, promotion_order: 40 }
  }));
  assert.throws(() => loadTargetManifest(join(manifestDirectory, 'manifest.json'), 'claude'), code('PATH_UNSAFE'));
});
test('manifest patches stay inside the declared source and output boundaries', () => {
  const root = temporaryDirectory();
  const directory = join(root, '.evcrate', 'targets', 'claude');
  mkdirSync(join(directory, 'patches'), { recursive: true });
  writeFileSync(join(directory, 'patches', 'update.json'), '{}');
  writeFileSync(join(directory, 'outside.json'), '{}');
  const base = {
    schema_version: 2, name: 'claude', adapter: null, adapter_sources: [],
    output_roots: ['.claude'], project_docs: [], owned_paths: [],
    home_policy: { bindings: { '.claude': '.claude' }, preserve_paths: {}, promotion_order: 40 }
  };
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    ...base, patches: [{ source: 'outside.json', destination: '.claude/settings.json', keys: ['hooks'] }]
  }));
  assert.throws(() => loadTargetManifest(join(directory, 'manifest.json'), 'claude'), code('PROTOCOL_INVALID'));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    ...base, patches: [{ source: 'patches/update.json', destination: '.other/settings.json', keys: ['hooks'] }]
  }));
  assert.throws(() => loadTargetManifest(join(directory, 'manifest.json'), 'claude'), code('PROTOCOL_INVALID'));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    ...base, patches: [
      { source: 'patches/update.json', destination: '.claude/settings.json', keys: ['hooks'] },
      { source: 'patches/update.json', destination: '.claude/settings.json', keys: ['hooks'] }
    ]
  }));
  assert.throws(() => loadTargetManifest(join(directory, 'manifest.json'), 'claude'), code('PROTOCOL_INVALID'));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
    ...base, patches: [{ source: 'patches/update.json', destination: '.claude/settings.json', keys: ['\ud800'] }]
  }));
  assert.throws(() => loadTargetManifest(join(directory, 'manifest.json'), 'claude'), code('PROTOCOL_INVALID'));
});

test('manifest-set validation rejects nested output ownership', () => {
  const root = temporaryDirectory();
  const first = join(root, '.evcrate', 'targets', 'claude');
  const second = join(root, '.evcrate', 'targets', 'codex');
  mkdirSync(first, { recursive: true }); mkdirSync(second, { recursive: true });
  const manifest = (name, output) => ({
    schema_version: 2, name, adapter: null, adapter_sources: [], output_roots: [output],
    project_docs: [], owned_paths: [], patches: [],
    home_policy: { bindings: { [output]: `${output}-home` }, preserve_paths: {}, promotion_order: 40 }
  });
  writeFileSync(join(first, 'manifest.json'), JSON.stringify(manifest('claude', 'owned')));
  writeFileSync(join(second, 'manifest.json'), JSON.stringify(manifest('codex', 'owned/nested')));
  const loaded = [
    loadTargetManifest(join(first, 'manifest.json')),
    loadTargetManifest(join(second, 'manifest.json'))
  ];
  assert.throws(() => validateManifestSet(loaded), code('PROTOCOL_INVALID'));
});

test('build manifest reader accepts documents up to its declared bound', () => {
  const root = temporaryDirectory();
  const directory = join(root, '.evcrate');
  mkdirSync(directory);
  writeFileSync(join(directory, 'build-manifest.json'), JSON.stringify({
    schema_version: 2, source_hashes: {}, adapter_hashes: {}, controller_hashes: controllerHashes(controllerRoot),
    owners: {}, output_hashes: {}, validation: { complete: true, padding: 'x'.repeat(70_000) }, home_policy: {}
  }));
  assert.equal(readBuildManifest(join(directory, 'build-manifest.json')).validation.complete, true);
});
test('build manifest validator rejects unsafe keys and incomplete shape', () => {
  const digest = 'a'.repeat(64);
  const value = {
    schema_version: 2, source_hashes: { '../escape': digest }, adapter_hashes: {},
    controller_hashes: {}, owners: {}, output_hashes: {}, validation: {}, home_policy: {}
  };
  assert.throws(() => validateBuildManifest(value), code('PROTOCOL_INVALID'));
  const valid = { ...value, source_hashes: { 'source/file': digest }, controller_hashes: controllerHashes(controllerRoot) };
  assert.equal(validateBuildManifest(valid).schema_version, 2);
});
test('resource roots reject sensitive metadata declarations', () => {
  const root = temporaryDirectory();
  const canonical = join(root, '.evcrate', 'source', '.claude');
  const targetDirectory = join(root, '.evcrate', 'targets', 'claude');
  mkdirSync(canonical, { recursive: true });
  for (const name of ['agents', 'commands', 'hooks', 'skills', 'workflows']) mkdirSync(join(canonical, name));
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(join(targetDirectory, 'manifest.json'), JSON.stringify({
    schema_version: 2, name: 'claude', adapter: null, adapter_sources: [], output_root: '.claude',
    additional_roots: [], project_docs: [], patches: [],
    home_policy: { bindings: { '.claude': '.claude' }, preserve_paths: {}, promotion_order: 1 }
  }));
  const registryPath = join(root, '.evcrate', 'targets', 'manifest.json');
  writeFileSync(registryPath, JSON.stringify({
    schema_version: 2,
    resource_roots: { skill: '.git', agent: 'agents', command: 'commands', hook: 'hooks', workflow: 'workflows' },
    targets: { claude: 'claude/manifest.json' }
  }));
  assert.throws(() => loadTargetManifestRegistry(registryPath), code('PROTOCOL_INVALID'));
});
