import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  canonicalJsonBytes, hashBytes, readOptionalPublicationMarker, recoverPublicationUnlocked,
  recoverAndMigrateHomeStateUnlocked, recoverAndMigrateProjectStateUnlocked, writeAtomicFile
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
    size: Number(stat.size), hash: fileHash
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
test('terminal schema-1 HOME marker migrates to independent shared and harness records', () => {
  const fixtureValue = fixture('evcrate-recovery-migrate-');
  try {
    const { home, state } = fixtureValue;
    const marker = {
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-home', selected_targets: ['omp'],
      binding_order: ['.evcrate/bin', '.omp'],
      managed_paths: { '.evcrate/bin': [], '.omp': ['agent/owned.md'] },
      previous_managed_paths: { '.evcrate/bin': [], '.omp': ['agent/old.md'] },
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
      transaction_dir: 'release-legacy-home', retained_release_id: null
    };
    writeAtomicFile(join(state, 'release-marker.json'), canonicalJsonBytes(marker));

    const result = recoverAndMigrateHomeStateUnlocked(state, home);
    assert.equal(result.action, 'none');
    const migrated = readOptionalPublicationMarker(join(state, 'release-marker.json'));
    assert.equal(migrated?.schema_version, 2);
    assert.equal(migrated?.scope, 'home');
    assert.deepEqual(migrated?.records.shared.selected_targets, []);
    assert.deepEqual(migrated?.records.shared.binding_order, ['.evcrate/bin']);
    assert.deepEqual(migrated?.records.shared.managed_paths, {});
    assert.deepEqual(migrated?.records.harness.managed_paths, {
      omp: { '.omp': ['agent/owned.md'] }
    });
    assert.deepEqual(migrated?.records.harness.previous_managed_paths, {
      omp: { '.omp': ['agent/old.md'] }
    });
    assert.equal(Object.hasOwn(migrated, 'managed_paths'), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('schema-2 shared records reject noncanonical selection and binding order', () => {
  const fixtureValue = fixture('evcrate-recovery-v2-record-');
  try {
    const { home, state } = fixtureValue;
    writeAtomicFile(join(state, 'release-marker.json'), canonicalJsonBytes({
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-record', selected_targets: ['omp'],
      binding_order: ['.evcrate/bin', '.omp'],
      managed_paths: { '.evcrate/bin': [], '.omp': [] },
      previous_managed_paths: { '.evcrate/bin': [], '.omp': [] },
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'a'.repeat(64),
      transaction_dir: 'release-legacy-record', retained_release_id: null
    }));
    recoverAndMigrateHomeStateUnlocked(state, home);
    const markerPath = join(state, 'release-marker.json');
    const valid = JSON.parse(readFileSync(markerPath, 'utf8'));
    const invalid = {
      ...valid,
      records: {
        ...valid.records,
        shared: { ...valid.records.shared, selected_targets: ['omp'], binding_order: ['.omp'] }
      }
    };
    const invalidBytes = canonicalJsonBytes(invalid);
    writeAtomicFile(markerPath, invalidBytes);
    assert.throws(() => readOptionalPublicationMarker(markerPath));
    assert.deepEqual(readFileSync(markerPath), Buffer.from(invalidBytes));
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('legacy migration refuses an owner-only workspace collision without mutation', () => {
  const fixtureValue = fixture('evcrate-recovery-migrate-collision-');
  try {
    const { home, state } = fixtureValue;
    const workspace = directory(join(state, 'release-legacy-collision'));
    writeFileSync(join(workspace, 'unmanaged'), 'keep\n', { mode: 0o600 });
    const marker = {
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-collision', selected_targets: ['omp'],
      binding_order: ['.evcrate/bin', '.omp'],
      managed_paths: { '.evcrate/bin': [], '.omp': [] },
      previous_managed_paths: { '.evcrate/bin': [], '.omp': [] },
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'b'.repeat(64),
      transaction_dir: 'release-legacy-collision', retained_release_id: null
    };
    const original = canonicalJsonBytes(marker);
    writeAtomicFile(join(state, 'release-marker.json'), original);

    assert.throws(() => recoverAndMigrateHomeStateUnlocked(state, home));
    assert.deepEqual(readFileSync(join(state, 'release-marker.json')), Buffer.from(original));
    assert.equal(readFileSync(join(workspace, 'unmanaged'), 'utf8'), 'keep\n');
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});
test('legacy migration retries a durable cleanup intent after marker publication', () => {
  const fixtureValue = fixture('evcrate-recovery-migrate-retry-');
  try {
    const { home, state } = fixtureValue;
    writeAtomicFile(join(state, 'release-marker.json'), canonicalJsonBytes({
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-retry', selected_targets: [], binding_order: ['.evcrate/bin'],
      managed_paths: {}, previous_managed_paths: {},
      build_manifest_path: '.evcrate/build-manifest-omp.json', build_manifest_digest: 'c'.repeat(64),
      transaction_dir: 'release-legacy-retry', retained_release_id: null
    }));
    recoverAndMigrateHomeStateUnlocked(state, home);
    const markerPath = join(state, 'release-marker.json');
    const marker = readOptionalPublicationMarker(markerPath);
    const workspace = directory(join(state, 'release-legacy-retry'));
    const workspaceStat = lstatSync(workspace);
    const stateStat = lstatSync(state);
    writeAtomicFile(join(state, '.legacy-cleanup.json'), canonicalJsonBytes({
      schema_version: 1, scope: 'home', release_id: 'legacy-retry',
      destination_root: resolve(home), durable_state_root: resolve(state),
      workspace_root: resolve(workspace), workspace_name: 'release-legacy-retry',
      quarantine_root: join(state, '.release-legacy-retry.legacy-cleanup'),
      workspace_device: Number(workspaceStat.dev), workspace_inode: Number(workspaceStat.ino),
      parent_device: Number(stateStat.dev), parent_inode: Number(stateStat.ino),
      project_identity: null
    }));
    assert.equal(marker?.schema_version, 2);
    assert.equal(existsSync(workspace), true);
    recoverAndMigrateHomeStateUnlocked(state, home);
    assert.equal(existsSync(workspace), false);
    assert.equal(existsSync(join(state, '.legacy-cleanup.json')), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});


test('schema-2 shared journal rejects harness operations before destination mutation', () => {
  const fixtureValue = fixture('evcrate-recovery-v2-phase-');
  try {
    const { home, state } = fixtureValue;
    const { destination, transaction } = journalFor(home, state, 'promoting', 'new');
    const rawJournal = JSON.parse(readFileSync(join(state, 'publication-journal.json'), 'utf8'));
    const workspaceStat = lstatSync(transaction);
    const stateStat = lstatSync(state);
    const shared = {
      phase: 'shared', scope: 'home', status: 'promoting',
      release_id: rawJournal.release_id, selected_targets: [], binding_order: ['.evcrate/bin'],
      managed_paths: {}, previous_managed_paths: {},
      build_manifest_path: rawJournal.build_manifest_path,
      build_manifest_digest: rawJournal.build_manifest_digest,
      transaction_dir: rawJournal.transaction_dir, retained_release_id: null,
      destination_root: resolve(home), durable_state_root: resolve(state),
      workspace_root: resolve(transaction), workspace_name: rawJournal.transaction_dir,
      project_identity: null, retention: 'bounded-one-home-release'
    };
    const journal = {
      ...rawJournal, schema_version: 2, selected_targets: ['omp'],
      binding_order: ['.evcrate/bin', '.omp'], managed_paths: {}, previous_managed_paths: {},
      scope: 'home', destination_root: resolve(home), durable_state_root: resolve(state),
      workspace_root: resolve(transaction), workspace_name: rawJournal.transaction_dir,
      workspace_device: Number(workspaceStat.dev), workspace_inode: Number(workspaceStat.ino),
      workspace_parent_device: Number(stateStat.dev), workspace_parent_inode: Number(stateStat.ino),
      project_identity: null, retention: 'bounded-one-home-release', lock_paths: [join(state, 'publish.lock')],
      lock_order: ['home'], logical_phase: 'shared', records: { shared, harness: null }
    };
    writeAtomicFile(join(state, 'publication-journal.json'), canonicalJsonBytes(journal));
    writeAtomicFile(join(state, 'release-marker.json'), canonicalJsonBytes({
      schema_version: 2, transaction_type: 'target-publication', scope: 'home',
      records: { shared, harness: null }
    }));
    const original = readFileSync(destination);
    assert.throws(
      () => recoverPublicationUnlocked(state, home),
      (error) => error?.code === 'RECOVERY_FAILED' || error?.code === 'PATH_UNSAFE'
    );
    assert.deepEqual(readFileSync(destination), original);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('ambiguous schema-1 HOME ownership fails closed without rewriting the marker', () => {
  const fixtureValue = fixture('evcrate-recovery-migrate-invalid-');
  try {
    const { home, state } = fixtureValue;
    const marker = {
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'legacy-invalid', selected_targets: ['claude'],
      binding_order: ['.evcrate/bin', '.claude'],
      managed_paths: { '.omp': ['agent/wrong.md'] }, previous_managed_paths: {},
      build_manifest_path: '.evcrate/build-manifest-claude.json', build_manifest_digest: 'b'.repeat(64),
      transaction_dir: 'release-legacy-invalid', retained_release_id: null
    };
    const original = canonicalJsonBytes(marker);
    writeAtomicFile(join(state, 'release-marker.json'), original);

    assert.throws(() => recoverAndMigrateHomeStateUnlocked(state, home));
    assert.deepEqual(readFileSync(join(state, 'release-marker.json')), Buffer.from(original));
    assert.equal(JSON.parse(readFileSync(join(state, 'release-marker.json'), 'utf8')).schema_version, 1);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('valid in-progress schema-1 HOME state recovers before marker migration', () => {
  const fixtureValue = fixture('evcrate-recovery-migrate-progress-');
  try {
    const { home, state } = fixtureValue;
    const { destination } = journalFor(home, state, 'promoting', 'new');
    const result = recoverAndMigrateHomeStateUnlocked(state, home);
    assert.equal(result.action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    const marker = readOptionalPublicationMarker(join(state, 'release-marker.json'));
    assert.equal(marker?.schema_version, 2);
    assert.equal(marker?.records.shared.status, 'recovered');
    assert.equal(marker?.records.harness.status, 'recovered');
    assert.equal(existsSync(join(state, 'publication-journal.json')), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

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
      promoted: false
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

