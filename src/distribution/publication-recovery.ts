import { lstatSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  MAX_PUBLICATION_CHANGES, MAX_PUBLICATION_STATE_BYTES, PUBLICATION_BINDING_ORDER, PUBLICATION_CHANGE_ACTIONS,
  PUBLICATION_LOCAL_ROOTS, PUBLICATION_TARGET_BINDINGS, PUBLICATION_TARGET_LOCAL_ROOTS,
  type PublicationChangeAction, type PublicationTarget
} from '../protocol/publication-payloads.js';
import {
  assertNoSymlinkAncestors, assertOwnerControlledDirectory, assertOwnerOnlyDirectory,
  assertOwnerOnlyFile, containedPath, normalizeRelativePath
} from '../filesystem/paths.js';
import { canonicalJsonBytes, hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, syncDirectory } from '../filesystem/atomic.js';
import {
  publicationNode, publicationSnapshot, readOptionalPublicationMarker,
  type PublicationNodeSnapshot
} from './publication-inventory.js';
import { writeReleaseMarker, RELEASE_MARKER_NAME } from '../filesystem/locking.js';

export const PUBLICATION_JOURNAL_NAME = 'publication-journal.json';
export interface PublicationJournalOperation {
  readonly target: PublicationTarget; readonly binding: string; readonly localRoot: string;
  readonly relativePath: string; readonly kind: 'file' | 'directory';
  readonly action: PublicationChangeAction; readonly destination: string; readonly backup: string | null;
  readonly before: PublicationNodeSnapshot; readonly intendedHash: string | null;
  readonly intended: PublicationNodeSnapshot | null; readonly promoted: boolean;
}
export interface PublicationJournal {
  readonly schema_version: 1; readonly transaction_type: 'target-publication';
  readonly status: 'staged' | 'promoting' | 'committed'; readonly release_id: string; readonly home_root: string;
  readonly transaction_dir: string; readonly selected_targets: readonly PersistedTarget[]; readonly binding_order: readonly string[];
  readonly previous_managed_paths: Record<string, unknown>; readonly managed_paths: Record<string, unknown>;
  readonly build_manifest_path: string; readonly build_manifest_digest: string;
  readonly retained_release_id: string | null; readonly retain_transaction: boolean;
  readonly operation_count: number; readonly operations_digest: string;
  readonly operations: readonly PublicationJournalOperation[];
}
export interface PublicationRecoveryOutcome {
  readonly action: 'none' | 'rolled-back' | 'finalized'; readonly releaseId: string | null;
  readonly selectedTargets: readonly PersistedTarget[]; readonly bindingOrder: readonly string[];
}
function fail(code: 'RECOVERY_FAILED' | 'PATH_UNSAFE' = 'RECOVERY_FAILED'): never { throw new ControlPlaneError(code); }
function hash(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail();
  return value;
}
function snapshot(path: string, controller = false): PublicationNodeSnapshot {
  return publicationSnapshot(path, controller);
}
function same(left: PublicationNodeSnapshot, right: PublicationNodeSnapshot): boolean {
  return ['present', 'kind', 'device', 'inode', 'size', 'mode', 'hash']
    .every((key) => left[key as keyof PublicationNodeSnapshot] === right[key as keyof PublicationNodeSnapshot]);
}
function sameContent(left: PublicationNodeSnapshot, right: PublicationNodeSnapshot): boolean {
  return left.present === right.present && left.kind === right.kind && left.hash === right.hash;
}
function relativePath(value: unknown): string {
  try { return normalizeRelativePath(value); } catch { fail(); }
}
function releaseId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) fail();
  return value;
}
function safeInteger(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) fail();
  return value;
}
function targets(value: unknown): readonly PersistedTarget[] {
  if (!Array.isArray(value) || !value.length) fail();
  try {
    const result = value.map((entry) => normalizeTarget(entry));
    if (new Set(result).size !== result.length) fail();
    return Object.freeze(result);
  } catch { fail(); }
}
function expectedBindings(selectedTargets: readonly PersistedTarget[]): readonly string[] {
  const names = new Set<string>(['.evcrate/bin']);
  for (const target of selectedTargets) {
    const bindings = PUBLICATION_TARGET_BINDINGS[target];
    if (!bindings) fail();
    for (const binding of bindings) {
      if (names.has(binding)) fail();
      names.add(binding);
    }
  }
  return Object.freeze(PUBLICATION_BINDING_ORDER.filter((binding) => names.has(binding)));
}
function order(value: unknown, selectedTargets: readonly PersistedTarget[]): readonly string[] {
  if (!Array.isArray(value) || value.length > PUBLICATION_BINDING_ORDER.length) fail();
  const result = value.map(relativePath);
  const expected = expectedBindings(selectedTargets);
  if (result.length !== expected.length || result.some((binding, index) => binding !== expected[index])) fail();
  return Object.freeze(result);
}
function managed(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) fail();
  const result: Record<string, unknown> = {};
  const known = new Set<string>(PUBLICATION_LOCAL_ROOTS);
  for (const [rawKey, rawValues] of Object.entries(value)) {
    const key = relativePath(rawKey);
    if (!known.has(key) || !Array.isArray(rawValues)) fail();
    const values = rawValues.map(relativePath);
    if (new Set(values).size !== values.length) fail();
    result[key] = Object.freeze(values);
  }
  return Object.freeze(result);
}
function node(value: unknown): PublicationNodeSnapshot {
  if (!isPlainObject(value)) fail();
  const allowed = ['present', 'kind', 'device', 'inode', 'size', 'mode', 'hash'];
  if (Object.keys(value).some((key) => !allowed.includes(key)) || typeof value.present !== 'boolean') fail();
  if (!value.present) {
    if (Object.keys(value).length !== 1) fail();
    return Object.freeze({ present: false });
  }
  if (Object.keys(value).length !== allowed.length || (value.kind !== 'file' && value.kind !== 'directory')) fail();
  const device = safeInteger(value.device, Number.MAX_SAFE_INTEGER);
  const inode = safeInteger(value.inode, Number.MAX_SAFE_INTEGER);
  const size = safeInteger(value.size, Number.MAX_SAFE_INTEGER);
  const mode = safeInteger(value.mode, 0o777);
  const digest = hash(value.hash);
  if (digest === null) fail();
  return Object.freeze({ present: true, kind: value.kind, device, inode, size, mode, hash: digest });
}
function mutation(action: PublicationChangeAction): boolean {
  return action !== 'noop' && action !== 'preserve';
}
function targetForBinding(target: PublicationTarget, binding: string): boolean {
  if (target === 'advisor-controller') return binding === '.evcrate/bin';
  const bindings = PUBLICATION_TARGET_BINDINGS[target];
  return bindings !== undefined && bindings.includes(binding as never);
}
function targetForLocalRoot(target: PublicationTarget, localRoot: string): boolean {
  if (target === 'advisor-controller') return localRoot === '.evcrate/bin';
  const roots = PUBLICATION_TARGET_LOCAL_ROOTS[target];
  return roots !== undefined && roots.includes(localRoot as never);
}
function readJournal(path: string): PublicationJournal {
  try {
    assertOwnerOnlyFile(path);
    const parsed = parseJsonDocument(readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES);
    if (!isPlainObject(parsed)) fail();
    const allowed = ['schema_version', 'transaction_type', 'status', 'release_id', 'home_root', 'transaction_dir',
      'selected_targets', 'binding_order', 'previous_managed_paths', 'managed_paths', 'build_manifest_path',
      'build_manifest_digest', 'retained_release_id', 'retain_transaction', 'operation_count', 'operations_digest', 'operations'];
    if (Object.keys(parsed).some((key) => !allowed.includes(key))
      || parsed.schema_version !== 1 || parsed.transaction_type !== 'target-publication'
      || (parsed.status !== 'staged' && parsed.status !== 'promoting' && parsed.status !== 'committed')) fail();
    if (typeof parsed.home_root !== 'string' || resolve(parsed.home_root) !== parsed.home_root) fail();
    const release = releaseId(parsed.release_id);
    const transaction = relativePath(parsed.transaction_dir);
    if (transaction !== `release-${release}`) fail();
    const selectedTargets = targets(parsed.selected_targets);
    const bindingOrder = order(parsed.binding_order, selectedTargets);
    const previousManagedPaths = managed(parsed.previous_managed_paths);
    const managedPaths = managed(parsed.managed_paths);
    const manifestPath = relativePath(parsed.build_manifest_path);
    const manifestDigest = hash(parsed.build_manifest_digest);
    const operationCount = safeInteger(parsed.operation_count, MAX_PUBLICATION_CHANGES);
    const operationsDigest = hash(parsed.operations_digest);
    if (manifestDigest === null || operationsDigest === null) fail();
    if (typeof parsed.retain_transaction !== 'boolean'
      || (parsed.retained_release_id !== null && typeof parsed.retained_release_id !== 'string')) fail();
    const retainedRelease = parsed.retained_release_id === null ? null : releaseId(parsed.retained_release_id);
    if (parsed.status !== 'committed' && (parsed.retain_transaction || retainedRelease !== null)) fail();
    if (parsed.retain_transaction !== (retainedRelease !== null)
      || (retainedRelease !== null && retainedRelease !== release)) fail();
    const operations = parsed.operations;
    if (!Array.isArray(operations) || operations.length > MAX_PUBLICATION_CHANGES || operations.length !== operationCount
      || hashBytes(canonicalJsonBytes(operations)) !== operationsDigest) fail();
    const destinations = new Set<string>();
    const parsedOperations = operations.map((value, index): PublicationJournalOperation => {
      if (!isPlainObject(value)) fail();
      const keys = ['target', 'binding', 'local_root', 'relative_path', 'kind', 'action', 'destination',
        'backup', 'before', 'intendedHash', 'intended', 'promoted'];
      if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))
        || typeof value.target !== 'string') fail();
      const target = value.target === 'advisor-controller' ? value.target : normalizeTarget(value.target);
      if (target !== 'advisor-controller' && !selectedTargets.includes(target)) fail();
      const binding = relativePath(value.binding);
      const localRoot = relativePath(value.local_root);
      const relativePathValue = relativePath(value.relative_path);
      if (!bindingOrder.includes(binding) || !targetForBinding(target, binding)) fail();
      if (value.kind !== 'file' && value.kind !== 'directory' || typeof value.destination !== 'string') fail();
      const destination = relativePath(value.destination);
      const expectedDestination = target === 'advisor-controller' ? binding : `${binding}/${relativePathValue}`;
      if (destination !== expectedDestination) fail('PATH_UNSAFE');
      if (destinations.has(destination)) fail();
      destinations.add(destination);
      if (value.action === 'conflict' || !PUBLICATION_CHANGE_ACTIONS.includes(value.action as PublicationChangeAction)) fail();
      const action = value.action as PublicationChangeAction;
      if (target === 'advisor-controller'
        ? binding !== '.evcrate/bin' || localRoot !== '.evcrate/bin'
          || relativePathValue !== '.evcrate/bin' || value.kind !== 'directory'
        : value.kind !== 'file' || !targetForLocalRoot(target, localRoot)) fail();
      const backup = value.backup === null ? null : relativePath(value.backup);
      const before = node(value.before);
      const needsBackup = mutation(action) && before.present;
      if (needsBackup !== (backup !== null) || (backup !== null && backup !== `backups/${index}`)) fail();
      if (before.present && before.kind !== value.kind) fail();
      const intendedHash = hash(value.intendedHash);
      if (['create', 'update', 'merge-create', 'merge-update'].includes(action) && intendedHash === null) fail();
      if (action === 'delete' && intendedHash !== null) fail();
      if ((action === 'noop' || action === 'preserve')
        && (intendedHash !== before.hash && !(intendedHash === null && !before.present))) fail();
      const intended = value.intended === null ? null : node(value.intended);
      if (intended !== null) {
        if (!intended.present) {
          if (intendedHash !== null) fail();
        } else if (intended.kind !== value.kind || intended.hash !== intendedHash) fail();
      }
      if (typeof value.promoted !== 'boolean' || (!mutation(action) && value.promoted)) fail();
      if (value.promoted && intended === null) fail();
      if (mutation(action) && !value.promoted && intended !== null) fail();
      return Object.freeze({
        target, binding, localRoot, relativePath: relativePathValue, kind: value.kind,
        action, destination, backup, before, intendedHash, intended, promoted: value.promoted
      });
    });
    if (parsed.status === 'committed' && parsedOperations.some((operation) => mutation(operation.action) && !operation.promoted)) fail();
    return Object.freeze({ schema_version: 1, transaction_type: 'target-publication', status: parsed.status,
      release_id: release, home_root: parsed.home_root, transaction_dir: transaction,
      selected_targets: selectedTargets, binding_order: bindingOrder, previous_managed_paths: previousManagedPaths,
      managed_paths: managedPaths, build_manifest_path: manifestPath, build_manifest_digest: manifestDigest,
      retained_release_id: retainedRelease, retain_transaction: parsed.retain_transaction,
      operation_count: operationCount, operations_digest: operationsDigest, operations: Object.freeze(parsedOperations) });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
}
export function readPublicationJournal(stateRoot: string): PublicationJournal | null {
  const root = resolve(stateRoot);
  assertNoSymlinkAncestors(root);
  try {
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('PATH_UNSAFE');
    assertOwnerOnlyDirectory(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
  const path = join(root, PUBLICATION_JOURNAL_NAME);
  try { lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail();
  }
  return readJournal(path);
}
function safeDestination(homeRoot: string, value: string): string {
  return containedPath(homeRoot, value);
}
function safeBackup(stateRoot: string, transaction: string, value: string): string {
  const transactionRoot = containedPath(stateRoot, transaction);
  const backup = containedPath(transactionRoot, value);
  if (!value.startsWith('backups/')) fail();
  return backup;
}
function ensureParent(path: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(parent);
}
function cleanup(stateRoot: string, transaction: string, retain: boolean): void {
  const transactionRoot = containedPath(stateRoot, transaction);
  if (!retain) removePath(transactionRoot);
  try {
    unlinkSync(join(resolve(stateRoot), PUBLICATION_JOURNAL_NAME));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail();
  }
  syncDirectory(resolve(stateRoot));
}
function committedMarker(journal: PublicationJournal): Record<string, unknown> {
  return { schema_version: 1, status: 'complete', transaction_type: 'target-publication', release_id: journal.release_id,
    selected_targets: [...journal.selected_targets], binding_order: [...journal.binding_order], managed_paths: journal.managed_paths,
    previous_managed_paths: journal.previous_managed_paths, build_manifest_path: journal.build_manifest_path,
    build_manifest_digest: journal.build_manifest_digest, transaction_dir: journal.transaction_dir,
    retained_release_id: journal.retained_release_id };
}
function recoveredMarker(journal: PublicationJournal): Record<string, unknown> {
  return { schema_version: 1, status: 'recovered', transaction_type: 'target-publication', release_id: journal.release_id,
    selected_targets: [...journal.selected_targets], binding_order: [...journal.binding_order], managed_paths: journal.previous_managed_paths,
    previous_managed_paths: journal.previous_managed_paths, build_manifest_path: journal.build_manifest_path,
    build_manifest_digest: journal.build_manifest_digest, transaction_dir: journal.transaction_dir,
    retained_release_id: null };
}
function assertMarkerMatches(stateRoot: string, journal: PublicationJournal): void {
  const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
  if (!marker) {
    if (journal.status === 'staged' && journal.operations.every((operation) => !operation.promoted)) return;
    fail();
  }
  if (releaseId(marker.release_id) !== journal.release_id
    || marker.transaction_dir !== journal.transaction_dir
    || marker.build_manifest_digest !== journal.build_manifest_digest) fail();
  const markerTargets = targets(marker.selected_targets);
  const markerOrder = order(marker.binding_order, journal.selected_targets);
  if (markerTargets.length !== journal.selected_targets.length
    || markerTargets.some((target, index) => target !== journal.selected_targets[index])
    || markerOrder.length !== journal.binding_order.length
    || markerOrder.some((binding, index) => binding !== journal.binding_order[index])) fail();
  const allowedStatuses = journal.status === 'staged'
    ? ['promoting'] : ['promoting', 'complete'];
  if (!allowedStatuses.includes(marker.status as string)) fail();
}
export function recoverPublicationUnlocked(
  stateRoot: string, homeRoot: string, expectedReleaseId: string | null = null
): PublicationRecoveryOutcome {
  const journal = readPublicationJournal(stateRoot);
  if (!journal) {
    if (expectedReleaseId !== null) fail();
    const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
    if (marker && marker.status !== 'none' && marker.status !== 'complete' && marker.status !== 'recovered') fail();
    return { action: 'none', releaseId: null, selectedTargets: [], bindingOrder: [] };
  }
  if (expectedReleaseId !== null && journal.release_id !== expectedReleaseId) fail();
  if (resolve(journal.home_root) !== resolve(homeRoot)) fail('PATH_UNSAFE');
  assertOwnerOnlyDirectory(resolve(stateRoot));
  assertMarkerMatches(stateRoot, journal);
  const transactionRoot = containedPath(stateRoot, journal.transaction_dir);
  let transactionPresent = true;
  try {
    const stat = lstatSync(transactionRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
    assertOwnerOnlyDirectory(transactionRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof ControlPlaneError) throw error;
      fail();
    }
    transactionPresent = false;
  }
  if (!transactionPresent && (journal.status !== 'committed' || journal.retain_transaction)) fail();
  for (const operation of journal.operations) {
    const destination = safeDestination(homeRoot, operation.destination);
    const current = snapshot(destination, operation.target === 'advisor-controller');
    const intended = operation.intended
      ?? (operation.intendedHash === null ? null : { present: true, kind: operation.kind, hash: operation.intendedHash });
    const matchesIntended = intended === null
      ? !current.present
      : operation.intended === null ? sameContent(current, intended) : same(current, intended);
    if (journal.status === 'committed') {
      if (!matchesIntended) fail();
      if (operation.backup !== null && !journal.retain_transaction) {
        removePath(safeBackup(stateRoot, journal.transaction_dir, operation.backup));
      }
      continue;
    }
    if (operation.action === 'noop' || operation.action === 'preserve') {
      if (!same(current, operation.before)) fail();
      continue;
    }
    const before = operation.before;
    if (before.present) {
      const backup = operation.backup === null ? null : safeBackup(stateRoot, journal.transaction_dir, operation.backup);
      if (backup === null) {
        if (!same(current, before)) fail();
      } else {
        if (matchesIntended && current.present) removePath(destination);
        else if (current.present && !same(current, before)) fail();
        const backupNode = snapshot(backup, operation.target === 'advisor-controller');
        if (!backupNode.present) {
          if (!same(snapshot(destination, operation.target === 'advisor-controller'), before)) fail();
        } else {
          if (!same(backupNode, before) || publicationNode(destination).present) fail();
          ensureParent(destination);
          renameSync(backup, destination);
        }
      }
    } else {
      if (operation.backup !== null && publicationNode(safeBackup(stateRoot, journal.transaction_dir, operation.backup)).present) fail();
      if (current.present) {
        if (!matchesIntended) fail();
        removePath(destination);
      }
    }
    if (!same(snapshot(destination, operation.target === 'advisor-controller'), before)) fail();
  }
  if (journal.status === 'committed') {
    writeReleaseMarker(stateRoot, committedMarker(journal));
    cleanup(stateRoot, journal.transaction_dir, journal.retain_transaction);
    return { action: 'finalized', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
  }
  writeReleaseMarker(stateRoot, recoveredMarker(journal));
  cleanup(stateRoot, journal.transaction_dir, false);
  return { action: 'rolled-back', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
}
