import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadTargetManifestRegistry,
  loadSelectedManifests,
  manifestAdapterHashes
} from '../../dist/index.js';

const packageRoot = process.cwd();

const TRANSLATED_TARGETS = [
  'antigravity',
  'codex',
  'copilot',
  'gemini',
  'omp',
  'pi',
  'vscode'
];


test('adapter-runtime-identity: helper-only change invalidates adapter identity across all 7 affected targets in disposable copied runtime', (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evcrate-adapter-identity-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  // Set up disposable isolated runtime directory
  // Copy target definitions
  cpSync(join(packageRoot, '.evcrate', 'targets'), join(tempDir, '.evcrate', 'targets'), { recursive: true });
  cpSync(join(packageRoot, '.evcrate', 'source', '.claude'), join(tempDir, '.evcrate', 'source', '.claude'), { recursive: true });

  const tempRegistryPath = join(tempDir, '.evcrate', 'targets', 'manifest.json');
  const tempRegistry = loadTargetManifestRegistry(tempRegistryPath);
  const tempManifests = loadSelectedManifests(tempRegistry, TRANSLATED_TARGETS);

  // Copy declared adapter files into disposable runtime
  for (const manifest of tempManifests) {
    for (const sourcePath of [manifest.adapter, ...manifest.adapterSources]) {
      if (sourcePath) {
        const srcFull = join(packageRoot, sourcePath);
        const destFull = join(tempDir, sourcePath);
        mkdirSync(join(destFull, '..'), { recursive: true });
        cpSync(srcFull, destFull);
      }
    }
  }

  // Pre-condition: manifestAdapterHashes contains dist/adapters/uri-restoration.js
  const beforeHashes = manifestAdapterHashes(tempManifests, tempDir);
  assert.ok(
    'dist/adapters/uri-restoration.js' in beforeHashes,
    'Aggregate adapter hashes must contain dist/adapters/uri-restoration.js'
  );

  // Verify each target individually includes dist/adapters/uri-restoration.js in its hash closure
  const perTargetBefore = new Map();
  for (const manifest of tempManifests) {
    const targetHashes = manifestAdapterHashes([manifest], tempDir);
    assert.ok(
      'dist/adapters/uri-restoration.js' in targetHashes,
      `Target ${manifest.name} individual adapter hashes must contain dist/adapters/uri-restoration.js`
    );
    perTargetBefore.set(manifest.name, targetHashes);
  }

  // Mutate ONLY the extracted helper file in the disposable copied runtime
  appendFileSync(join(tempDir, 'dist', 'adapters', 'uri-restoration.js'), '\n// helper-only identity mutation\n');

  // Recompute aggregate adapter hashes
  const afterHashes = manifestAdapterHashes(tempManifests, tempDir);

  // Helper hash must differ
  assert.notEqual(
    afterHashes['dist/adapters/uri-restoration.js'],
    beforeHashes['dist/adapters/uri-restoration.js'],
    'Helper hash must change after helper-only modification'
  );
  assert.notDeepEqual(afterHashes, beforeHashes, 'Aggregate adapter hashes must change after helper-only modification');

  // Verify that EVERY individual translated target adapter identity is invalidated
  for (const manifest of tempManifests) {
    const targetBefore = perTargetBefore.get(manifest.name);
    const targetAfter = manifestAdapterHashes([manifest], tempDir);
    assert.notDeepEqual(
      targetAfter,
      targetBefore,
      `Target ${manifest.name} adapter identity must be invalidated by helper-only change`
    );
    assert.notEqual(
      targetAfter['dist/adapters/uri-restoration.js'],
      targetBefore['dist/adapters/uri-restoration.js'],
      `Target ${manifest.name} helper hash must reflect helper-only change`
    );
  }

  // Verify no unintended hash changed (all other keys must remain identical)
  for (const [key, value] of Object.entries(beforeHashes)) {
    if (key !== 'dist/adapters/uri-restoration.js') {
      assert.equal(
        afterHashes[key],
        value,
        `Unmodified adapter file ${key} hash must remain unchanged`
      );
    }
  }
});
