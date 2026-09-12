import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  canonicalJsonBytes, hashBytes, readOptionalPublicationMarker, recoverPublicationUnlocked, writeAtomicFile
} from '../../dist/index.js';

const text = (value) => new TextEncoder().encode(value);
const digest = (value) => hashBytes(text(value));

function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  return path;
}
function fileSnapshot(path, fileHash) {
  const stat = lstatSync(path);
  return {
    present: true, kind: 'file', device: Number(stat.dev), inode: Number(stat.ino),
    size: Number(stat.size), mode: Number(stat.mode) & 0o777, hash: fileHash
  };
}
function journalFor(home, state, status, current, retain = false) {
  const id = 'release-1';
  const transactionName = `release-${id}`;
  const transaction = directory(join(state, transactionName));
  const backups = directory(join(transaction, 'backups'));
  writeAtomicFile(join(backups, '0'), text('old'));
  const destination = join(home, '.omp', 'agent', 'alpha.md');
  directory(join(home, '.omp', 'agent'));
  writeFileSync(destination, current);
  chmodSync(destination, 0o600);
  const before = fileSnapshot(join(backups, '0'), digest('old'));
  const intended = fileSnapshot(destination, digest('new'));
  const operations = [{
    target: 'omp', binding: '.omp', local_root: '.omp', relative_path: 'agent/alpha.md',
    kind: 'file', action: 'update', destination: '.omp/agent/alpha.md', backup: 'backups/0',
    before, intendedHash: digest('new'), intended, promoted: true
  }];
  const journal = {
    schema_version: 1, transaction_type: 'target-publication', status, release_id: id,
    home_root: resolve(home), transaction_dir: transactionName,
    selected_targets: ['omp'], binding_order: ['.evcrate/bin', '.omp'],
    previous_managed_paths: {}, managed_paths: { '.omp': ['agent/alpha.md'] },
    build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
    retained_release_id: retain ? id : null, retain_transaction: retain,
    operation_count: operations.length, operations_digest: hashBytes(canonicalJsonBytes(operations)), operations
  };
  writeAtomicFile(join(state, 'release-marker.json'), canonicalJsonBytes({
    schema_version: 1, status: status === 'committed' ? 'complete' : 'promoting',
    transaction_type: 'target-publication', release_id: id,
    selected_targets: ['omp'], binding_order: ['.evcrate/bin', '.omp'],
    managed_paths: { '.omp': ['agent/alpha.md'] }, previous_managed_paths: {},
    build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
    transaction_dir: transactionName, retained_release_id: retain ? id : null
  }));
  writeAtomicFile(join(state, 'publication-journal.json'), canonicalJsonBytes(journal));
  return { destination, transaction, journal };
}
function fixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const home = directory(join(root, 'home'));
  const state = directory(join(home, '.evcrate', 'publication'));
  return { root, home, state };
}

test('interrupted target publication rolls back after promotion and is idempotent', () => {
  const fixtureValue = fixture('evcrate-recovery-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'promoting', 'new');
    const first = recoverPublicationUnlocked(state, home);
    assert.equal(first.action, 'rolled-back');
    assert.equal(first.releaseId, 'release-1');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    assert.equal(existsSync(transaction), false);
    assert.equal(existsSync(join(state, 'publication-journal.json')), false);
    const marker = JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8'));
    assert.equal(marker.status, 'recovered');
    assert.equal(recoverPublicationUnlocked(state, home).action, 'none');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('committed target publication finalizes and removes unretained backups', () => {
  const fixtureValue = fixture('evcrate-recovery-commit-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'committed', 'new');
    const result = recoverPublicationUnlocked(state, home);
    assert.equal(result.action, 'finalized');
    assert.equal(readFileSync(destination, 'utf8'), 'new');
    assert.equal(existsSync(transaction), false);
    assert.equal(JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8')).status, 'complete');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('committed journal finalizes after transaction cleanup crash window', () => {
  const fixtureValue = fixture('evcrate-recovery-cleanup-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'committed', 'new');
    rmSync(transaction, { recursive: true, force: true });
    const result = recoverPublicationUnlocked(state, home);
    assert.equal(result.action, 'finalized');
    assert.equal(readFileSync(destination, 'utf8'), 'new');
    assert.equal(existsSync(join(state, 'publication-journal.json')), false);
    assert.equal(JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8')).status, 'complete');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('staged journal recovers when crash precedes marker publication', () => {
  const fixtureValue = fixture('evcrate-recovery-staged-');
  try {
    const { home, state } = fixtureValue;
    const { destination } = journalFor(home, state, 'promoting', 'new');
    rmSync(join(state, 'release-marker.json'), { force: true });
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.status = 'staged';
    journal.operations[0].promoted = false;
    journal.operations[0].intended = null;
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    assert.equal(recoverPublicationUnlocked(state, home).action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('staged journal rolls back when the crash occurs before workspace creation', () => {
  const fixtureValue = fixture('evcrate-recovery-preworkspace-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'promoting', 'old');
    rmSync(join(state, 'release-marker.json'), { force: true });
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.status = 'staged';
    journal.operations[0].promoted = false;
    journal.operations[0].intended = null;
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    rmSync(transaction, { recursive: true, force: true });

    const result = recoverPublicationUnlocked(state, home);
    assert.equal(result.action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    assert.equal(existsSync(join(state, 'publication-journal.json')), false);
    assert.equal(existsSync(join(state, 'release-marker.json')), false);
    assert.equal(recoverPublicationUnlocked(state, home).action, 'none');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('staged journal with promoted operation rolls back after promotion crash', () => {
  const fixtureValue = fixture('evcrate-recovery-staged-promoted-');
  try {
    const { home, state } = fixtureValue;
    const { destination } = journalFor(home, state, 'promoting', 'new');
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.status = 'staged';
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    assert.equal(recoverPublicationUnlocked(state, home).action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    assert.equal(recoverPublicationUnlocked(state, home).action, 'none');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('malformed recovery journal fails before mutating destination', () => {
  const fixtureValue = fixture('evcrate-recovery-invalid-');
  try {
    const { home, state } = fixtureValue;
    const destination = join(home, '.omp', 'agent', 'alpha.md');
    directory(join(home, '.omp', 'agent'));
    writeFileSync(destination, 'old');
    const malformed = {
      schema_version: 1, transaction_type: 'target-publication', status: 'promoting', release_id: 'release-2',
      home_root: resolve(home), transaction_dir: 'release-release-2', selected_targets: ['omp'],
      binding_order: ['.evcrate/bin', '.omp'], previous_managed_paths: {}, managed_paths: {},
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
      retained_release_id: null, retain_transaction: false,
      operations: [{ target: 'omp', binding: '.omp', kind: 'file', destination: '../escape', backup: null,
        before: { present: false }, intendedHash: digest('new'), promoted: false }]
    };
    writeAtomicFile(join(state, 'publication-journal.json'), canonicalJsonBytes(malformed));
    assert.throws(() => recoverPublicationUnlocked(state, home));
    assert.equal(readFileSync(destination, 'utf8'), 'old');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('complete publication marker rejects transaction identity tampering', () => {
  const fixtureValue = fixture('evcrate-recovery-marker-invalid-');
  try {
    const { home, state } = fixtureValue;
    journalFor(home, state, 'committed', 'new');
    const markerPath = join(state, 'release-marker.json');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    marker.transaction_dir = 'release-other';
    writeAtomicFile(markerPath, canonicalJsonBytes(marker));
    assert.throws(() => readOptionalPublicationMarker(markerPath));
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('recovery rejects a target-local root association mismatch', () => {
  const fixtureValue = fixture('evcrate-recovery-root-mismatch-');
  try {
    const { home, state } = fixtureValue;
    const { destination } = journalFor(home, state, 'promoting', 'new');
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.operations[0].local_root = '.claude';
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    assert.throws(() => recoverPublicationUnlocked(state, home));
    assert.equal(readFileSync(destination, 'utf8'), 'new');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('recovery refuses an untampered operation digest mismatch before mutation', () => {
  const fixtureValue = fixture('evcrate-recovery-tampered-');
  try {
    const { home, state } = fixtureValue;
    const { destination } = journalFor(home, state, 'promoting', 'new');
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.operations[0].destination = '.omp/agent/beta.md';
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    assert.throws(() => recoverPublicationUnlocked(state, home));
    assert.equal(readFileSync(destination, 'utf8'), 'new');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('recovery refuses an unproven create promotion even when external content matches intended', () => {
  const fixtureValue = fixture('evcrate-recovery-unproven-create-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'promoting', 'old');
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const workspaceStat = lstatSync(transaction);
    const stateStat = lstatSync(state);
    Object.assign(journal, {
      workspace_device: Number(workspaceStat.dev),
      workspace_inode: Number(workspaceStat.ino),
      workspace_parent_device: Number(stateStat.dev),
      workspace_parent_inode: Number(stateStat.ino)
    });
    journal.operations[0] = {
      ...journal.operations[0],
      action: 'create',
      backup: null,
      before: { present: false },
      intended: null,
      promoted: false,
      mode: 0o600
    };
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    rmSync(destination, { force: true });
    writeFileSync(destination, 'new');
    chmodSync(destination, 0o600);

    assert.throws(
      () => recoverPublicationUnlocked(state, home),
      (error) => error?.code === 'RECOVERY_FAILED'
    );
    assert.equal(readFileSync(destination, 'utf8'), 'new');
    assert.equal(existsSync(transaction), true);
    assert.equal(existsSync(journalPath), true);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('recovery rejects progress evidence with an operation mode mismatch', () => {
  const fixtureValue = fixture('evcrate-recovery-progress-mode-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'promoting', 'new');
    const journalPath = join(state, 'publication-journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const originalIntended = journal.operations[0].intended;
    journal.operations[0] = { ...journal.operations[0], promoted: false, intended: null, mode: 0o600 };
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    const progress = directory(join(transaction, 'progress'));
    const intended = { ...originalIntended, mode: 0o644 };
    writeAtomicFile(join(progress, '0.json'), canonicalJsonBytes({
      index: 0, promoted: true, intended
    }));
    chmodSync(destination, 0o644);

    assert.throws(
      () => recoverPublicationUnlocked(state, home),
      (error) => error?.code === 'RECOVERY_FAILED'
    );
    assert.equal(readFileSync(destination, 'utf8'), 'new');
    assert.equal(lstatSync(destination).mode & 0o777, 0o644);
    assert.equal(existsSync(transaction), true);
    assert.equal(existsSync(journalPath), true);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
