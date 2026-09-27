import { lstatSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { resolvePublicationProjectContext } from '../context/invocation-context.js';
import {
  PUBLICATION_JOURNAL_NAME, readPublicationJournal, recoverPublicationUnlocked,
  recoverAndMigrateHomeStateUnlocked, recoverAndMigrateProjectStateUnlocked,
  type PublicationRecoveryOutcome
} from './publication-recovery.js';
import {
  MAX_PUBLICATION_FILE_BYTES, PUBLICATION_TRAVERSAL_LIMITS, publicationNode, publicationSnapshot,
  readOptionalPublicationMarker, publicationMarkerRecord, type PublicationNodeSnapshot
} from './publication-inventory.js';
import {
  MAX_PUBLICATION_CHANGES, MAX_PUBLICATION_RESULT_BYTES, MAX_PUBLICATION_STATE_BYTES, PUBLICATION_PROJECT_TARGET_BINDINGS,
  validatePublishApplyResultPayload,
  type ApplyPhaseRecord, type DryRunPhaseRecord, type PublishApplyResultPayload,
  type PublishDryRunResultPayload, type PublicationScope, type PublishRequestPayload,
  type RecoverRequestPayload, type RecoverResultPayload, type RecoveryPhaseRecord
} from '../protocol/publication-payloads.js';
import { canonicalBytes } from '../protocol/json.js';
import { canonicalJsonBytes, hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';
import { removePath, sameVolume, syncDirectory, writeAtomicFile, writeAtomicProjectionFile } from '../filesystem/atomic.js';
import { RELEASE_MARKER_NAME, withLock, withPublishLock } from '../filesystem/locking.js';
import { isPlainObject } from '../protocol/json.js';
import {
  createPublicationPlan, createPublicationPlanSet, type PlannedPublicationOperation,
  type PriorManagedOwnership, type PublicationPhasePlan, type PublicationPlan, type PublicationPlanSet
} from './publication-plan.js';

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
export type TransactionRetention = 'bounded-one-home-release' | 'none';
export interface TransactionDescriptor {
  readonly logicalPhase: 'shared' | 'harness';
  readonly scope: PublicationScope;
  readonly releaseId: string;
  readonly destinationRoot: string;
  readonly durableStateRoot: string;
  readonly transactionWorkspaceRoot: string;
  readonly journalPath: string;
  readonly markerPath: string;
  readonly backupRoot: string;
  readonly selectedTargets: readonly string[];
  readonly projectIdentity: string | null;
  readonly lockPaths: readonly string[];
  readonly lockOrder: readonly string[];
  readonly retention: TransactionRetention;
  readonly bindings: readonly string[];
  readonly operations: readonly PlannedPublicationOperation[];
}
type EnginePlan = Pick<PublicationPlan, 'bindings' | 'selectedTargets' | 'buildManifestPath' | 'buildManifestDigest'>
  & { readonly managedOwnership?: PriorManagedOwnership };
function createTransactionDescriptor(
  plan: EnginePlan, logicalPhase: 'shared' | 'harness', scope: PublicationScope, releaseId: string,
  destinationRoot: string, durableStateRoot: string, projectIdentity: string | null
): TransactionDescriptor {
  const transactionWorkspaceRoot = scope === 'project'
    ? join(resolve(destinationRoot), `.evcrate-publish-${releaseId}`)
    : join(resolve(durableStateRoot), `release-${releaseId}`);
  const bindings = Object.freeze(plan.bindings.map(({ binding }) => binding));
  const operations = Object.freeze(plan.bindings.flatMap(({ operations }) => operations));

  return Object.freeze({
    logicalPhase, scope, releaseId, destinationRoot: resolve(destinationRoot),
    durableStateRoot: resolve(durableStateRoot), transactionWorkspaceRoot,
    journalPath: join(resolve(durableStateRoot), PUBLICATION_JOURNAL_NAME),
    markerPath: markerPath(durableStateRoot), backupRoot: join(transactionWorkspaceRoot, 'backups'),
    selectedTargets: Object.freeze([...plan.selectedTargets]), projectIdentity,
    lockPaths: Object.freeze([join(resolve(durableStateRoot), 'publish.lock')]),
    lockOrder: Object.freeze(scope === 'project' ? ['home', 'project'] : ['home']),
    retention: scope === 'project' ? 'none' : 'bounded-one-home-release',
    bindings, operations
  });
}
export class PublicationPartialError extends Error {
  readonly code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED';
  readonly payload: PublishApplyResultPayload;
  constructor(payload: PublishApplyResultPayload, code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED') {
    super(code);
    this.name = 'PublicationPartialError';
    this.code = code;
    this.payload = payload;
    Object.freeze(this);
  }
}
export function isPublicationPartialError(value: unknown): value is PublicationPartialError {
  return value instanceof PublicationPartialError;
}
export function publicationStateRoot(homeRoot: string): string { return join(resolve(homeRoot), PUBLICATION_STATE_DIRECTORY); }
function fail(code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'RECOVERY_FAILED' | 'CAS_CONFLICT' | 'PATH_UNSAFE' = 'PUBLICATION_FAILED', detail?: string): never { throw new ControlPlaneError(code, detail); }
function markerPath(stateRoot: string): string { return join(stateRoot, 'release-marker.json'); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) fail(); }
function sameSnapshot(left: PublicationNodeSnapshot, right: PublicationNodeSnapshot): boolean {
  const keys = ['present', 'kind', 'device', 'inode', 'size', 'hash'];
  return keys.every((key) => left[key as keyof PublicationNodeSnapshot] === right[key as keyof PublicationNodeSnapshot]);
}
function assertBefore(operation: PlannedPublicationOperation): void {
  const controller = operation.target === 'advisor-controller';
  if (!sameSnapshot(publicationSnapshot(operation.destination, controller), operation.beforeSnapshot)) fail('CAS_CONFLICT');
}
function assertIntended(operation: PlannedPublicationOperation): PublicationNodeSnapshot {
  const controller = operation.target === 'advisor-controller';
  const current = publicationSnapshot(operation.destination, controller);
  if (operation.intendedHash === null) {
    if (current.present) fail('PUBLICATION_FAILED');
    return current;
  }
  if (!current.present || current.kind !== (controller ? 'directory' : 'file')
    || current.hash !== operation.intendedHash) {
    fail('PUBLICATION_FAILED');
  }
  return current;
}
function stateBytes(value: Record<string, unknown>): Uint8Array {
  const bytes = canonicalJsonBytes(value);
  if (bytes.byteLength > MAX_PUBLICATION_STATE_BYTES) fail('PUBLICATION_FAILED');
  return bytes;
}
function writeJournal(stateRoot: string, journal: Record<string, unknown>): void {
  writeAtomicFile(join(stateRoot, PUBLICATION_JOURNAL_NAME), stateBytes(journal));
}
function writeProgress(
  transactionRoot: string, index: number, entry: Record<string, unknown>
): void {
  writeAtomicFile(
    join(transactionRoot, 'progress', `${index}.json`),
    stateBytes({ index, promoted: entry.promoted, intended: entry.intended })
  );
}
function refreshJournal(journal: Record<string, unknown>): void {
  const operations = journal.operations;
  if (!Array.isArray(operations)) fail('PUBLICATION_FAILED');
  journal.operation_count = operations.length;
  journal.operations_digest = hashBytes(canonicalJsonBytes(operations));
}
function ownershipWithoutController(ownership: PriorManagedOwnership): PriorManagedOwnership {
  const result: Record<string, Record<string, readonly string[]>> = {};
  for (const [target, bindings] of Object.entries(ownership)) {
    if (target === 'advisor-controller') continue;
    result[target] = {};
    for (const [binding, paths] of Object.entries(bindings)) result[target][binding] = [...paths];
  }
  return Object.freeze(result);
}
function stateRecord(
  plan: EnginePlan, descriptor: TransactionDescriptor, phase: 'shared' | 'harness',
  managedPaths: PriorManagedOwnership, previousManagedPaths: PriorManagedOwnership
): Record<string, unknown> {
  return {
    phase, scope: descriptor.scope, status: 'promoting',
    release_id: descriptor.releaseId,
    selected_targets: phase === 'shared' ? [] : [...plan.selectedTargets],
    binding_order: phase === 'shared'
      ? ['.evcrate/bin'] : descriptor.bindings.filter((binding) => binding !== '.evcrate/bin'),
    managed_paths: managedPaths, previous_managed_paths: previousManagedPaths,
    build_manifest_path: plan.buildManifestPath,
    build_manifest_digest: plan.buildManifestDigest,
    transaction_dir: `release-${descriptor.releaseId}`, retained_release_id: null,
    destination_root: descriptor.destinationRoot, durable_state_root: descriptor.durableStateRoot,
    workspace_root: descriptor.transactionWorkspaceRoot, workspace_name: descriptor.scope === 'project'
      ? `.evcrate-publish-${descriptor.releaseId}` : `release-${descriptor.releaseId}`,
    project_identity: descriptor.projectIdentity, retention: descriptor.retention
  };
}
function journalFor(
  plan: EnginePlan, descriptor: TransactionDescriptor, previous: PriorManagedOwnership
): Record<string, unknown> {
  const operations = plan.bindings.flatMap((binding) => binding.operations).map((operation, index) => {
    const mutates = operation.action !== 'noop' && operation.action !== 'preserve';
    const before = operation.beforeSnapshot;
    return {
      target: operation.target, binding: operation.binding, local_root: operation.localRoot,
      relative_path: operation.relativePath,
      kind: operation.target === 'advisor-controller' ? 'directory' : 'file',
      action: operation.action, destination: operation.target === 'advisor-controller'
        ? operation.binding
        : operation.relativePath === operation.binding
          ? operation.binding : `${operation.binding}/${operation.relativePath}`,
      before, backup: mutates && before.present ? `backups/${index}` : null,
      intendedHash: operation.intendedHash,
      intended: !mutates && before.present ? before : null, promoted: false
    };
  });
  const sharedOnlyHome = descriptor.scope === 'home'
    && plan.bindings.length === 1 && plan.bindings[0]?.controller === true;
  const harnessOwnership = ownershipWithoutController(plan.managedOwnership ?? {});
  const sharedRecord = stateRecord(plan, descriptor, 'shared', {}, {});
  const harnessRecord = sharedOnlyHome ? null
    : stateRecord(plan, descriptor, 'harness', harnessOwnership, previous);
  const records = descriptor.scope === 'project'
    ? { harness: harnessRecord } : { shared: sharedRecord, harness: harnessRecord };
  const managedPaths = descriptor.scope === 'project' || !sharedOnlyHome ? harnessOwnership : {};
  return {
    schema_version: 2, transaction_type: 'target-publication', status: 'staged',
    logical_phase: descriptor.scope === 'project' ? 'harness' : sharedOnlyHome ? 'shared' : 'combined',
    records, release_id: descriptor.releaseId, home_root: descriptor.destinationRoot,
    transaction_dir: `release-${descriptor.releaseId}`,
    selected_targets: [...plan.selectedTargets], binding_order: [...descriptor.bindings],
    previous_managed_paths: previous, managed_paths: managedPaths,
    build_manifest_path: plan.buildManifestPath, build_manifest_digest: plan.buildManifestDigest,
    retained_release_id: null, retain_transaction: false, operation_count: operations.length,
    operations_digest: hashBytes(canonicalJsonBytes(operations)), operations,
    scope: descriptor.scope, destination_root: descriptor.destinationRoot,
    durable_state_root: descriptor.durableStateRoot, workspace_root: descriptor.transactionWorkspaceRoot,
    workspace_device: null, workspace_inode: null,
    workspace_parent_device: null, workspace_parent_inode: null,
    workspace_name: descriptor.scope === 'project' ? `.evcrate-publish-${descriptor.releaseId}` : `release-${descriptor.releaseId}`,
    project_identity: descriptor.projectIdentity, retention: descriptor.retention,
    lock_paths: [...descriptor.lockPaths], lock_order: [...descriptor.lockOrder]
  };
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
  mkdirSync(destination, { recursive: true });
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
      const content = readBoundedFile(sourcePath, MAX_PUBLICATION_FILE_BYTES);
      const isExecutable = relativePath === 'evcrate-advisor'
        || relativePath.endsWith('/evcrate-advisor')
        || relativePath.endsWith('.sh')
        || (content.length > 1 && content[0] === 0x23 && content[1] === 0x21)
        || (Number(stat.mode) & 0o111) !== 0;
      writeAtomicProjectionFile(destinationPath, content, isExecutable);
    }
  }
}
function stageOperation(transaction: string, sourceRoot: string, operation: PlannedPublicationOperation, index: number): void {
  const stage = join(transaction, 'stage');
  if (operation.target === 'advisor-controller') return stageController(sourceRoot, join(stage, 'controller'));
  if (operation.content !== null) writeAtomicProjectionFile(
    join(stage, String(index)), operation.content, operation.executable ?? false
  );
}
function backupDestination(transaction: string, operation: PlannedPublicationOperation, index: number): string | null {
  if (!operation.beforeSnapshot.present) return null;
  const backup = join(transaction, 'backups', String(index));
  mkdirSync(dirname(backup), { recursive: true });
  assertRealDirectory(dirname(backup));
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
  mkdirSync(dirname(path), { recursive: true });
  assertRealDirectory(dirname(path));
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
  } else if (operation.action === 'delete') {
    removePath(operation.destination);
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
      assertRealDirectory(path);
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
    assertRealDirectory(path);
    return readdirSync(path).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
}
function markerManagedOwnership(
  marker: Record<string, unknown> | null, phase: 'shared' | 'harness'
): PriorManagedOwnership {
  const record = marker?.schema_version === 2 ? publicationMarkerRecord(marker, phase) : marker;
  const value = record?.managed_paths;
  if (value === undefined) return Object.freeze({});
  if (!isPlainObject(value)) fail('RECOVERY_FAILED');
  if (marker?.schema_version === 2) return value as PriorManagedOwnership;
  return Object.freeze({});
}
function homePriorOwnership(marker: Record<string, unknown> | null): PriorManagedOwnership {
  return marker?.schema_version === 2
    ? markerManagedOwnership(marker, 'harness') : Object.freeze({});
}
function projectPriorOwnership(marker: Record<string, unknown> | null): PriorManagedOwnership {
  const value = markerManagedOwnership(marker, 'harness');
  if (marker?.schema_version === 2) return value;
  const legacy = marker?.managed_paths;
  if (legacy === undefined) return Object.freeze({});
  if (!isPlainObject(legacy)) fail('RECOVERY_FAILED');
  const entries = Object.entries(legacy);
  if (entries.length === 0) return Object.freeze({});
  const nested = entries.every(([, candidate]) => isPlainObject(candidate));
  const flat = entries.every(([, candidate]) => Array.isArray(candidate));
  if (nested === flat) fail('RECOVERY_FAILED');
  const result: Record<string, Record<string, readonly string[]>> = {};
  const assign = (target: string, binding: string, rawPaths: unknown): void => {
    const bindings = PUBLICATION_PROJECT_TARGET_BINDINGS[
      target as keyof typeof PUBLICATION_PROJECT_TARGET_BINDINGS
    ];
    if (!bindings || !bindings.includes(binding as never) || !Array.isArray(rawPaths)) {
      fail('RECOVERY_FAILED');
    }
    const paths = rawPaths.map((path) =>
      typeof path === 'string' ? path : fail('RECOVERY_FAILED')
    );
    result[target] ??= {};
    if (result[target][binding] !== undefined) fail('RECOVERY_FAILED');
    result[target][binding] = Object.freeze(paths);
  };
  if (nested) {
    for (const [target, bindings] of entries) {
      if (!isPlainObject(bindings)) fail('RECOVERY_FAILED');
      for (const [binding, paths] of Object.entries(bindings)) assign(target, binding, paths);
    }
  } else {
    for (const [binding, paths] of entries) {
      const owners = Object.entries(PUBLICATION_PROJECT_TARGET_BINDINGS)
        .filter(([, bindings]) => bindings.includes(binding as never));
      if (owners.length !== 1) fail('RECOVERY_FAILED');
      assign(owners[0][0], binding, paths);
    }
  }
  for (const [target, bindings] of Object.entries(result)) result[target] = Object.freeze(bindings);
  return Object.freeze(result);
}
function retainedMarkerId(marker: Record<string, unknown> | null): string | null {
  const record = marker?.schema_version === 2
    ? publicationMarkerRecord(marker, 'shared') ?? publicationMarkerRecord(marker, 'harness') : marker;
  const value = record?.retained_release_id;
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
      assertRealDirectory(path);
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
function assertSelectedTargets(context: InvocationContext, selectedTargets: readonly string[]): void {
  const actualSorted = [...selectedTargets].sort();
  const expectedSorted = [...context.selectedTargetIds].sort();
  if (actualSorted.length !== expectedSorted.length
    || actualSorted.some((target, index) => target !== expectedSorted[index])) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}
function assertPublishRequest(context: InvocationContext, request: PublishRequestPayload): void {
  if (request.scope !== 'home' && request.scope !== 'project') throw new ControlPlaneError('PROTOCOL_INVALID');
  assertSelectedTargets(context, request.selectedTargets);
}
function assertRecoverRequest(context: InvocationContext, request: RecoverRequestPayload): void {
  if (request.scope !== 'home' && request.scope !== 'project') throw new ControlPlaneError('PROTOCOL_INVALID');
  if (request.scope === 'home' && request.projectIdentity !== null) throw new ControlPlaneError('PROTOCOL_INVALID');
  if (request.scope === 'project' && request.projectIdentity === null) throw new ControlPlaneError('PROTOCOL_INVALID');
  if (request.scope === 'project') {
    const identity = resolvePublicationProjectContext(context).projectIdentity;
    if (identity !== request.projectIdentity) throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}
function phaseChanges(plan: PublicationPlan, phase: 'shared' | 'harness') {
  return Object.freeze(plan.changes.filter(({ target }) =>
    phase === 'shared' ? target === 'advisor-controller' : target !== 'advisor-controller'));
}
function phaseBindings(plan: PublicationPlan, phase: 'shared' | 'harness'): readonly string[] {
  return Object.freeze(plan.bindings
    .filter(({ controller }) => phase === 'shared' ? controller : !controller)
    .map(({ binding }) => binding));
}
function dryRunPhase(plan: PublicationPlan, phase: 'shared' | 'harness'): DryRunPhaseRecord {
  return Object.freeze({
    phase, scope: 'home',
    selectedTargets: phase === 'shared' ? Object.freeze([]) : plan.selectedTargets,
    bindingOrder: phaseBindings(plan, phase),
    changes: phaseChanges(plan, phase)
  });
}
function dryRunPayload(plan: PublicationPlan): PublishDryRunResultPayload {
  return Object.freeze({
    scope: 'home', projectIdentity: null,
    buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
    phases: [dryRunPhase(plan, 'shared'), dryRunPhase(plan, 'harness')] as const
  });
}
function applyPhase(
  plan: PublicationPlan, phase: 'shared' | 'harness', releaseId: string, retainedReleaseId: string | null
): ApplyPhaseRecord {
  return Object.freeze({
    ...dryRunPhase(plan, phase), status: 'committed' as const, releaseId, retainedReleaseId
  });
}
function applyPayload(
  plan: PublicationPlan, releaseId: string, retainedReleaseId: string | null
): PublishApplyResultPayload {
  return Object.freeze({
    scope: 'home', projectIdentity: null,
    buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
    phases: [applyPhase(plan, 'shared', releaseId, retainedReleaseId),
      applyPhase(plan, 'harness', releaseId, retainedReleaseId)] as const
  });
}
function recoveryPayload(result: PublicationRecoveryOutcome, request: RecoverRequestPayload): RecoverResultPayload {
  if (result.action === 'none') {
    return Object.freeze({ scope: 'home', projectIdentity: null, action: 'none', phases: Object.freeze([]) });
  }
  if (result.releaseId === null) fail('RECOVERY_FAILED');
  const harnessBindings = result.bindingOrder.filter((binding) => binding !== '.evcrate/bin');
  if ((result.selectedTargets.length === 0) !== (harnessBindings.length === 0)) fail('RECOVERY_FAILED');
  const action = result.action === 'rolled-back' ? 'rolled-back' : 'finalized';
  const phases: RecoveryPhaseRecord[] = [{
    phase: 'shared', scope: 'home', releaseId: result.releaseId, action,
    selectedTargets: Object.freeze([]), bindingOrder: Object.freeze(['.evcrate/bin'])
  }];
  if (harnessBindings.length > 0) {
    phases.push({
      phase: 'harness', scope: 'home', releaseId: result.releaseId, action,
      selectedTargets: Object.freeze([...result.selectedTargets]),
      bindingOrder: Object.freeze([...harnessBindings])
    });
  }
  return Object.freeze({ scope: request.scope, projectIdentity: request.projectIdentity, action: 'recovered', phases: Object.freeze(phases) });
}
function assertApplyResultBudget(plan: PublicationPlan, releaseId: string): void {
  const candidate = applyPayload(plan, releaseId, releaseId);
  try {
    validatePublishApplyResultPayload(candidate);
    if (canonicalBytes(candidate).byteLength > MAX_PUBLICATION_RESULT_BYTES - 4096) fail('PUBLICATION_FAILED');
  } catch {
    fail('PUBLICATION_FAILED');
  }
}
function assertProjectApplyResultBudget(
  shared: PublicationPhasePlan, harness: PublicationPhasePlan
): void {
  const candidate = projectApplyPayload(
    shared, harness,
    { releaseId: 'shared-budget', retainedReleaseId: null },
    { releaseId: 'harness-budget', retainedReleaseId: null }
  );
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
  else writeAtomicFile(markerPath(stateRoot), canonicalJsonBytes(previousMarker));
  syncDirectory(stateRoot);
}
function existingRealAncestor(path: string): string {
  let current = resolve(path);
  while (true) {
    try {
      lstatSync(current);
      assertRealDirectory(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof ControlPlaneError) throw error;
        fail('PATH_UNSAFE', `failed stating ancestor of "${path}" at "${current}": ${(error as Error).message}`);
      }
      const parent = dirname(current);
      if (parent === current) fail('PATH_UNSAFE', `reached filesystem root without finding ancestor for "${path}"`);
      current = parent;
    }
  }
}
function ensureHomeDirectory(homeRoot: string): string {
  const resolved = resolve(homeRoot);
  assertNoSymlinkAncestors(resolved);
  const existing = lstatSync(resolved, { throwIfNoEntry: false });
  if (existing === undefined) {
    try {
      mkdirSync(resolved, { recursive: true });
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      fail('PATH_UNSAFE');
    }
  }
  assertRealDirectory(resolved);
  return resolved;
}
function preflightStateVolume(stateRoot: string, destinationRoot: string): void {
  assertNoSymlinkAncestors(destinationRoot);
  assertRealDirectory(destinationRoot);
  assertNoSymlinkAncestors(stateRoot);
  const ancestor = existingRealAncestor(stateRoot);
  if (!sameVolume(destinationRoot, ancestor)) {
    fail('PATH_UNSAFE', `destinationRoot "${destinationRoot}" and stateRoot ancestor "${ancestor}" are on different volumes`);
  }
}

function preflightTransaction(
  descriptor: TransactionDescriptor, plan: EnginePlan
): void {
  assertNoSymlinkAncestors(descriptor.destinationRoot);
  assertRealDirectory(descriptor.destinationRoot);
  assertNoSymlinkAncestors(descriptor.durableStateRoot);
  existingRealAncestor(descriptor.durableStateRoot);
  if (lstatSync(descriptor.durableStateRoot, { throwIfNoEntry: false }) !== undefined) {
    assertRealDirectory(descriptor.durableStateRoot);
  }
  assertNoSymlinkAncestors(descriptor.transactionWorkspaceRoot);
  if (lstatSync(descriptor.transactionWorkspaceRoot, { throwIfNoEntry: false }) !== undefined) {
    fail('PATH_UNSAFE', `transactionWorkspaceRoot already exists: "${descriptor.transactionWorkspaceRoot}"`);
  }
  const workspaceAncestor = existingRealAncestor(dirname(descriptor.transactionWorkspaceRoot));
  if (!sameVolume(descriptor.destinationRoot, workspaceAncestor)) {
    fail('PATH_UNSAFE', `destinationRoot "${descriptor.destinationRoot}" and workspace ancestor "${workspaceAncestor}" are on different volumes`);
  }
  if (plan.bindings.some(({ operations }) => operations.some(({ action }) => action === 'conflict'))) fail();
}
function applyTransaction(
  plan: EnginePlan, descriptor: TransactionDescriptor, previousMarker: Record<string, unknown> | null,
  options: PublicationOptions
): { readonly releaseId: string; readonly retainedReleaseId: string | null } {
  preflightTransaction(descriptor, plan);
  const preservedHarness = descriptor.scope === 'home'
    && plan.bindings.length === 1 && plan.bindings[0]?.controller === true
    ? publicationMarkerRecord(previousMarker, 'harness') : null;
  const previous = descriptor.scope === 'project'
    ? projectPriorOwnership(previousMarker) : homePriorOwnership(previousMarker);
  const journal = journalFor(plan, descriptor, previous);
  const mutable = journal as {
    operations: Array<Record<string, unknown>>; status: string;
    retain_transaction: boolean; retained_release_id: string | null;
    workspace_device: number | null; workspace_inode: number | null;
    workspace_parent_device: number | null; workspace_parent_inode: number | null;
  };
  let promotionStarted = false;
  try {
    // Persist staged intent before creating the workspace.
    writeJournal(descriptor.durableStateRoot, journal);
    mkdirSync(join(descriptor.transactionWorkspaceRoot, 'stage'), { recursive: true });
    const workspace = lstatSync(descriptor.transactionWorkspaceRoot);
    const workspaceParent = lstatSync(dirname(descriptor.transactionWorkspaceRoot));
    const workspaceDevice = Number(workspace.dev);
    const workspaceInode = Number(workspace.ino);
    const workspaceParentDevice = Number(workspaceParent.dev);
    const workspaceParentInode = Number(workspaceParent.ino);
    const validDevice = process.platform === 'win32'
      ? Number.isFinite(workspaceDevice) && Number.isFinite(workspaceParentDevice)
      : Number.isSafeInteger(workspaceDevice) && Number.isSafeInteger(workspaceParentDevice);
    const validInode = process.platform === 'win32'
      ? Number.isFinite(workspaceInode) && workspaceInode >= 0 && Number.isFinite(workspaceParentInode) && workspaceParentInode >= 0
      : Number.isSafeInteger(workspaceInode) && workspaceInode > 0 && Number.isSafeInteger(workspaceParentInode) && workspaceParentInode > 0;
    if (!workspace.isDirectory() || workspace.isSymbolicLink()
      || !validDevice || !validInode
      || workspaceDevice !== workspaceParentDevice) {
      fail('PATH_UNSAFE', `workspace validation failed: dev=${workspaceDevice}, parentDev=${workspaceParentDevice}, ino=${workspaceInode}, parentIno=${workspaceParentInode}`);
    }
    const progressRoot = join(descriptor.transactionWorkspaceRoot, 'progress');
    mkdirSync(progressRoot, { recursive: true });
    assertRealDirectory(progressRoot);
    syncDirectory(descriptor.transactionWorkspaceRoot);
    mutable.workspace_device = workspaceDevice;
    mutable.workspace_inode = workspaceInode;
    mutable.workspace_parent_device = workspaceParentDevice;
    mutable.workspace_parent_inode = workspaceParentInode;
    mutable.status = 'promoting';
    refreshJournal(mutable);
    writeJournal(descriptor.durableStateRoot, mutable);
    writeRelease(descriptor.durableStateRoot, mutable, preservedHarness);
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
      stageOperation(descriptor.transactionWorkspaceRoot, item.sourceRoot, item.operation, item.journalIndex);
      promotionStarted = true;
      const intended = promoteOperation(
        descriptor.transactionWorkspaceRoot, item.operation, item.journalIndex, touchedDirs
      );
      const entry = mutable.operations[item.journalIndex];
      if (!entry) fail();
      entry.promoted = true;
      entry.intended = intended;
      writeProgress(descriptor.transactionWorkspaceRoot, item.journalIndex, entry);
      options.hooks?.afterOperation?.(item.operation, workIndex);
    }
    for (const dir of touchedDirs) syncDirectory(dir);
    for (const item of work) assertIntended(item.operation);
    removePath(join(descriptor.transactionWorkspaceRoot, 'stage'));
    const retain = descriptor.retention === 'bounded-one-home-release'
      && hasBackups(descriptor.backupRoot)
      && transactionBytes(descriptor.transactionWorkspaceRoot) <= MAX_RETAINED_RELEASE_BYTES;
    mutable.status = 'committed';
    mutable.retain_transaction = retain;
    mutable.retained_release_id = retain ? descriptor.releaseId : null;
    refreshJournal(mutable);
    writeJournal(descriptor.durableStateRoot, mutable);
    writeRelease(descriptor.durableStateRoot, {
      ...journal, status: 'complete', retained_release_id: retain ? descriptor.releaseId : null,
      retain_transaction: retain
    }, preservedHarness);
    removePath(join(descriptor.transactionWorkspaceRoot, 'progress'));
    if (!retain) {
      removePath(descriptor.transactionWorkspaceRoot);
      if (descriptor.scope === 'project') syncDirectory(dirname(descriptor.transactionWorkspaceRoot));
    }
    syncDirectory(descriptor.durableStateRoot);
    let retainedReleaseId: string | null = retain ? descriptor.releaseId : null;
    if (descriptor.retention === 'bounded-one-home-release') {
      retainedReleaseId = cleanupReleases(
        descriptor.durableStateRoot, retain ? descriptor.releaseId : null,
        retainedMarkerId(previousMarker), options.now?.() ?? Date.now()
      );
      if (retainedReleaseId !== (retain ? descriptor.releaseId : null)) {
        writeRelease(descriptor.durableStateRoot, {
          ...journal, status: 'complete', retained_release_id: retainedReleaseId,
          retain_transaction: retainedReleaseId !== null
        }, preservedHarness);
      }
    }
    syncDirectory(descriptor.durableStateRoot);
    removePath(descriptor.journalPath);
    return { releaseId: descriptor.releaseId, retainedReleaseId };
  } catch (error) {
    const control = error instanceof ControlPlaneError ? error : null;
    if (!promotionStarted) {
      try { restoreNoPromotion(descriptor.durableStateRoot, descriptor.transactionWorkspaceRoot, previousMarker); }
      catch { throw new ControlPlaneError('ROLLBACK_FAILED'); }
      if (control) throw control;
      fail();
    }
    if (control?.code === 'CAS_CONFLICT') throw control;
    try {
      recoverPublicationUnlocked(
        descriptor.durableStateRoot, descriptor.destinationRoot, null,
        descriptor.scope === 'project' ? descriptor.projectIdentity : null
      );
    }
    catch { throw new ControlPlaneError('ROLLBACK_FAILED'); }
    if (control) throw control;
    fail();
  }
}
function writeRelease(
  stateRoot: string, value: Record<string, unknown>,
  preservedHarness: Record<string, unknown> | null = null
): void {
  if (!isPlainObject(value.records) || (value.scope !== 'home' && value.scope !== 'project')) {
    fail('PUBLICATION_FAILED');
  }
  const records: Record<string, unknown> = {};
  for (const [phase, record] of Object.entries(value.records)) {
    if (record === null) {
      records[phase] = phase === 'harness' && value.scope === 'home' && preservedHarness !== null
        ? preservedHarness : null;
      continue;
    }
    if (!isPlainObject(record)) fail('PUBLICATION_FAILED');
    records[phase] = {
      ...record,
      status: value.status === 'complete' ? 'complete' : 'promoting',
      retained_release_id: value.retained_release_id ?? null
    };
  }
  const marker = {
    schema_version: 2, transaction_type: 'target-publication', scope: value.scope, records
  };
  writeAtomicFile(markerPath(stateRoot), stateBytes(marker));
}
function scopedDryRunPhase(plan: PublicationPhasePlan): DryRunPhaseRecord {
  return Object.freeze({
    phase: plan.phase, scope: plan.scope, selectedTargets: plan.selectedTargets,
    bindingOrder: plan.bindingOrder, changes: plan.changes
  });
}
function projectStateRoot(context: InvocationContext, identity: string): string {
  return join(resolve(context.stateRoot), 'project-publication', identity);
}
function assertProjectMarkerBinding(
  marker: Record<string, unknown> | null, projectRoot: string, stateRoot: string, identity: string
): void {
  if (marker === null) return;
  if (marker.schema_version === 2) {
    if (marker.scope !== 'project') fail('PATH_UNSAFE');
    const record = publicationMarkerRecord(marker, 'harness');
    if (record === null
      || record.project_identity !== identity
      || record.destination_root !== resolve(projectRoot)
      || record.durable_state_root !== resolve(stateRoot)
      || typeof record.workspace_root !== 'string' || typeof record.workspace_name !== 'string'
      || resolve(record.workspace_root) !== join(resolve(projectRoot), record.workspace_name)) fail('PATH_UNSAFE');
    return;
  }
  if (marker.schema_version !== 1 || marker.transaction_type !== 'target-publication'
    || marker.scope !== 'project' || marker.project_identity !== identity
    || typeof marker.destination_root !== 'string' || typeof marker.durable_state_root !== 'string'
    || typeof marker.workspace_root !== 'string' || typeof marker.workspace_name !== 'string'
    || resolve(marker.destination_root) !== resolve(projectRoot)
    || resolve(marker.durable_state_root) !== resolve(stateRoot)
    || resolve(marker.workspace_root) !== join(resolve(projectRoot), marker.workspace_name)) fail('PATH_UNSAFE');
}

function projectDryRunPayload(
  shared: PublicationPhasePlan, harness: PublicationPhasePlan
): PublishDryRunResultPayload {
  return Object.freeze({
    scope: 'project', projectIdentity: harness.projectIdentity,
    buildManifestPath: shared.buildManifestPath, buildManifestDigest: shared.buildManifestDigest,
    phases: [scopedDryRunPhase(shared), scopedDryRunPhase(harness)] as const
  });
}
function projectApplyPayload(
  shared: PublicationPhasePlan, harness: PublicationPhasePlan,
  sharedResult: { readonly releaseId: string; readonly retainedReleaseId: string | null },
  harnessResult: { readonly releaseId: string; readonly retainedReleaseId: string | null }
): PublishApplyResultPayload {
  return Object.freeze({
    scope: 'project', projectIdentity: harness.projectIdentity,
    buildManifestPath: shared.buildManifestPath, buildManifestDigest: shared.buildManifestDigest,
    phases: [
      Object.freeze({ ...scopedDryRunPhase(shared), status: 'committed' as const,
        releaseId: sharedResult.releaseId, retainedReleaseId: sharedResult.retainedReleaseId }),
      Object.freeze({ ...scopedDryRunPhase(harness), status: 'committed' as const,
        releaseId: harnessResult.releaseId, retainedReleaseId: null })
    ] as const
  });
}
function projectPartialPayload(
  shared: PublicationPhasePlan, harness: PublicationPhasePlan,
  sharedResult: { readonly releaseId: string; readonly retainedReleaseId: string | null }
): PublishApplyResultPayload {
  return Object.freeze({
    scope: 'project', projectIdentity: harness.projectIdentity,
    buildManifestPath: shared.buildManifestPath, buildManifestDigest: shared.buildManifestDigest,
    phases: [
      Object.freeze({ ...scopedDryRunPhase(shared), status: 'committed' as const,
        releaseId: sharedResult.releaseId, retainedReleaseId: sharedResult.retainedReleaseId }),
      Object.freeze({ ...scopedDryRunPhase(harness), status: 'failed' as const,
        releaseId: null, retainedReleaseId: null })
    ] as const
  });
}
function composeHomePublicationPlan(planSet: PublicationPlanSet): PublicationPlan {
  const bindings = Object.freeze([...planSet.shared.bindings, ...planSet.harness.bindings]);
  const changes = Object.freeze([...planSet.shared.changes, ...planSet.harness.changes]);
  if (changes.length > MAX_PUBLICATION_CHANGES) fail();
  return Object.freeze({
    build: planSet.build,
    buildManifestPath: planSet.buildManifestPath,
    buildManifestDigest: planSet.buildManifestDigest,
    selectedTargets: Object.freeze([...planSet.harness.selectedTargets]),
    bindingOrder: Object.freeze(bindings.map(({ binding }) => binding)),
    bindings, changes, managedOwnership: planSet.harness.managedOwnership
  });
}
function homePublicationPlan(
  context: InvocationContext, stateRoot: string, marker: Record<string, unknown> | null
): PublicationPlan {
  if (marker?.schema_version === 2) {
    return composeHomePublicationPlan(createPublicationPlanSet(context, {
      scope: 'home', priorManagedOwnership: homePriorOwnership(marker)
    }));
  }
  return createPublicationPlan(context, markerPath(stateRoot));
}
export function publishDryRun(
  context: InvocationContext,
  request: PublishRequestPayload = { scope: 'home', selectedTargets: context.selectedTargetIds }
): PublishDryRunResultPayload {
  assertPublishRequest(context, request);
  if (request.scope === 'project') {
    const projectContext = resolvePublicationProjectContext(context);
    const identity = projectContext.projectIdentity;
    const projectState = projectStateRoot(context, identity);
    if (readPublicationJournal(projectState)) fail('RECOVERY_FAILED');
    const projectMarker = readOptionalPublicationMarker(markerPath(projectState));
    const projectRecord = projectMarker?.schema_version === 2
      ? publicationMarkerRecord(projectMarker, 'harness') : projectMarker;
    assertProjectMarkerBinding(projectMarker, projectContext.canonicalRoot, projectState, identity);
    if (projectRecord && projectRecord.status !== 'complete' && projectRecord.status !== 'recovered') {
      fail('RECOVERY_FAILED');
    }
    const plans = createPublicationPlanSet(context, {
      scope: 'project', priorManagedOwnership: projectPriorOwnership(projectMarker)
    });
    return projectDryRunPayload(plans.shared, plans.harness);
  }
  const stateRoot = publicationStateRoot(context.homeRoot); assertNoSymlinkAncestors(context.homeRoot);
  if (readPublicationJournal(stateRoot)) fail('RECOVERY_FAILED');
  const marker = readOptionalPublicationMarker(markerPath(stateRoot));
  if (marker?.schema_version === 2) {
    if (marker.scope !== 'home') fail('PATH_UNSAFE');
    for (const phase of ['shared', 'harness'] as const) {
      const record = publicationMarkerRecord(marker, phase);
      if (record !== null && record.status !== 'complete' && record.status !== 'recovered') {
        fail('RECOVERY_FAILED');
      }
    }
  } else if (marker?.transaction_type === 'target-publication'
    && (marker.scope !== undefined || (marker.status !== 'complete' && marker.status !== 'recovered'))) {
    fail('RECOVERY_FAILED');
  }
  const plan = homePublicationPlan(context, stateRoot, marker);
  return dryRunPayload(plan);
}
export function publishApply(
  context: InvocationContext, options: PublicationOptions = {},
  request: PublishRequestPayload = { scope: 'home', selectedTargets: context.selectedTargetIds }
): PublishApplyResultPayload {
  assertPublishRequest(context, request);
  if (request.scope === 'project') {
    const projectContext = resolvePublicationProjectContext(context);
    const identity = projectContext.projectIdentity;
    const projectState = projectStateRoot(context, identity);
    const homeState = publicationStateRoot(context.homeRoot);
    ensureHomeDirectory(context.homeRoot);
    const projectJournal = readPublicationJournal(projectState);
    const earlyProjectMarker = readOptionalPublicationMarker(markerPath(projectState));
    const earlyProjectRecord = earlyProjectMarker?.schema_version === 2
      ? publicationMarkerRecord(earlyProjectMarker, 'harness') : earlyProjectMarker;
    if (!projectJournal && earlyProjectMarker?.transaction_type === 'target-publication'
      && earlyProjectRecord !== null
      && earlyProjectRecord.status !== 'complete' && earlyProjectRecord.status !== 'recovered') {
      fail('RECOVERY_FAILED');
    }
    const earlyPriorOwnership = projectJournal && earlyProjectMarker?.schema_version === 1
      && earlyProjectMarker.transaction_type === 'target-publication'
      && earlyProjectMarker.status !== 'complete' && earlyProjectMarker.status !== 'recovered'
      ? Object.freeze({}) : projectPriorOwnership(earlyProjectMarker);
    assertProjectMarkerBinding(earlyProjectMarker, projectContext.canonicalRoot, projectState, identity);
    const earlyPlans = createPublicationPlanSet(context, {
      scope: 'project', priorManagedOwnership: earlyPriorOwnership
    });
    const earlyHomeDescriptor = createTransactionDescriptor(
      earlyPlans.shared, 'shared', 'home', randomUUID().replaceAll('-', ''),
      context.homeRoot, homeState, null
    );
    const earlyProjectDescriptor = createTransactionDescriptor(
      earlyPlans.harness, 'harness', 'project', randomUUID().replaceAll('-', ''),
      earlyPlans.harness.destinationRoot, projectState, identity
    );
    preflightTransaction(earlyHomeDescriptor, earlyPlans.shared);
    preflightTransaction(earlyProjectDescriptor, earlyPlans.harness);
    assertProjectApplyResultBudget(earlyPlans.shared, earlyPlans.harness);
    preflightStateVolume(homeState, context.homeRoot);
    return withPublishLock(homeState, () => {
      if (!sameVolume(homeState, context.homeRoot)) fail('PATH_UNSAFE');
      recoverAndMigrateHomeStateUnlocked(homeState, context.homeRoot);
      const homeMarker = readOptionalPublicationMarker(markerPath(homeState));
      const lockedPlans = createPublicationPlanSet(context, {
        scope: 'project', build: earlyPlans.build,
        priorManagedOwnership: earlyPriorOwnership
      });
      const homeDescriptor = createTransactionDescriptor(
        lockedPlans.shared, 'shared', 'home', randomUUID().replaceAll('-', ''),
        context.homeRoot, homeState, null
      );
      preflightTransaction(homeDescriptor, lockedPlans.shared);
      assertProjectApplyResultBudget(lockedPlans.shared, lockedPlans.harness);
      const sharedResult = applyTransaction(lockedPlans.shared, homeDescriptor, homeMarker, options);
      let failedHarnessPlan = lockedPlans.harness;
      try {
        return withLock(projectState, 'publish.lock', () => {
          try {
            recoverAndMigrateProjectStateUnlocked(projectState, context.projectRoot, identity);
            const projectMarker = readOptionalPublicationMarker(markerPath(projectState));
            assertProjectMarkerBinding(projectMarker, projectContext.canonicalRoot, projectState, identity);
            const plans = createPublicationPlanSet(context, {
              scope: 'project', build: earlyPlans.build,
              priorManagedOwnership: projectPriorOwnership(projectMarker)
            });
            failedHarnessPlan = plans.harness;
            const projectDescriptor = createTransactionDescriptor(
              plans.harness, 'harness', 'project', randomUUID().replaceAll('-', ''),
              plans.harness.destinationRoot, projectState, identity
            );
            preflightTransaction(projectDescriptor, plans.harness);
            assertProjectApplyResultBudget(lockedPlans.shared, plans.harness);
            const harnessResult = applyTransaction(plans.harness, projectDescriptor, projectMarker, options);
            return projectApplyPayload(lockedPlans.shared, plans.harness, sharedResult, harnessResult);
          } catch (error) {
            let code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' =
              error instanceof ControlPlaneError && error.code === 'ROLLBACK_FAILED'
                ? 'ROLLBACK_FAILED' : 'PUBLICATION_FAILED';
            if (code === 'PUBLICATION_FAILED') {
              try {
                if (readPublicationJournal(projectState)) {
                  recoverPublicationUnlocked(projectState, context.projectRoot, null, identity);
                }
              } catch {
                code = 'ROLLBACK_FAILED';
              }
            }
            throw new PublicationPartialError(
              projectPartialPayload(lockedPlans.shared, failedHarnessPlan, sharedResult), code
            );
          }
        });
      } catch (error) {
        if (error instanceof PublicationPartialError) throw error;
        const code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' =
          error instanceof ControlPlaneError && error.code === 'ROLLBACK_FAILED'
            ? 'ROLLBACK_FAILED' : 'PUBLICATION_FAILED';
        throw new PublicationPartialError(
          projectPartialPayload(lockedPlans.shared, failedHarnessPlan, sharedResult), code
        );
      }
    });
  }
  const stateRoot = publicationStateRoot(context.homeRoot);
  ensureHomeDirectory(context.homeRoot);
  preflightStateVolume(stateRoot, context.homeRoot);
  return withPublishLock(stateRoot, () => {
    if (!sameVolume(stateRoot, context.homeRoot)) {
      fail('PATH_UNSAFE', `stateRoot "${stateRoot}" and homeRoot "${context.homeRoot}" are on different volumes`);
    }
    recoverAndMigrateHomeStateUnlocked(stateRoot, context.homeRoot);
    const previousMarker = readOptionalPublicationMarker(markerPath(stateRoot));
    const plan = homePublicationPlan(context, stateRoot, previousMarker);
    const releaseId = randomUUID().replaceAll('-', '');
    assertApplyResultBudget(plan, releaseId);
    const descriptor = createTransactionDescriptor(
      plan, 'shared', 'home', releaseId, context.homeRoot, stateRoot, null
    );
    preflightTransaction(descriptor, plan);
    const result = applyTransaction(plan, descriptor, previousMarker, options);
    return applyPayload(plan, releaseId, result.retainedReleaseId);
  });
}
export function recoverPublication(
  context: InvocationContext,
  request: RecoverRequestPayload = { scope: 'home', projectIdentity: null, releaseId: null }
): RecoverResultPayload {
  assertRecoverRequest(context, request);
  if (request.scope === 'project') {
    const identity = request.projectIdentity;
    if (identity === null) fail('PATH_UNSAFE');
    const stateRoot = projectStateRoot(context, identity);
    return withPublishLock(stateRoot, () => {
      const result = recoverAndMigrateProjectStateUnlocked(
        stateRoot, context.projectRoot, identity, request.releaseId
      );
      if (result.action === 'none') return Object.freeze({
        scope: 'project', projectIdentity: identity, action: 'none', phases: Object.freeze([])
      });
      if (result.releaseId === null) fail('RECOVERY_FAILED');
      return Object.freeze({
        scope: 'project', projectIdentity: identity, action: 'recovered',
        phases: Object.freeze([{
          phase: 'harness' as const, scope: 'project' as const, releaseId: result.releaseId,
          action: result.action === 'rolled-back' ? 'rolled-back' as const : 'finalized' as const,
          selectedTargets: Object.freeze([...result.selectedTargets]),
          bindingOrder: Object.freeze([...result.bindingOrder])
        }])
      });
    });
  }
  const stateRoot = publicationStateRoot(context.homeRoot); ensureHomeDirectory(context.homeRoot);
  preflightStateVolume(stateRoot, context.homeRoot);
  return withPublishLock(stateRoot, () => {
    if (!sameVolume(stateRoot, context.homeRoot)) fail('PATH_UNSAFE');
    const result = recoverAndMigrateHomeStateUnlocked(stateRoot, context.homeRoot, request.releaseId);
    return recoveryPayload(result, request);
  });
}
export interface PublicationHandler {
  publishDryRun(
    context: InvocationContext, request?: PublishRequestPayload
  ): PublishDryRunResultPayload | Promise<PublishDryRunResultPayload>;
  publishApply(
    context: InvocationContext, options?: PublicationOptions, request?: PublishRequestPayload
  ): PublishApplyResultPayload | Promise<PublishApplyResultPayload>;
  recover(
    context: InvocationContext, request?: RecoverRequestPayload
  ): RecoverResultPayload | Promise<RecoverResultPayload>;
}
export const defaultPublicationHandler: PublicationHandler = Object.freeze({
  publishDryRun,
  publishApply,
  recover: recoverPublication
});
