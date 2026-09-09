import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { rmSync } from 'node:fs';
import {
  canonicalJsonBytes, containedPath, createStagedRoot, hashBytes, hashFile,
  isIgnoredArtifact, normalizeRelativePath, promoteTransaction, readReleaseMarker,
  PROMOTION_JOURNAL_NAME, recoverInterruptedPromotion, sourceTreeHash, treeHash,
  withPublishLock, writeAtomicFile, writeReleaseMarker,
} from '../../dist/index.js';

const roots = [];
const stagedRoots = [];
function stagedDirectory(root) {
  const stage = createStagedRoot(root);
  stagedRoots.push(stage);
  return stage;
}
function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-phase4-'));
  roots.push(root);
  return root;
}
function code(errorCode) {
  return (error) => error?.code === errorCode;
}
afterEach(() => {
  for (const stage of stagedRoots.splice(0)) stage.cleanup();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('canonical hashes are deterministic and ignore compiler artifacts', () => {
  const root = temporaryDirectory();
  mkdirSync(join(root, 'empty'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'ignored.js'), 'ignored');
  writeFileSync(join(root, 'main.js'), 'one');
  writeFileSync(join(root, 'ignored.pyc'), 'ignored');
  const before = treeHash(root);
  writeFileSync(join(root, 'node_modules', 'ignored.js'), 'changed');
  writeFileSync(join(root, 'ignored.pyc'), 'changed');
  assert.equal(treeHash(root), before);
  writeFileSync(join(root, 'main.js'), 'two');
  assert.notEqual(treeHash(root), before);
  assert.equal(sourceTreeHash(root), treeHash(root));
  assert.equal(isIgnoredArtifact('node_modules/pkg/index.js'), true);
  assert.equal(Buffer.from(canonicalJsonBytes({ b: 2, a: 1 })).toString(), '{"a":1,"b":2}\n');
  assert.equal(hashBytes(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashFile(join(root, 'main.js')).length, 64);
});

test('tree hashes use the authority global lexical path order', () => {
  const root = temporaryDirectory();
  mkdirSync(join(root, 'a'));
  writeFileSync(join(root, 'a', 'z'), 'nested');
  writeFileSync(join(root, 'a.txt'), 'sibling');
  const nestedDigest = hashFile(join(root, 'a', 'z'));
  const expected = hashBytes(new TextEncoder().encode(
    `d\0a\nf\0a.txt\0${hashFile(join(root, 'a.txt'))}\nf\0a/z\0${nestedDigest}\n`
  ));
  assert.equal(treeHash(root), expected);
});

test('contained paths reject traversal and symlink escapes', () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  mkdirSync(join(root, 'safe'));
  symlinkSync(outside, join(root, 'escape'), 'dir');
  assert.equal(normalizeRelativePath('safe/file.txt'), 'safe/file.txt');
  for (const value of ['../outside', './file', 'safe//file', 'safe\\file', '/absolute']) {
    assert.throws(() => normalizeRelativePath(value), code('PATH_UNSAFE'));
  }
  assert.throws(() => containedPath(root, 'escape/file'), code('PATH_UNSAFE'));
  assert.throws(() => createStagedRoot(root, '../escape-'), code('PATH_UNSAFE'));
});

test('atomic files, staged roots, locks, and release markers are durable boundaries', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'nested', 'policy.json');
  writeAtomicFile(destination, new TextEncoder().encode('first'));
  assert.equal(readFileSync(destination, 'utf8'), 'first');
  assert.equal(statSync(destination).mode & 0o777, 0o600);
  writeAtomicFile(destination, new TextEncoder().encode('second'));
  assert.equal(readFileSync(destination, 'utf8'), 'second');
  const staged = createStagedRoot(root);
  assert.equal(statSync(staged.path).mode & 0o777, 0o700);
  staged.cleanup();
  const state = join(root, 'state');
  withPublishLock(state, () => assert.equal(statSync(join(state, 'publish.lock')).mode & 0o777, 0o600));
  assert.equal(false, (() => { try { statSync(join(state, 'publish.lock')); return true; } catch { return false; } })());
  writeReleaseMarker(state, { schema_version: 1, status: 'complete', roots: {}, managed_paths: {} });
  assert.equal(readReleaseMarker(state).status, 'complete');
});
test('staged-root cleanup refuses an inode-replaced directory', () => {
  const root = temporaryDirectory();
  const stage = createStagedRoot(root);
  const backup = `${stage.path}.bak`;
  renameSync(stage.path, backup);
  mkdirSync(stage.path);
  rmSync(backup, { recursive: true, force: true });
  writeFileSync(join(stage.path, 'sentinel'), 'keep');
  assert.throws(() => stage.cleanup(), code('PATH_UNSAFE'));
  assert.equal(readFileSync(join(stage.path, 'sentinel'), 'utf8'), 'keep');
  rmSync(stage.path, { recursive: true, force: true });
});
test('publishers enforce mutual exclusion on the lock protocol', async () => {
  const root = temporaryDirectory();
  const state = join(root, 'state');
  const childScript = `
    const { withPublishLock } = require('./dist/index.js');
    const { spawnSync } = require('node:child_process');
    withPublishLock(process.argv[1], () => {
      process.stdout.write('ready\\n');
      spawnSync('sleep', ['30']);
    });
  `;
  const child = spawn(process.execPath, ['-e', childScript, state], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`lock holder exited: ${code}`)));
  });
  assert.throws(() => withPublishLock(state, () => {}), code('PUBLICATION_FAILED'));
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
});
test('lock readers reject malformed metadata and preserve uncertain locks', () => {
  const root = temporaryDirectory();
  const state = join(root, 'state');
  mkdirSync(state, { mode: 0o700 });
  const lock = join(state, 'publish.lock');
  const token = 'a'.repeat(32);
  const payloads = [
    `{"pid":1,"startedAt":1,"token":"${token}","processStart":null,"pid":2}`,
    `{"pid":1,"token":"${token}","processStart":null}`,
    `{"pid":NaN,"startedAt":1,"token":"${token}","processStart":null}`,
    'x'.repeat(4097)
  ];
  for (const payload of payloads) {
    writeFileSync(lock, payload); chmodSync(lock, 0o600);
    assert.throws(() => withPublishLock(state, () => {}), code('PUBLICATION_FAILED'));
    assert.equal(readFileSync(lock, 'utf8'), payload);
    rmSync(lock);
  }
  symlinkSync(join(root, 'missing-marker'), join(state, 'release-marker.json'));
  assert.throws(() => readReleaseMarker(state), code('PATH_UNSAFE'));
});
test('stale locks are quarantined before replacement', () => {
  const root = temporaryDirectory();
  const state = join(root, 'state');
  mkdirSync(state, { mode: 0o700 });
  writeFileSync(join(state, 'publish.lock'), JSON.stringify({
    pid: 999999999, startedAt: 1, token: 'b'.repeat(32), processStart: null
  }));
  chmodSync(join(state, 'publish.lock'), 0o600);
  withPublishLock(state, () => assert.equal(statSync(join(state, 'publish.lock')).isFile(), true));
  assert.equal(readdirSync(state).some((name) => name.includes('.stale-')), false);
});

test('promotion commits a staged set or restores the previous complete set', () => {
  const root = temporaryDirectory();
  const stage = stagedDirectory(root);
  const oldA = join(root, 'a');
  const oldB = join(root, 'b');
  mkdirSync(oldA); mkdirSync(oldB);
  writeFileSync(join(oldA, 'value'), 'old-a');
  writeFileSync(join(oldB, 'value'), 'old-b');
  const newA = join(stage.path, 'stage-a');
  const newB = join(stage.path, 'stage-b');
  mkdirSync(newA); mkdirSync(newB);
  writeFileSync(join(newA, 'value'), 'new-a');
  writeFileSync(join(newB, 'value'), 'new-b');
  promoteTransaction([
    { source: newA, destination: oldA },
    { source: newB, destination: oldB }
  ], { stageRoot: stage });
  assert.equal(readFileSync(join(oldA, 'value'), 'utf8'), 'new-a');
  assert.equal(readFileSync(join(oldB, 'value'), 'utf8'), 'new-b');

  const outside = join(root, 'outside');
  mkdirSync(outside); writeFileSync(join(outside, 'value'), 'outside');
  assert.throws(() => promoteTransaction([{ source: outside, destination: oldA }], { stageRoot: stage }), code('PATH_UNSAFE'));
  const next = join(stage.path, 'stage-next');
  mkdirSync(next); writeFileSync(join(next, 'value'), 'next');
  assert.throws(() => promoteTransaction([{ source: next, destination: oldA }], {
    stageRoot: stage, hooks: { beforePromote: () => { throw new Error('injected boundary'); } }
  }), code('PUBLICATION_FAILED'));
  assert.equal(readFileSync(join(oldA, 'value'), 'utf8'), 'new-a');
  assert.equal(readFileSync(join(next, 'value'), 'utf8'), 'next');
});
test('promotion defaults to publication failures when CAS code is omitted', () => {
  const root = temporaryDirectory();
  const stage = stagedDirectory(root);
  const destination = join(root, 'destination');
  const source = join(stage.path, 'source');
  mkdirSync(destination); writeFileSync(join(destination, 'value'), 'old');
  mkdirSync(source); writeFileSync(join(source, 'value'), 'new');
  assert.throws(() => promoteTransaction([{ source, destination }], {
    stageRoot: stage, hooks: { beforePromote: () => { throw new Error('default failure'); } }
  }), code('PUBLICATION_FAILED'));
  assert.equal(readFileSync(join(destination, 'value'), 'utf8'), 'old');
  assert.equal(readFileSync(join(source, 'value'), 'utf8'), 'new');
});
test('promotion rejects destination and source changes at rename boundaries', () => {
  const root = temporaryDirectory();
  const stage = stagedDirectory(root);
  const destination = join(root, 'destination');
  mkdirSync(destination); writeFileSync(join(destination, 'value'), 'old');
  const source = join(stage.path, 'source');
  mkdirSync(source); writeFileSync(join(source, 'value'), 'new');
  assert.throws(() => promoteTransaction([{ source, destination }], {
    stageRoot: stage,
    hooks: { beforeBackup: () => writeFileSync(join(destination, 'value'), 'tampered') }
  }), code('ROLLBACK_FAILED'));
  assert.equal(readFileSync(join(destination, 'value'), 'utf8'), 'tampered');

  const secondRoot = temporaryDirectory();
  const secondStage = stagedDirectory(secondRoot);
  const secondDestination = join(secondRoot, 'destination');
  mkdirSync(secondDestination); writeFileSync(join(secondDestination, 'value'), 'old');
  const secondSource = join(secondStage.path, 'source');
  mkdirSync(secondSource); writeFileSync(join(secondSource, 'value'), 'new');
  assert.throws(() => promoteTransaction([{ source: secondSource, destination: secondDestination }], {
    stageRoot: secondStage,
    hooks: { beforePromote: () => writeFileSync(join(secondSource, 'value'), 'tampered') }
  }), code('PUBLICATION_FAILED'));
  assert.equal(readFileSync(join(secondDestination, 'value'), 'utf8'), 'old');
});
test('promotion recovery accepts the Python authority journal shape', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'artifact');
  const backupDir = join(root, '.evcrate-promotion-python');
  mkdirSync(destination);
  writeFileSync(join(destination, 'value'), 'old');
  mkdirSync(backupDir);
  renameSync(destination, join(backupDir, 'artifact'));
  writeFileSync(join(root, PROMOTION_JOURNAL_NAME), JSON.stringify({
    backup_dir: '.evcrate-promotion-python', destinations: ['artifact'], originally_present: [true]
  }));
  recoverInterruptedPromotion(root);
  assert.equal(readFileSync(join(destination, 'value'), 'utf8'), 'old');
});
test('committed promotion recovery completes a deletion without a destination', () => {
  const root = temporaryDirectory();
  const backupDir = join(root, '.evcrate-promotion-delete');
  mkdirSync(backupDir);
  writeFileSync(join(backupDir, 'artifact'), 'old');
  writeFileSync(join(root, PROMOTION_JOURNAL_NAME), JSON.stringify({
    backup_dir: '.evcrate-promotion-delete', destinations: ['artifact'], originally_present: [true],
    intended_hashes: [null], committed: true
  }));
  recoverInterruptedPromotion(root);
  assert.equal(false, (() => { try { statSync(join(root, 'artifact')); return true; } catch { return false; } })());
  assert.equal(false, (() => { try { statSync(join(root, PROMOTION_JOURNAL_NAME)); return true; } catch { return false; } })());
});

test('promotion recovery refuses to delete an unexpected destination', () => {
  const root = temporaryDirectory();
  const destination = join(root, 'artifact');
  const backupDir = join(root, '.evcrate-promotion-attacker');
  mkdirSync(backupDir);
  writeFileSync(destination, 'keep');
  writeFileSync(join(root, PROMOTION_JOURNAL_NAME), JSON.stringify({
    backup_dir: '.evcrate-promotion-attacker', destinations: ['artifact'], originally_present: [false]
  }));
  assert.throws(() => recoverInterruptedPromotion(root), code('ROLLBACK_FAILED'));
  assert.equal(readFileSync(destination, 'utf8'), 'keep');
});
