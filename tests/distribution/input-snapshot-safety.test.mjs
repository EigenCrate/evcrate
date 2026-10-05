import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { prepareInputSnapshot, assertLiveInputsUnchanged, runLocalBuild } from '../../dist/index.js';
import { makeTempDir, packageRoot, prepareFixtureWorkspace } from './parity-verification-helpers.mjs';

const require = createRequire(import.meta.url);
function fixture() {
  const root = makeTempDir('evcrate-snapshot-safety-');
  prepareFixtureWorkspace(root);
  return root;
}
const canonical = (root) => join(root, '.evcrate/source/.claude');

for (const dangling of [false, true]) {
  test(`canonical unsafe ${dangling ? 'dangling ' : ''}symlink rejects build without deleting source`, async () => {
    const root = fixture();
    try {
      const link = join(canonical(root), '.gitignore');
      const target = join(root, 'external-ignore');
      rmSync(link, { force: true });
      if (!dangling) writeFileSync(target, 'unrelated external data');
      symlinkSync(target, link);
      const manifestPath = join(root, '.evcrate/build-manifest-claude.json');
      const before = readFileSync(manifestPath);
      await assert.rejects(runLocalBuild(root, ['claude'], { jobs: 1 }), { code: 'PATH_UNSAFE' });
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.deepEqual(readFileSync(manifestPath), before);
      if (!dangling) assert.equal(readFileSync(target, 'utf8'), 'unrelated external data');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('snapshot and real build exclude unreadable artifact descendants but keep consumed .gitignore bytes', async () => {
  const root = fixture();
  try {
    const ignored = join(canonical(root), 'node_modules/unreadable');
    mkdirSync(join(canonical(root), 'node_modules'), { recursive: true });
    writeFileSync(ignored, 'ignored artifact');
    chmodSync(ignored, 0);
    writeFileSync(join(canonical(root), '.gitignore'), 'consumed ignore bytes\n');
    const snapshot = prepareInputSnapshot(root);
    try {
      assert.equal(existsSync(join(snapshot.shared.canonicalHarnessRoot, 'node_modules')), false);
      assert.equal(readFileSync(join(snapshot.shared.canonicalHarnessRoot, '.gitignore'), 'utf8'), 'consumed ignore bytes\n');
      assertLiveInputsUnchanged(root, snapshot.snapshotHashes);
    } finally { snapshot.snapshotStage.cleanup(); }
    await runLocalBuild(root, ['claude'], { jobs: 1 });
    assert.equal(readFileSync(join(canonical(root), '.gitignore'), 'utf8'), 'consumed ignore bytes\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('freshness rejects a consumed .gitignore edit', () => {
  const root = fixture();
  try {
    const ignore = join(canonical(root), '.gitignore');
    writeFileSync(ignore, 'before\n');
    const snapshot = prepareInputSnapshot(root);
    try {
      writeFileSync(ignore, 'after\n');
      assert.throws(() => assertLiveInputsUnchanged(root, snapshot.snapshotHashes), { code: 'PUBLICATION_FAILED' });
      assert.equal(readFileSync(join(snapshot.shared.canonicalHarnessRoot, '.gitignore'), 'utf8'), 'before\n');
      assert.equal(readFileSync(ignore, 'utf8'), 'after\n');
    } finally { snapshot.snapshotStage.cleanup(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real worker build preserves concurrent canonical edits by rejecting promotion', async () => {
  const root = fixture();
  try {
    const ignore = join(canonical(root), '.gitignore');
    writeFileSync(ignore, 'before\n');
    const manifestPath = join(root, '.evcrate/build-manifest.json');
    const before = readFileSync(manifestPath);
    const shim = join(root, 'edit-during-build.cjs');
    writeFileSync(shim, `
      const fs = require('node:fs'), path = require('node:path');
      process.on('message', m => {
        if (m.type === 'BUILD_TARGET' && m.target === 'claude') {
          fs.writeFileSync(path.join(m.packageRoot, '.evcrate/source/.claude/.gitignore'), 'after\\n');
        }
      });
      require(${JSON.stringify(join(packageRoot, 'dist/distribution/target-worker.js'))}).startWorkerListener();
    `);
    await assert.rejects(runLocalBuild(root, ['claude', 'omp'], { jobs: 2, workerScriptPath: shim }), { code: 'PUBLICATION_FAILED' });
    assert.equal(readFileSync(ignore, 'utf8'), 'after\n');
    assert.deepEqual(readFileSync(manifestPath), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('both job modes reject compiled code rebuilt after the parent loaded it', async () => {
  const root = fixture();
  try {
    const api = require(join(root, 'dist/index.js'));
    const adapter = join(root, 'dist/adapters/codex/transforms.js');
    const manifestPath = join(root, '.evcrate/build-manifest.json');
    const before = readFileSync(manifestPath);
    writeFileSync(adapter, readFileSync(adapter, 'utf8').replaceAll('gpt-5.6-luna', 'gpt-9.9-repro'));
    for (const jobs of [1, 2]) {
      await assert.rejects(api.runLocalBuild(root, ['codex', 'omp'], { jobs }), { code: 'PUBLICATION_FAILED' });
      assert.deepEqual(readFileSync(manifestPath), before);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('snapshotted runtime retains executable behavior while a live helper changes', () => {
  const root = fixture();
  try {
    const snapshot = prepareInputSnapshot(root);
    try {
      writeFileSync(join(root, 'dist/adapters/uri-restoration.js'), 'exports.restoreIndexedTokens = () => "BROKEN";\n');
      const { renderHarnessScriptReferences } = require(join(snapshot.shared.runtimeRoot, 'adapters/codex/transforms.js'));
      assert.equal(renderHarnessScriptReferences('https://example.test/docs'), 'https://example.test/docs');
      assert.throws(() => assertLiveInputsUnchanged(root, snapshot.snapshotHashes), { code: 'PUBLICATION_FAILED' });
    } finally { snapshot.snapshotStage.cleanup(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
