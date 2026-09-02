import { chmodSync, lstatSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import {
  MAX_PUBLICATION_RESULT_BYTES, MAX_PUBLICATION_STATE_BYTES, validatePublishApplyResultPayload,
  type PublishApplyResultPayload, type PublishDryRunResultPayload, type RecoverResultPayload
} from '../protocol/publication-payloads.js';
import { canonicalBytes } from '../protocol/json.js';
import { canonicalJsonBytes, hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertOwnerControlledDirectory, assertOwnerOnlyDirectory } from '../filesystem/paths.js';
import { removePath, sameVolume, syncDirectory, writeAtomicFile, writeAtomicProjectionFile } from '../filesystem/atomic.js';
import { RELEASE_MARKER_NAME, withPublishLock } from '../filesystem/locking.js';
import { isPlainObject } from '../protocol/json.js';
import { createPublicationPlan, type PlannedPublicationOperation, type PublicationPlan } from './publication-plan.js';
import { PUBLICATION_JOURNAL_NAME, readPublicationJournal, recoverPublicationUnlocked } from './publication-recovery.js';
import {
  MAX_PUBLICATION_FILE_BYTES, PUBLICATION_TRAVERSAL_LIMITS, publicationNode, publicationSnapshot,
  readOptionalPublicationMarker, type PublicationNodeSnapshot
} from './publication-inventory.js';

export const PUBLICATION_STATE_DIRECTORY = '.evcrate/publication';
export const MAX_RETAINED_RELEASE_BYTES = 512 * 1024 * 1024;
export const MAX_RETAINED_RELEASE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export interface PublicationHooks {
  readonly beforeBinding?: (binding: string, index: number) => void;
  readonly afterBinding?: (binding: string, index: number) => void;
  readonly beforeOperation?: (operation: PlannedPublicationOperation, index: number) => void;
  readonly afterOperation?: (operation: PlannedPublicationOperation, index: number) => void;
}
export interface PublicationOptions { readonly now?: () => number; readonly hooks?: PublicationHooks; readonly abortSignal?: AbortSignal; }
export function publicationStateRoot(homeRoot: string): string { return join(resolve(homeRoot), PUBLICATION_STATE_DIRECTORY); }
function fail(code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'RECOVERY_FAILED' | 'CAS_CONFLICT' | 'PATH_UNSAFE' = 'PUBLICATION_FAILED'): never { throw new ControlPlaneError(code); }
function markerPath(stateRoot: string): string { return join(stateRoot, 'release-marker.json'); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) fail(); }
function sameSnapshot(left: PublicationNodeSnapshot, right: PublicationNodeSnapshot): boolean {
  return ['present', 'kind', 'device', 'inode', 'size', 'mode', 'hash']
    .every((key) => left[key as keyof PublicationNodeSnapshot] === right[key as keyof PublicationNodeSnapshot]);
}
function assertBefore(operation: PlannedPublicationOperation): void {
  const controller = operation.target === 'advisor-controller';
  if (!sameSnapshot(publicationSnapshot(operation.destination, controller), operation.beforeSnapshot)) fail('CAS_CONFLICT');
}
function assertIntended(operation: PlannedPublicationOperation): PublicationNodeSnapshot {
  const controller = operation.target === 'advisor-controller';
  const current = publicationSnapshot(operation.destination, controller);
  if (operation.intendedHash === null
    ? current.present
    : !current.present || current.kind !== (operation.target === 'advisor-controller' ? 'directory' : 'file')
      || current.hash !== operation.intendedHash) fail('PUBLICATION_FAILED');
  return current;
}
function stateBytes(value: Record<string, unknown>): Uint8Array {
  const bytes = canonicalJsonBytes(value);
  if (bytes.byteLength > MAX_PUBLICATION_STATE_BYTES) fail('PUBLICATION_FAILED');
  return bytes;
}
function writeJournal(stateRoot: string, journal: Record<string, unknown>): void {
  writeAtomicFile(join(stateRoot, PUBLICATION_JOURNAL_NAME), stateBytes(journal), 0o600);
}
function refreshJournal(journal: Record<string, unknown>): void {
  const operations = journal.operations;
  if (!Array.isArray(operations)) fail('PUBLICATION_FAILED');
  journal.operation_count = operations.length;
  journal.operations_digest = hashBytes(canonicalJsonBytes(operations));
}
function journalFor(
  plan: PublicationPlan, homeRoot: string, releaseId: string, previous: Record<string, unknown>, transaction: string
): Record<string, unknown> {
  const operations = plan.bindings.flatMap((binding) => binding.operations).map((operation, index) => {
    const mutates = operation.action !== 'noop' && operation.action !== 'preserve';
    const before = operation.beforeSnapshot;
    return {
      target: operation.target, binding: operation.binding, local_root: operation.localRoot,
      relative_path: operation.relativePath,
      kind: operation.target === 'advisor-controller' ? 'directory' : 'file',
      action: operation.action, destination: operation.target === 'advisor-controller'
        ? operation.binding : `${operation.binding}/${operation.relativePath}`,
      backup: mutates && before.present ? `backups/${index}` : null,
      before, intendedHash: operation.intendedHash,
      intended: !mutates && before.present ? before : null, promoted: false
    };
  });
  return { schema_version: 1, transaction_type: 'target-publication', status: 'staged', release_id: releaseId,
    home_root: homeRoot, transaction_dir: transaction, selected_targets: [...plan.selectedTargets], binding_order: [...plan.bindingOrder],
    previous_managed_paths: previous, managed_paths: Object.fromEntries(plan.bindings.filter((binding) => !binding.controller).map((binding) => [binding.localRoot, [...binding.managedPaths]])),
    build_manifest_path: plan.buildManifestPath, build_manifest_digest: plan.buildManifestDigest,
    retained_release_id: null, retain_transaction: false, operation_count: operations.length,
    operations_digest: hashBytes(canonicalJsonBytes(operations)), operations };
}
interface StageCounts { files: number; directories: number; bytes: number; }
function stageController(
  source: string,
  destination: string,
  root = source,
  depth = 0,
  counts: StageCounts = { files: 0, directories: 0, bytes: 0 }
): void {
  if (depth > PUBLICATION_TRAVERSAL_LIMITS.maxDepth || ++counts.directories > PUBLICATION_TRAVERSAL_LIMITS.maxDirectories) fail();
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name); const destinationPath = join(destination, entry.name);
    if (Buffer.byteLength(relative(root, sourcePath).split('\\').join('/'), 'utf8') > PUBLICATION_TRAVERSAL_LIMITS.maxPathBytes) fail();
    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('PATH_UNSAFE');
    if (stat.isDirectory()) stageController(sourcePath, destinationPath, root, depth + 1, counts);
    else {
      const size = Number(stat.size);
      if (!Number.isSafeInteger(size) || ++counts.files > PUBLICATION_TRAVERSAL_LIMITS.maxFiles
        || size > PUBLICATION_TRAVERSAL_LIMITS.maxFileBytes
        || counts.bytes > PUBLICATION_TRAVERSAL_LIMITS.maxBytes - size) fail();
      counts.bytes += size;
      const relativePath = relative(root, sourcePath).split('\\').join('/');
      const mode = relativePath === 'evcrate-advisor' ? 0o755 : Number(stat.mode) & 0o777;
      writeAtomicProjectionFile(destinationPath, readBoundedFile(sourcePath, MAX_PUBLICATION_FILE_BYTES), mode);
    }
  }
  chmodSync(destination, 0o700);
}
function stageOperation(transaction: string, sourceRoot: string, operation: PlannedPublicationOperation, index: number): void {
  const stage = join(transaction, 'stage');
  if (operation.target === 'advisor-controller') return stageController(sourceRoot, join(stage, 'controller'));
  if (operation.content !== null) writeAtomicFile(join(stage, String(index)), operation.content, 0o600);
}
function backupDestination(transaction: string, operation: PlannedPublicationOperation, index: number): string | null {
  if (!operation.beforeSnapshot.present) return null;
  const backup = join(transaction, 'backups', String(index));
  mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(dirname(backup));
  renameSync(operation.destination, backup);
  try {
    if (!sameSnapshot(publicationSnapshot(backup, operation.target === 'advisor-controller'), operation.beforeSnapshot)) {
      ensureDestinationParent(operation.destination);
      renameSync(backup, operation.destination);
      fail('CAS_CONFLICT');
    }
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('CAS_CONFLICT');
  }
  return backup;
}
function ensureDestinationParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(dirname(path));
}
function promoteOperation(
  transaction: string,
  operation: PlannedPublicationOperation,
  index: number,
  touchedDirs?: Set<string>
): PublicationNodeSnapshot {
  assertBefore(operation);
  const backup = backupDestination(transaction, operation, index);
  if (operation.target === 'advisor-controller') {
    ensureDestinationParent(operation.destination);
    renameSync(join(transaction, 'stage', 'controller'), operation.destination);
  } else if (operation.content !== null) {
    ensureDestinationParent(operation.destination);
    renameSync(join(transaction, 'stage', String(index)), operation.destination);
  }
  if (touchedDirs) {
    touchedDirs.add(dirname(operation.destination));
    if (backup !== null) touchedDirs.add(dirname(backup));
  } else {
    syncDirectory(dirname(operation.destination));
    if (backup !== null) syncDirectory(dirname(backup));
  }
  return assertIntended(operation);
}
function transactionBytes(root: string): number {
  let bytes = 0;
  let files = 0;
  let directories = 0;
  const visit = (path: string, depth: number): void => {
    if (depth > PUBLICATION_TRAVERSAL_LIMITS.maxDepth) fail('RECOVERY_FAILED');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('PATH_UNSAFE');
    if (stat.isDirectory()) {
      if (++directories > PUBLICATION_TRAVERSAL_LIMITS.maxDirectories) fail('RECOVERY_FAILED');
      assertOwnerControlledDirectory(path);
      for (const entry of readdirSync(path)) visit(join(path, entry), depth + 1);
      return;
    }
    const size = Number(stat.size);
    if (!Number.isSafeInteger(size) || ++files > PUBLICATION_TRAVERSAL_LIMITS.maxFiles
      || size > MAX_PUBLICATION_FILE_BYTES || bytes > PUBLICATION_TRAVERSAL_LIMITS.maxBytes - size) fail('RECOVERY_FAILED');
    bytes += size;
  };
  visit(root, 0);
  return bytes;
}
function hasBackups(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
    assertOwnerOnlyDirectory(path);
    return readdirSync(path).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
}
function priorManaged(marker: Record<string, unknown> | null): Record<string, unknown> {
  const value = marker?.managed_paths;
  return value === undefined ? {} : isPlainObject(value) ? value : fail();
}
function retainedMarkerId(marker: Record<string, unknown> | null): string | null {
  const value = marker?.retained_release_id;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) fail('RECOVERY_FAILED');
  return value;
}
function cleanupReleases(
  stateRoot: string, current: string | null, prior: string | null, now: number
): string | null {
  const candidates: Array<{ id: string; path: string; age: number; bytes: number }> = [];
  for (const name of readdirSync(stateRoot)) {
    if (!name.startsWith('release-') || name === RELEASE_MARKER_NAME) continue;
    const id = name.slice('release-'.length);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id)) fail('RECOVERY_FAILED');
    const path = join(stateRoot, name);
    try {
      assertOwnerOnlyDirectory(path);
      const age = now - Number(lstatSync(path).mtimeMs);
      const bytes = transactionBytes(path);
      if (!Number.isFinite(age)) fail('RECOVERY_FAILED');
      candidates.push({ id, path, age, bytes });
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      fail('RECOVERY_FAILED');
    }
  }
  const known = new Set([current, prior].filter((value): value is string => value !== null));
  if (candidates.some(({ id }) => !known.has(id))) fail('RECOVERY_FAILED');
  const find = (id: string | null): { id: string; path: string; age: number; bytes: number } | undefined =>
    id === null ? undefined : candidates.find((candidate) => candidate.id === id);
  let retained = find(current);
  if (current !== null && retained === undefined) fail('RECOVERY_FAILED');
  if (retained !== undefined && (retained.age >= MAX_RETAINED_RELEASE_AGE_MS || retained.bytes > MAX_RETAINED_RELEASE_BYTES)) retained = undefined;
  if (retained === undefined) {
    retained = find(prior);
    if (retained !== undefined && (retained.age >= MAX_RETAINED_RELEASE_AGE_MS || retained.bytes > MAX_RETAINED_RELEASE_BYTES)) retained = undefined;
  }
  for (const candidate of candidates) {
    if (candidate !== retained) removePath(candidate.path);
  }
  return retained?.id ?? null;
}
function assertApplyResultBudget(plan: PublicationPlan, releaseId: string): void {
  const candidate = {
    releaseId, buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
    selectedTargets: plan.selectedTargets, bindingOrder: plan.bindingOrder, changes: plan.changes,
    retainedReleaseId: releaseId
  };
  try {
    validatePublishApplyResultPayload(candidate);
    if (canonicalBytes(candidate).byteLength > MAX_PUBLICATION_RESULT_BYTES - 4096) fail('PUBLICATION_FAILED');
  } catch {
    fail('PUBLICATION_FAILED');
  }
}
function restoreNoPromotion(
  stateRoot: string, transactionRoot: string, previousMarker: Record<string, unknown> | null
): void {
  removePath(transactionRoot);
  removePath(join(stateRoot, PUBLICATION_JOURNAL_NAME));
  if (previousMarker === null) removePath(markerPath(stateRoot));
  else writeAtomicFile(markerPath(stateRoot), canonicalJsonBytes(previousMarker), 0o600);
  syncDirectory(stateRoot);
}
function applyUnlocked(context: InvocationContext, options: PublicationOptions): PublishApplyResultPayload {
  const stateRoot = publicationStateRoot(context.homeRoot);
  const previousMarker = readOptionalPublicationMarker(markerPath(stateRoot));
  const plan = createPublicationPlan(context, markerPath(stateRoot));
  if (plan.changes.some(({ action }) => action === 'conflict')) fail();
  if (!sameVolume(stateRoot, context.homeRoot)) fail('PATH_UNSAFE');
  const releaseId = randomUUID().replaceAll('-', '');
  assertApplyResultBudget(plan, releaseId);
  const transaction = `release-${releaseId}`;
  const transactionRoot = join(stateRoot, transaction);
  mkdirSync(join(transactionRoot, 'stage'), { recursive: true, mode: 0o700 });
  assertOwnerOnlyDirectory(transactionRoot);
  const journal = journalFor(plan, context.homeRoot, releaseId, priorManaged(previousMarker), transaction);
  const mutable = journal as {
    operations: Array<Record<string, unknown>>; status: string;
    retain_transaction: boolean; retained_release_id: string | null;
  };
  let promotionStarted = false;
  try {
    writeJournal(stateRoot, journal);
    writeRelease(stateRoot, { ...journal, status: 'promoting' });
    mutable.status = 'promoting';
    refreshJournal(mutable);
    writeJournal(stateRoot, mutable);
    const work: Array<{ operation: PlannedPublicationOperation; sourceRoot: string; journalIndex: number }> = [];
    let journalIndex = 0;
    for (const [bindingIndex, binding] of plan.bindings.entries()) {
      options.hooks?.beforeBinding?.(binding.binding, bindingIndex);
      for (const operation of binding.operations) {
        if (operation.action !== 'noop' && operation.action !== 'preserve') {
          work.push({ operation, sourceRoot: binding.sourceRoot, journalIndex });
        }
        journalIndex += 1;
      }
      options.hooks?.afterBinding?.(binding.binding, bindingIndex);
    }
    const touchedDirs = new Set<string>();
    for (const [workIndex, item] of work.entries()) {
      checkAbort(options.abortSignal);
      options.hooks?.beforeOperation?.(item.operation, workIndex);
      assertBefore(item.operation);
      stageOperation(transactionRoot, item.sourceRoot, item.operation, item.journalIndex);
      promotionStarted = true;
      const intended = promoteOperation(transactionRoot, item.operation, item.journalIndex, touchedDirs);
      const entry = mutable.operations[item.journalIndex];
      if (!entry) fail();
      entry.promoted = true;
      entry.intended = intended;
      options.hooks?.afterOperation?.(item.operation, workIndex);
    }
    for (const dir of touchedDirs) syncDirectory(dir);
    for (const item of work) assertIntended(item.operation);
    removePath(join(transactionRoot, 'stage'));
    const backupRoot = join(transactionRoot, 'backups');
    const retain = hasBackups(backupRoot) && transactionBytes(transactionRoot) <= MAX_RETAINED_RELEASE_BYTES;
    mutable.status = 'committed';
    mutable.retain_transaction = retain;
    mutable.retained_release_id = retain ? releaseId : null;
    refreshJournal(mutable);
    writeJournal(stateRoot, mutable);
    writeRelease(stateRoot, { ...journal, status: 'complete', retained_release_id: retain ? releaseId : null, retain_transaction: retain });
    if (!retain) removePath(transactionRoot);
    syncDirectory(stateRoot);
    const retainedReleaseId = cleanupReleases(
      stateRoot, retain ? releaseId : null, retainedMarkerId(previousMarker), options.now?.() ?? Date.now()
    );
    if (retainedReleaseId !== (retain ? releaseId : null)) {
      writeRelease(stateRoot, {
        ...journal, status: 'complete', retained_release_id: retainedReleaseId,
        retain_transaction: retainedReleaseId !== null
      });
    }
    syncDirectory(stateRoot);
    removePath(join(stateRoot, PUBLICATION_JOURNAL_NAME));
    return {
      releaseId, buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
      selectedTargets: plan.selectedTargets, bindingOrder: plan.bindingOrder, changes: plan.changes, retainedReleaseId
    };
  } catch (error) {
    const control = error instanceof ControlPlaneError ? error : null;
    if (!promotionStarted) {
      try { restoreNoPromotion(stateRoot, transactionRoot, previousMarker); }
      catch { throw new ControlPlaneError('ROLLBACK_FAILED'); }
      if (control) throw control;
      fail();
    }
    if (control?.code === 'CAS_CONFLICT') throw control;
    try { recoverPublicationUnlocked(stateRoot, context.homeRoot); }
    catch { throw new ControlPlaneError('ROLLBACK_FAILED'); }
    if (control) throw control;
    fail();
  }
}
function writeRelease(stateRoot: string, value: Record<string, unknown>): void {
  writeAtomicFile(markerPath(stateRoot), stateBytes({ schema_version: 1, status: value.status, transaction_type: 'target-publication', release_id: value.release_id,
    selected_targets: value.selected_targets, binding_order: value.binding_order, managed_paths: value.managed_paths, previous_managed_paths: value.previous_managed_paths,
    build_manifest_path: value.build_manifest_path, build_manifest_digest: value.build_manifest_digest, transaction_dir: value.transaction_dir,
    retained_release_id: value.retained_release_id ?? null }), 0o600);
}
export function publishDryRun(context: InvocationContext): PublishDryRunResultPayload {
  const stateRoot = publicationStateRoot(context.homeRoot); assertNoSymlinkAncestors(context.homeRoot);
  if (readPublicationJournal(stateRoot)) fail('RECOVERY_FAILED');
  const plan = createPublicationPlan(context, markerPath(stateRoot));
  return { buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest, selectedTargets: plan.selectedTargets,
    bindingOrder: plan.bindingOrder, changes: plan.changes };
}
export function publishApply(context: InvocationContext, options: PublicationOptions = {}): PublishApplyResultPayload {
  const stateRoot = publicationStateRoot(context.homeRoot); assertNoSymlinkAncestors(context.homeRoot);
  return withPublishLock(stateRoot, () => {
    if (!sameVolume(stateRoot, context.homeRoot)) fail('PATH_UNSAFE');
    recoverPublicationUnlocked(stateRoot, context.homeRoot);
    return applyUnlocked(context, options);
  });
}
export function recoverPublication(
  context: InvocationContext, expectedReleaseId: string | null = null
): RecoverResultPayload {
  const stateRoot = publicationStateRoot(context.homeRoot); assertNoSymlinkAncestors(context.homeRoot);
  return withPublishLock(stateRoot, () => {
    if (!sameVolume(stateRoot, context.homeRoot)) fail('PATH_UNSAFE');
    const result = recoverPublicationUnlocked(stateRoot, context.homeRoot, expectedReleaseId);
    return { releaseId: result.releaseId, action: result.action, selectedTargets: result.selectedTargets,
      bindingOrder: result.bindingOrder };
  });
}
export interface PublicationHandler {
  publishDryRun(context: InvocationContext): PublishDryRunResultPayload | Promise<PublishDryRunResultPayload>;
  publishApply(context: InvocationContext, options?: PublicationOptions): PublishApplyResultPayload | Promise<PublishApplyResultPayload>;
  recover(context: InvocationContext, expectedReleaseId?: string | null): RecoverResultPayload | Promise<RecoverResultPayload>;
}
export const defaultPublicationHandler: PublicationHandler = Object.freeze({
  publishDryRun,
  publishApply,
  recover: recoverPublication
});
