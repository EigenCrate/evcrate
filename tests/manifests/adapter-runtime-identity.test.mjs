import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildManifestBytes,
  controllerHashes,
  loadTargetManifestRegistry,
  loadSelectedManifests,
  manifestAdapterHashes,
  verifyBuild
} from '../../dist/index.js';

const packageRoot = process.cwd();
const controllerRoot = join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin');
const sharedHelper = 'dist/adapters/advisory.js';
const vscodeHelper = 'dist/adapters/vscode/configuration-validation.js';

function code(errorCode) {
  return (error) => error?.code === errorCode;
}

function copiedTranslatedRuntime(t) {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-adapter-identity-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  cpSync(join(packageRoot, '.evcrate', 'targets'), join(tempDir, '.evcrate', 'targets'), { recursive: true });
  for (const resource of ['agents', 'commands', 'hooks', 'skills', 'workflows']) {
    mkdirSync(join(tempDir, '.evcrate', 'source', '.claude', resource), { recursive: true });
  }

  const registry = loadTargetManifestRegistry(join(tempDir, '.evcrate', 'targets', 'manifest.json'));
  const manifests = loadSelectedManifests(registry).filter((manifest) => manifest.adapter !== null);
  for (const manifest of manifests) {
    for (const sourcePath of [manifest.adapter, ...manifest.adapterSources]) {
      if (sourcePath === null) continue;
      const destination = join(tempDir, sourcePath);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(packageRoot, sourcePath), destination);
    }
  }
  return { tempDir, manifests };
}

function recordedBuild(tempDir, adapterHashes) {
  const manifestPath = join(tempDir, '.evcrate', 'build-manifest.json');
  writeFileSync(manifestPath, buildManifestBytes({
    sourceHashes: {},
    adapterHashes,
    controllerHashes: controllerHashes(controllerRoot),
    owners: {},
    outputRoots: {},
    validation: { complete: true },
    homePolicy: {}
  }));
  return manifestPath;
}

function verifyRecordedBuild(manifestPath, adapterHashes) {
  return verifyBuild({
    manifestPath,
    outputRoots: {},
    controllerRoot,
    sourceHashes: {},
    adapterHashes
  });
}

test('a shared adapter helper change invalidates every translated adapter and rejects the recorded build', (t) => {
  const { tempDir, manifests } = copiedTranslatedRuntime(t);
  const beforeByTarget = new Map(manifests.map((manifest) => [
    manifest.name,
    manifestAdapterHashes([manifest], tempDir)
  ]));
  const before = manifestAdapterHashes(manifests, tempDir);
  const manifestPath = recordedBuild(tempDir, before);
  assert.doesNotThrow(() => verifyRecordedBuild(manifestPath, before));

  appendFileSync(join(tempDir, sharedHelper), '\n// shared helper identity mutation\n');
  const after = manifestAdapterHashes(manifests, tempDir);

  for (const manifest of manifests) {
    assert.notDeepEqual(
      manifestAdapterHashes([manifest], tempDir),
      beforeByTarget.get(manifest.name),
      `${manifest.name} must reject an identity recorded before its shared helper changed`
    );
  }
  assert.throws(
    () => verifyRecordedBuild(manifestPath, after),
    code('PUBLICATION_FAILED')
  );
});

test('a VS Code helper change invalidates only its adapter and rejects the recorded build', (t) => {
  const { tempDir, manifests } = copiedTranslatedRuntime(t);
  const beforeByTarget = new Map(manifests.map((manifest) => [
    manifest.name,
    manifestAdapterHashes([manifest], tempDir)
  ]));
  const before = manifestAdapterHashes(manifests, tempDir);
  const manifestPath = recordedBuild(tempDir, before);
  assert.doesNotThrow(() => verifyRecordedBuild(manifestPath, before));

  appendFileSync(join(tempDir, vscodeHelper), '\n// target helper identity mutation\n');
  const after = manifestAdapterHashes(manifests, tempDir);

  for (const manifest of manifests) {
    const current = manifestAdapterHashes([manifest], tempDir);
    if (manifest.name === 'vscode') {
      assert.notDeepEqual(current, beforeByTarget.get(manifest.name));
    } else {
      assert.deepEqual(current, beforeByTarget.get(manifest.name));
    }
  }
  assert.throws(
    () => verifyRecordedBuild(manifestPath, after),
    code('PUBLICATION_FAILED')
  );
});
