import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  canonicalJsonBytes, hashBytes, readOptionalPublicationMarker, recoverPublicationUnlocked,
  recoverAndMigrateHomeStateUnlocked, recoverAndMigrateProjectStateUnlocked, writeAtomicFile,
  readPublicationJournal, normalizeTarget, validatePublishRequestPayload, validateRecoverResultPayload,
  createPublicationPlanSet, resolveInvocationContext, resolvePublicationProjectContext,
  runAllManifestsBuild, publicationStateRoot, publishDryRun, publishApply
} from '../../dist/index.js';
import { prepareFixtureWorkspace } from './parity-verification-helpers.mjs';

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

test('legacy mode-bearing schema-1 journal recovers and rolls back safely (F5 regression)', () => {
  const fixtureValue = fixture('evcrate-recovery-legacy-1-');
  const { home, state } = fixtureValue;
  try {
    const journalPath = join(state, 'publication-journal.json');
    const { journal, destination, transaction } = journalFor(home, state, 'staged', 'new');
    const backup0 = join(transaction, 'backups', '0');
    const statBackup = lstatSync(backup0);
    const statDest = lstatSync(destination);

    // Simulate authentic legacy mode-bearing schema-1 journal
    journal.operations[0] = {
      ...journal.operations[0],
      mode: 0o644,
      before: {
        present: true, kind: 'file', device: Number(statBackup.dev), inode: Number(statBackup.ino),
        mode: 0o600, size: Number(statBackup.size), hash: digest('old')
      },
      intended: {
        present: true, kind: 'file', device: Number(statDest.dev), inode: Number(statDest.ino),
        mode: 0o600, size: Number(statDest.size), hash: digest('new')
      }
    };
    journal.operations_digest = hashBytes(canonicalJsonBytes(journal.operations));
    writeAtomicFile(journalPath, canonicalJsonBytes(journal));

    const outcome = recoverPublicationUnlocked(state, home);
    assert.equal(outcome.action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    assert.equal(existsSync(journalPath), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('legacy mode-bearing schema-2 journal recovers and rolls back safely (F5 regression)', () => {
  const fixtureValue = fixture('evcrate-recovery-legacy-2-');
  const project = directory(join(fixtureValue.root, 'project'));
  const projectIdentity = 'a'.repeat(64);
  const projectState = directory(join(project, '.evcrate', 'project-publication', projectIdentity));
  const id = 'release-1';
  const workspaceName = `.evcrate-publish-${id}`;
  const transaction = directory(join(project, workspaceName));
  const backups = directory(join(transaction, 'backups'));
  writeAtomicFile(join(backups, '0'), text('old'));
  const destination = join(project, '.omp', 'agent', 'alpha.md');
  directory(join(project, '.omp', 'agent'));
  writeFileSync(destination, 'new');
  chmodSync(destination, 0o600);
  const statBackup = lstatSync(join(backups, '0'));
  const statDest = lstatSync(destination);

  try {
    const journalPath = join(projectState, 'publication-journal.json');
    const parentStat = lstatSync(project);
    const transStat = lstatSync(transaction);
    const manifestPath = '.evcrate/build-manifest-omp.json';
    const manifestDigest = 'a'.repeat(64);

    const operations = [{
      target: 'omp', binding: '.omp', local_root: '.omp', relative_path: 'agent/alpha.md',
      kind: 'file', action: 'update', destination: '.omp/agent/alpha.md', backup: 'backups/0',
      before: {
        present: true, kind: 'file', device: Number(statBackup.dev), inode: Number(statBackup.ino),
        mode: 0o600, size: Number(statBackup.size), hash: digest('old')
      },
      intendedHash: digest('new'),
      intended: {
        present: true, kind: 'file', device: Number(statDest.dev), inode: Number(statDest.ino),
        mode: 0o600, size: Number(statDest.size), hash: digest('new')
      },
      promoted: true,
      mode: 0o644
    }];
    const harness = {
      phase: 'harness', scope: 'project', status: 'promoting',
      release_id: id, selected_targets: ['omp'],
      binding_order: ['.omp'], managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath, build_manifest_digest: manifestDigest,
      transaction_dir: `release-${id}`, retained_release_id: null,
      destination_root: resolve(project), durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction), workspace_name: workspaceName,
      project_identity: projectIdentity, retention: 'none'
    };
    const journal = {
      schema_version: 2,
      transaction_type: 'target-publication',
      status: 'staged',
      release_id: id,
      home_root: resolve(project),
      transaction_dir: `release-${id}`,
      selected_targets: ['omp'],
      binding_order: ['.omp'],
      managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath,
      build_manifest_digest: manifestDigest,
      retained_release_id: null,
      retain_transaction: false,
      operation_count: 1,
      operations_digest: hashBytes(canonicalJsonBytes(operations)),
      operations,
      logical_phase: 'harness',
      records: { harness },
      scope: 'project',
      destination_root: resolve(project),
      durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction),
      workspace_name: workspaceName,
      workspace_device: Number(transStat.dev),
      workspace_inode: Number(transStat.ino),
      workspace_parent_device: Number(parentStat.dev),
      workspace_parent_inode: Number(parentStat.ino),
      project_identity: projectIdentity,
      retention: 'none',
      lock_paths: [join(projectState, 'publish.lock')],
      lock_order: ['project']
    };

    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    writeAtomicFile(join(projectState, 'release-marker.json'), canonicalJsonBytes({
      schema_version: 2, transaction_type: 'target-publication', scope: 'project',
      records: { harness: { ...harness, status: 'promoting' } }
    }));

    const outcome = recoverAndMigrateProjectStateUnlocked(projectState, project, projectIdentity);
    assert.equal(outcome.action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old');
    assert.equal(existsSync(journalPath), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('schema-3 mode-free journal recovers and rolls back safely with records preserved (F5 regression)', () => {
  const fixtureValue = fixture('evcrate-recovery-v3-');
  const project = directory(join(fixtureValue.root, 'project'));
  const projectIdentity = 'b'.repeat(64);
  const projectState = directory(join(project, '.evcrate', 'project-publication', projectIdentity));
  const id = 'release-1';
  const workspaceName = `.evcrate-publish-${id}`;
  const transaction = directory(join(project, workspaceName));
  const backups = directory(join(transaction, 'backups'));
  writeAtomicFile(join(backups, '0'), text('old-v3'));
  const destination = join(project, '.omp', 'agent', 'alpha.md');
  directory(join(project, '.omp', 'agent'));
  writeFileSync(destination, 'new-v3');
  chmodSync(destination, 0o600);
  const statBackup = lstatSync(join(backups, '0'));
  const statDest = lstatSync(destination);

  try {
    const journalPath = join(projectState, 'publication-journal.json');
    const parentStat = lstatSync(project);
    const transStat = lstatSync(transaction);
    const manifestPath = '.evcrate/build-manifest-omp.json';
    const manifestDigest = 'b'.repeat(64);

    const operations = [{
      target: 'omp', binding: '.omp', local_root: '.omp', relative_path: 'agent/alpha.md',
      kind: 'file', action: 'update', destination: '.omp/agent/alpha.md', backup: 'backups/0',
      before: {
        present: true, kind: 'file', device: Number(statBackup.dev), inode: Number(statBackup.ino),
        size: Number(statBackup.size), hash: digest('old-v3')
      },
      intendedHash: digest('new-v3'),
      intended: {
        present: true, kind: 'file', device: Number(statDest.dev), inode: Number(statDest.ino),
        size: Number(statDest.size), hash: digest('new-v3')
      },
      promoted: true
    }];
    const harness = {
      phase: 'harness', scope: 'project', status: 'promoting',
      release_id: id, selected_targets: ['omp'],
      binding_order: ['.omp'], managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath, build_manifest_digest: manifestDigest,
      transaction_dir: `release-${id}`, retained_release_id: null,
      destination_root: resolve(project), durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction), workspace_name: workspaceName,
      project_identity: projectIdentity, retention: 'none'
    };
    const journal = {
      schema_version: 3,
      transaction_type: 'target-publication',
      status: 'staged',
      release_id: id,
      home_root: resolve(project),
      transaction_dir: `release-${id}`,
      selected_targets: ['omp'],
      binding_order: ['.omp'],
      managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath,
      build_manifest_digest: manifestDigest,
      retained_release_id: null,
      retain_transaction: false,
      operation_count: 1,
      operations_digest: hashBytes(canonicalJsonBytes(operations)),
      operations,
      logical_phase: 'harness',
      records: { harness },
      scope: 'project',
      destination_root: resolve(project),
      durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction),
      workspace_name: workspaceName,
      workspace_device: Number(transStat.dev),
      workspace_inode: Number(transStat.ino),
      workspace_parent_device: Number(parentStat.dev),
      workspace_parent_inode: Number(parentStat.ino),
      project_identity: projectIdentity,
      retention: 'none',
      lock_paths: [join(projectState, 'publish.lock')],
      lock_order: ['project']
    };

    writeAtomicFile(journalPath, canonicalJsonBytes(journal));
    writeAtomicFile(join(projectState, 'release-marker.json'), canonicalJsonBytes({
      schema_version: 2, transaction_type: 'target-publication', scope: 'project',
      records: { harness: { ...harness, status: 'promoting' } }
    }));

    const outcome = recoverAndMigrateProjectStateUnlocked(projectState, project, projectIdentity);
    assert.equal(outcome.action, 'rolled-back');
    assert.equal(readFileSync(destination, 'utf8'), 'old-v3');
    assert.equal(existsSync(journalPath), false);
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

test('schema-3 journal containing mode property is rejected (F5 regression)', () => {
  const fixtureValue = fixture('evcrate-recovery-v3-neg-');
  const project = directory(join(fixtureValue.root, 'project'));
  const projectIdentity = 'c'.repeat(64);
  const projectState = directory(join(project, '.evcrate', 'project-publication', projectIdentity));
  const id = 'release-1';
  const workspaceName = `.evcrate-publish-${id}`;
  const transaction = directory(join(project, workspaceName));
  const backups = directory(join(transaction, 'backups'));
  writeAtomicFile(join(backups, '0'), text('old-v3'));
  const destination = join(project, '.omp', 'agent', 'alpha.md');
  directory(join(project, '.omp', 'agent'));
  writeFileSync(destination, 'new-v3');
  chmodSync(destination, 0o600);
  const statBackup = lstatSync(join(backups, '0'));
  const statDest = lstatSync(destination);

  try {
    const journalPath = join(projectState, 'publication-journal.json');
    const parentStat = lstatSync(project);
    const transStat = lstatSync(transaction);
    const manifestPath = '.evcrate/build-manifest-omp.json';
    const manifestDigest = 'c'.repeat(64);

    // Schema 3 operation MUST NOT contain mode property
    const operations = [{
      target: 'omp', binding: '.omp', local_root: '.omp', relative_path: 'agent/alpha.md',
      kind: 'file', action: 'update', destination: '.omp/agent/alpha.md', backup: 'backups/0',
      before: {
        present: true, kind: 'file', device: Number(statBackup.dev), inode: Number(statBackup.ino),
        size: Number(statBackup.size), hash: digest('old-v3'), mode: 0o644
      },
      intendedHash: digest('new-v3'),
      intended: {
        present: true, kind: 'file', device: Number(statDest.dev), inode: Number(statDest.ino),
        size: Number(statDest.size), hash: digest('new-v3')
      },
      promoted: true
    }];
    const harness = {
      phase: 'harness', scope: 'project', status: 'promoting',
      release_id: id, selected_targets: ['omp'],
      binding_order: ['.omp'], managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath, build_manifest_digest: manifestDigest,
      transaction_dir: `release-${id}`, retained_release_id: null,
      destination_root: resolve(project), durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction), workspace_name: workspaceName,
      project_identity: projectIdentity, retention: 'none'
    };
    const journal = {
      schema_version: 3,
      transaction_type: 'target-publication',
      status: 'staged',
      release_id: id,
      home_root: resolve(project),
      transaction_dir: `release-${id}`,
      selected_targets: ['omp'],
      binding_order: ['.omp'],
      managed_paths: { omp: { '.omp': ['agent/alpha.md'] } },
      previous_managed_paths: {},
      build_manifest_path: manifestPath,
      build_manifest_digest: manifestDigest,
      retained_release_id: null,
      retain_transaction: false,
      operation_count: 1,
      operations_digest: hashBytes(canonicalJsonBytes(operations)),
      operations,
      logical_phase: 'harness',
      records: { harness },
      scope: 'project',
      destination_root: resolve(project),
      durable_state_root: resolve(projectState),
      workspace_root: resolve(transaction),
      workspace_name: workspaceName,
      workspace_device: Number(transStat.dev),
      workspace_inode: Number(transStat.ino),
      workspace_parent_device: Number(parentStat.dev),
      workspace_parent_inode: Number(parentStat.ino),
      project_identity: projectIdentity,
      retention: 'none',
      lock_paths: [join(projectState, 'publish.lock')],
      lock_order: ['project']
    };

    writeAtomicFile(journalPath, canonicalJsonBytes(journal));

    assert.throws(
      () => recoverAndMigrateProjectStateUnlocked(projectState, project, projectIdentity),
      (error) => error?.code === 'RECOVERY_FAILED'
    );
  } finally {
    rmSync(fixtureValue.root, { recursive: true, force: true });
  }
});

// Predecessor layouts are from 768fbb5e:src/protocol/publication-payloads.ts.
// Fixtures record the old bytes/identities, rather than generating state through current selectors.
function recordedMarker(destination, state, scope, selected, bindings, ownership, status = 'complete') {
  const release = 'predecessor';
  const workspaceName = scope === 'home' ? `release-${release}` : `.evcrate-publish-${release}`;
  const harness = {
    phase: 'harness', scope, status, release_id: release,
    selected_targets: selected, binding_order: bindings,
    managed_paths: ownership, previous_managed_paths: structuredClone(ownership),
    build_manifest_path: '.evcrate/build-manifest.json', build_manifest_digest: 'a'.repeat(64),
    transaction_dir: `release-${release}`, retained_release_id: null,
    destination_root: resolve(destination), durable_state_root: resolve(state),
    workspace_root: join(scope === 'home' ? state : destination, workspaceName),
    workspace_name: workspaceName, project_identity: scope === 'home' ? null : 'b'.repeat(64),
    retention: scope === 'home' ? 'bounded-one-home-release' : 'none'
  };
  return {
    schema_version: 2, transaction_type: 'target-publication', scope,
    records: scope === 'home' ? {
      shared: { ...harness, phase: 'shared', selected_targets: [], binding_order: ['.evcrate/bin'],
        managed_paths: {}, previous_managed_paths: {} },
      harness
    } : { harness }
  };
}

test('marker reader retains current and exact predecessor HOME/project ownership without aliases', () => {
  const value = fixture('evcrate-predecessor-markers-');
  try {
    for (const [scope, selected, bindings, ownership] of [
      ['home', ['codex'], ['.agents/skills', '.codex'], { codex: { '.agents/skills': ['owned.md'], '.codex': ['AGENTS.md'] } }],
      ['home', ['codex'], ['.agents', '.codex'], { codex: { '.agents': ['skills/owned.md'], '.codex': ['AGENTS.md'] } }],
      ['home', ['gemini'], ['.gemini'], { gemini: { '.gemini': ['GEMINI.md'] } }],
      ['project', ['codex', 'antigravity', 'copilot', 'gemini'],
        ['.codex', '.agents', 'AGENTS.md', '.antigravity', '.copilot', '.gemini', 'GEMINI.md'],
        { codex: { '.agents': ['skills/owned.md'], '.codex': ['config.toml'], 'AGENTS.md': ['AGENTS.md'] },
          antigravity: { '.antigravity': ['AGENTS.md'] }, copilot: { '.copilot': ['instructions.md'] },
          gemini: { '.gemini': ['settings.json'], 'GEMINI.md': ['GEMINI.md'] } }]
    ]) {
      const marker = recordedMarker(value.home, value.state, scope, selected, bindings, ownership);
      const path = join(value.state, 'release-marker.json');
      const bytes = canonicalJsonBytes(marker);
      writeAtomicFile(path, bytes);
      assert.deepEqual(readOptionalPublicationMarker(path), marker);
      const result = scope === 'home'
        ? recoverAndMigrateHomeStateUnlocked(value.state, value.home)
        : recoverAndMigrateProjectStateUnlocked(value.state, value.home, 'b'.repeat(64));
      assert.equal(result.action, 'none');
      assert.deepEqual(readFileSync(path), Buffer.from(bytes), 'reading historical state must not relabel ownership');
    }
    assert.throws(() => normalizeTarget('gemini'));
    assert.throws(() => validatePublishRequestPayload({ scope: 'home', selectedTargets: ['gemini'] }));
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('predecessor marker reader rejects mixed layouts, unknown and unselected owners, duplicates and traversal', () => {
  const value = fixture('evcrate-predecessor-marker-refusal-');
  try {
    const valid = recordedMarker(value.home, value.state, 'home', ['codex'], ['.agents', '.codex'],
      { codex: { '.agents': ['skills/owned.md'], '.codex': ['AGENTS.md'] } });
    for (const mutate of [
      (record) => { record.binding_order = ['.agents', '.agents/skills', '.codex']; },
      (record) => { record.managed_paths.codex['.agents/skills'] = ['owned.md']; },
      (record) => { record.managed_paths.codex['.unknown'] = ['owned.md']; },
      (record) => { record.managed_paths.omp = { '.omp': ['owned.md'] }; },
      (record) => { record.selected_targets.push('codex'); },
      (record) => { record.selected_targets = ['not-a-target']; },
      (record) => { record.managed_paths.codex['.agents'].push('skills/owned.md'); },
      (record) => { record.previous_managed_paths.codex['.agents'] = ['../escape']; }
    ]) {
      const marker = structuredClone(valid);
      mutate(marker.records.harness);
      const bytes = canonicalJsonBytes(marker);
      const path = join(value.state, 'release-marker.json');
      writeAtomicFile(path, bytes);
      assert.throws(() => readOptionalPublicationMarker(path));
      assert.deepEqual(readFileSync(path), Buffer.from(bytes));
    }
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

function recordedJournal(value, scope, target, binding, bindings, status) {
  const destinationRoot = scope === 'home' ? value.home : directory(join(value.root, 'project'));
  const document = scope === 'project' && ['AGENTS.md', 'GEMINI.md'].includes(binding);
  const relativePath = document ? binding : binding === '.agents' ? 'skills/owned.md' : 'owned.md';
  const ownership = { [target]: { [binding]: [relativePath] } };
  const marker = recordedMarker(destinationRoot, value.state, scope, [target], bindings, ownership, 'promoting');
  const record = marker.records.harness;
  const transaction = directory(record.workspace_root);
  const backup = join(directory(join(transaction, 'backups')), '0');
  writeAtomicFile(backup, text('old owned bytes'));
  const destinationPath = document ? binding : `${binding}/${relativePath}`;
  const destination = join(destinationRoot, destinationPath);
  directory(dirname(destination));
  writeAtomicFile(destination, text('new owned bytes'));
  const user = join(document ? destinationRoot : join(destinationRoot, binding), 'user-owned.md');
  writeAtomicFile(user, text('untouched user bytes'));
  const operations = [{
    target, binding, local_root: target === 'antigravity' && scope === 'home' ? '.antigravity' : binding,
    relative_path: relativePath, kind: 'file', action: 'update',
    destination: destinationPath, backup: 'backups/0',
    before: { ...fileSnapshot(backup, digest('old owned bytes')), mode: 0o600 },
    intendedHash: digest('new owned bytes'),
    intended: { ...fileSnapshot(destination, digest('new owned bytes')), mode: 0o600 },
    promoted: true
  }];
  if (scope === 'home') operations.push({
    target: 'advisor-controller', binding: '.evcrate/bin', local_root: '.evcrate/bin',
    relative_path: '.evcrate/bin', kind: 'directory', action: 'noop', destination: '.evcrate/bin',
    backup: null, before: { present: false }, intendedHash: null, intended: null, promoted: false
  });
  directory(join(transaction, 'progress'));
  writeAtomicFile(join(transaction, 'progress', '0.json'), canonicalJsonBytes({
    index: 0, promoted: true, intended: operations[0].intended
  }));
  const workspace = lstatSync(transaction);
  const parent = lstatSync(dirname(transaction));
  const journal = {
    schema_version: 2, transaction_type: 'target-publication', status,
    release_id: record.release_id, home_root: resolve(destinationRoot), transaction_dir: record.transaction_dir,
    selected_targets: [target], binding_order: scope === 'home' ? ['.evcrate/bin', ...bindings] : bindings,
    previous_managed_paths: ownership, managed_paths: ownership,
    build_manifest_path: record.build_manifest_path, build_manifest_digest: record.build_manifest_digest,
    retained_release_id: null, retain_transaction: false, operation_count: operations.length,
    operations_digest: hashBytes(canonicalJsonBytes(operations)), operations,
    scope, destination_root: resolve(destinationRoot), durable_state_root: resolve(value.state),
    workspace_root: transaction, workspace_name: record.workspace_name,
    workspace_device: Number(workspace.dev), workspace_inode: Number(workspace.ino),
    workspace_parent_device: Number(parent.dev), workspace_parent_inode: Number(parent.ino),
    project_identity: record.project_identity, retention: record.retention,
    lock_paths: [join(value.state, 'publish.lock')], lock_order: [scope],
    logical_phase: scope === 'home' ? 'combined' : 'harness', records: marker.records
  };
  writeAtomicFile(join(value.state, 'release-marker.json'), canonicalJsonBytes(marker));
  writeAtomicFile(join(value.state, 'publication-journal.json'), canonicalJsonBytes(journal));
  return { journal, destinationRoot, destination, user, backup, before: operations[0].before };
}

test('completed and interrupted predecessor journals recover original identities and retain historical ownership', () => {
  for (const [scope, target, binding, bindings] of [
    ['home', 'codex', '.agents', ['.agents', '.codex']],
    ['home', 'gemini', '.gemini', ['.gemini']],
    ['project', 'codex', '.agents', ['.codex', '.agents', 'AGENTS.md']],
    ['project', 'codex', 'AGENTS.md', ['.codex', '.agents', 'AGENTS.md']],
    ['project', 'antigravity', '.antigravity', ['.antigravity']],
    ['project', 'copilot', '.copilot', ['.copilot']],
    ['project', 'gemini', '.gemini', ['.gemini', 'GEMINI.md']],
    ['project', 'gemini', 'GEMINI.md', ['.gemini', 'GEMINI.md']]
  ]) {
    for (const status of ['committed', 'promoting']) {
      const value = fixture('evcrate-predecessor-recover-');
      try {
        const item = recordedJournal(value, scope, target, binding, bindings, status);
        const decoded = readPublicationJournal(value.state);
        assert.equal(decoded.operations_digest, item.journal.operations_digest, 'raw operation digest survives decoding/progress overlays');
        assert.deepEqual(decoded.managed_paths, item.journal.managed_paths);
        const outcome = scope === 'home'
          ? recoverAndMigrateHomeStateUnlocked(value.state, item.destinationRoot)
          : recoverAndMigrateProjectStateUnlocked(value.state, item.destinationRoot, 'b'.repeat(64));
        assert.equal(outcome.action, status === 'committed' ? 'finalized' : 'rolled-back');
        assert.deepEqual(outcome.selectedTargets, [target]);
        assert.deepEqual(outcome.bindingOrder, item.journal.binding_order);
        assert.equal(readFileSync(item.destination, 'utf8'), status === 'committed' ? 'new owned bytes' : 'old owned bytes');
        assert.equal(readFileSync(item.user, 'utf8'), 'untouched user bytes');
        if (status === 'promoting') {
          const { mode, ...before } = item.before;
          assert.deepEqual(fileSnapshot(item.destination, digest('old owned bytes')), before);
        }
        const marker = readOptionalPublicationMarker(join(value.state, 'release-marker.json'));
        assert.deepEqual(marker.records.harness.managed_paths, item.journal.managed_paths);
        const phases = [{
          phase: 'harness', scope, releaseId: outcome.releaseId, action: outcome.action,
          selectedTargets: [target], bindingOrder: bindings
        }];
        if (scope === 'home') phases.unshift({
          phase: 'shared', scope: 'home', releaseId: outcome.releaseId, action: outcome.action,
          selectedTargets: [], bindingOrder: ['.evcrate/bin']
        });
        assert.deepEqual(validateRecoverResultPayload({
          scope, projectIdentity: scope === 'home' ? null : 'b'.repeat(64), action: 'recovered', phases
        }).phases, phases, 'public recovery result reports historical targets, not current registration');
        assert.equal(existsSync(join(value.state, 'publication-journal.json')), false);
      } finally {
        rmSync(value.root, { recursive: true, force: true });
      }
    }
  }
});

test('historical recovery refuses forged operations and CAS changes before touching user files', () => {
  for (const mutate of [
    (journal) => { journal.operations[0].local_root = '.agents/skills'; },
    (journal) => { journal.operations[0].binding = '.unknown'; },
    (journal) => { journal.operations[0].target = 'omp'; },
    (journal) => { journal.operations[0].relative_path = '../escape'; },
    (journal) => { journal.binding_order = ['.evcrate/bin', '.agents/skills', '.codex']; },
    (journal) => { journal.managed_paths = { codex: { '.agents/skills': ['owned.md'] } }; },
    (journal) => { journal.records.harness = { ...journal.records.harness, selected_targets: ['omp'], binding_order: ['.omp'] }; },
    (journal) => { journal.operations.push(structuredClone(journal.operations[0])); },
    (_journal, item) => { writeFileSync(item.destination, 'user changed destination'); }
  ]) {
    const value = fixture('evcrate-predecessor-refusal-');
    try {
      const item = recordedJournal(value, 'home', 'codex', '.agents', ['.agents', '.codex'], 'promoting');
      mutate(item.journal, item);
      item.journal.operation_count = item.journal.operations.length;
      item.journal.operations_digest = hashBytes(canonicalJsonBytes(item.journal.operations));
      const journalBytes = canonicalJsonBytes(item.journal);
      writeAtomicFile(join(value.state, 'publication-journal.json'), journalBytes);
      const destinationBytes = readFileSync(item.destination);
      assert.throws(() => recoverAndMigrateHomeStateUnlocked(value.state, value.home));
      assert.deepEqual(readFileSync(item.destination), destinationBytes);
      assert.equal(readFileSync(item.user, 'utf8'), 'untouched user bytes');
      assert.equal(readFileSync(item.backup, 'utf8'), 'old owned bytes');
      assert.deepEqual(readFileSync(join(value.state, 'publication-journal.json')), Buffer.from(journalBytes));
    } finally {
      rmSync(value.root, { recursive: true, force: true });
    }
  }
});

test('historical marker and recovery reject symlink substitution', { skip: process.platform === 'win32' }, () => {
  const value = fixture('evcrate-predecessor-symlink-');
  try {
    const item = recordedJournal(value, 'home', 'codex', '.agents', ['.agents', '.codex'], 'promoting');
    const markerPath = join(value.state, 'release-marker.json');
    const realMarker = join(value.state, 'saved-marker.json');
    writeAtomicFile(realMarker, readFileSync(markerPath));
    rmSync(markerPath);
    symlinkSync(realMarker, markerPath);
    assert.throws(() => readOptionalPublicationMarker(markerPath), (error) => error?.code === 'PATH_UNSAFE');
    rmSync(markerPath);
    writeAtomicFile(markerPath, readFileSync(realMarker));
    rmSync(item.destination);
    symlinkSync(item.user, item.destination);
    assert.throws(() => recoverAndMigrateHomeStateUnlocked(value.state, value.home), (error) => error?.code === 'PATH_UNSAFE');
    assert.equal(readFileSync(item.user, 'utf8'), 'untouched user bytes');
    assert.equal(readFileSync(item.backup, 'utf8'), 'old owned bytes');
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('schema-1 predecessor migration preserves Codex root mapping and retired Gemini ownership', () => {
  const value = fixture('evcrate-predecessor-flat-migration-');
  try {
    const legacy = {
      schema_version: 1, status: 'complete', transaction_type: 'target-publication',
      release_id: 'flat-predecessor', selected_targets: ['codex', 'gemini', 'antigravity'],
      binding_order: ['.evcrate/bin', '.gemini', '.agents', '.codex', '.gemini/config'],
      managed_paths: {
        '.evcrate/bin': [], '.codex': ['config.toml'], '.agents': ['skills/owned.md', 'rules/old.md'],
        '.gemini': ['GEMINI.md'], '.antigravity': ['AGENTS.md']
      },
      previous_managed_paths: { '.codex': ['previous.toml'], '.agents': ['skills/previous.md'] },
      build_manifest_path: '.evcrate/build-manifest.json', build_manifest_digest: 'a'.repeat(64),
      transaction_dir: 'release-flat-predecessor', retained_release_id: null
    };
    const path = join(value.state, 'release-marker.json');
    writeAtomicFile(path, canonicalJsonBytes(legacy));
    assert.deepEqual(readOptionalPublicationMarker(path), legacy);
    recoverAndMigrateHomeStateUnlocked(value.state, value.home);
    const migrated = readOptionalPublicationMarker(path).records.harness;
    assert.deepEqual(migrated.selected_targets, legacy.selected_targets);
    assert.deepEqual(migrated.binding_order, legacy.binding_order.slice(1));
    assert.deepEqual(migrated.managed_paths, {
      codex: { '.codex': ['config.toml'], '.agents': ['skills/owned.md', 'rules/old.md'] },
      gemini: { '.gemini': ['GEMINI.md'] }, antigravity: { '.gemini/config': ['AGENTS.md'] }
    });
    assert.deepEqual(migrated.previous_managed_paths, {
      codex: { '.codex': ['previous.toml'], '.agents': ['skills/previous.md'] }
    });
    assert.equal(recoverAndMigrateHomeStateUnlocked(value.state, value.home).action, 'none');
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('current publication consumes predecessor ownership without pruning leftovers or broadening parents', async () => {
  const root = mkdtempSync(join(tmpdir(), 'evcrate-predecessor-planner-'));
  const packageRoot = join(root, 'package');
  try {
    prepareFixtureWorkspace(packageRoot);
    await runAllManifestsBuild(packageRoot, { jobs: 2 });
    for (const scope of ['home', 'project']) {
      const home = directory(join(root, `${scope}-home`));
      const project = directory(join(root, `${scope}-project`));
      const context = resolveInvocationContext({
        packageRoot, cwd: packageRoot, home, projectRoot: project, targets: ['codex']
      });
      const destination = scope === 'home' ? home : project;
      const identity = scope === 'home' ? null : resolvePublicationProjectContext(context).projectIdentity;
      const state = directory(scope === 'home' ? publicationStateRoot(home)
        : join(context.stateRoot, 'project-publication', identity));
      const emptyPlan = createPublicationPlanSet(context, { scope });
      const skill = emptyPlan.harness.bindings.find(({ binding }) => binding === '.agents/skills').operations[0];
      assert.ok(skill, 'fixture must contain a generated Codex skill leaf');
      directory(dirname(skill.destination));
      writeAtomicFile(skill.destination, text('previous managed skill'));
      const ownership = {
        codex: { '.agents': [`skills/${skill.relativePath}`, 'skills/retired.md', 'rules/retired.md'], '.codex': [] },
        gemini: { '.gemini': ['GEMINI.md'] }
      };
      const bindings = scope === 'home' ? ['.gemini', '.agents', '.codex']
        : ['.codex', '.agents', 'AGENTS.md', '.gemini', 'GEMINI.md'];
      const marker = recordedMarker(destination, state, scope, ['codex', 'gemini'], bindings, ownership);
      marker.records.harness.project_identity = identity;
      const markerPath = join(state, 'release-marker.json');
      // Project's old flat schema must survive preflight before locked migration.
      const stored = scope === 'home' ? marker : {
        schema_version: 1, transaction_type: 'target-publication',
        ...Object.fromEntries(Object.entries(marker.records.harness).filter(([key]) => key !== 'phase')),
        managed_paths: { '.agents': ownership.codex['.agents'], '.codex': [], '.gemini': ['GEMINI.md'] },
        previous_managed_paths: {}
      };
      writeAtomicFile(markerPath, canonicalJsonBytes(stored));
      const preserved = [
        '.agents/skills/retired.md', '.agents/rules/retired.md', '.gemini/GEMINI.md',
        '.agents/rules/user.md', '.gemini/vendor-user.txt', '.github/workflows/user.yml'
      ].map((relativePath) => {
        const path = join(destination, relativePath);
        directory(dirname(path));
        writeAtomicFile(path, text(`keep ${relativePath}`));
        return [path, readFileSync(path)];
      });
      const before = readFileSync(markerPath);
      const preview = publishDryRun(context, { scope, selectedTargets: ['codex'] });
      const change = preview.phases[1].changes.find(({ path }) => path === `.agents/skills/${skill.relativePath}`);
      assert.equal(change.action, 'update', 'old recorded skills authorize their current leaf, not an unmanaged collision');
      assert.deepEqual(readFileSync(markerPath), before, 'dry-run must preserve historical record bytes');
      assert.ok(preview.phases[1].changes.every(({ path }) => path !== '.agents' && !path.startsWith('.gemini/')));
      assert.equal(preview.phases[1].changes.some(({ action }) => action === 'delete'), false);
      publishApply(context, {}, { scope, selectedTargets: ['codex'] });
      const current = readOptionalPublicationMarker(markerPath).records.harness;
      assert.deepEqual(current.selected_targets, ['codex']);
      assert.ok(current.binding_order.includes('.agents/skills'));
      assert.equal(current.binding_order.includes('.agents'), false);
      assert.deepEqual(current.previous_managed_paths, ownership);
      assert.deepEqual(current.managed_paths.codex['.agents'], ['skills/retired.md', 'rules/retired.md']);
      assert.ok(current.managed_paths.codex['.agents/skills'].includes(skill.relativePath));
      assert.deepEqual(current.managed_paths.gemini, ownership.gemini);
      for (const [path, bytes] of preserved) assert.deepEqual(readFileSync(path), bytes);
      // The next consumer must accept residual ownership, not just the first transition.
      publishApply(context, {}, { scope, selectedTargets: ['codex'] });
      const next = readOptionalPublicationMarker(markerPath).records.harness;
      assert.deepEqual(next.managed_paths, current.managed_paths);
      for (const [path, bytes] of preserved) assert.deepEqual(readFileSync(path), bytes);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('current markers retain only disjoint inherited predecessor residuals', () => {
  const value = fixture('evcrate-predecessor-residual-');
  try {
    const prior = {
      codex: { '.agents': ['skills/owned.md', 'rules/old.md'] },
      gemini: { '.gemini': ['GEMINI.md'] }
    };
    const ownership = {
      codex: { '.agents/skills': ['owned.md'], '.agents': ['rules/old.md'] },
      gemini: { '.gemini': ['GEMINI.md'] }
    };
    const marker = recordedMarker(value.home, value.state, 'home', ['codex'],
      ['.agents/skills', '.codex'], ownership);
    marker.records.harness.previous_managed_paths = prior;
    const path = join(value.state, 'release-marker.json');
    writeAtomicFile(path, canonicalJsonBytes(marker));
    assert.deepEqual(readOptionalPublicationMarker(path), marker);
    for (const mutate of [
      (record) => { record.managed_paths.codex['.agents'].push('skills/owned.md'); },
      (record) => { record.managed_paths.codex['.agents'].push('rules/new-claim.md'); },
      (record) => { record.managed_paths.gemini['.gemini'].push('new-claim.md'); },
      (record) => { record.previous_managed_paths.codex['.agents/skills'] = ['owned.md']; }
    ]) {
      const malformed = structuredClone(marker);
      mutate(malformed.records.harness);
      writeAtomicFile(path, canonicalJsonBytes(malformed));
      assert.throws(() => readOptionalPublicationMarker(path));
    }
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
