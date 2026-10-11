import { lstatSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  MAX_PUBLICATION_FILE_BYTES, PUBLICATION_TRAVERSAL_LIMITS, publicationSnapshot,
  readOptionalPublicationMarker, publicationMarkerRecord, type PublicationNodeSnapshot
} from './publication-inventory.js';
import {
  MAX_PUBLICATION_RESULT_BYTES, MAX_PUBLICATION_STATE_BYTES,
  validatePublishApplyResultPayload, publicationStateTargets, publicationStateLayout, publicationFlatOwnership,
  type ApplyPhaseRecord, type DryRunPhaseRecord, type PublishApplyResultPayload,
  type PublishDryRunResultPayload, type PublicationScope, type PublishRequestPayload,
  type RecoverRequestPayload, type RecoverResultPayload, type RecoveryPhaseRecord
} from '../protocol/publication-payloads.js';
import { canonicalBytes } from '../protocol/json.js';
import { canonicalJsonBytes, hashBytes } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';
import { removePath, sameVolume, syncDirectory, writeAtomicFile, writeAtomicProjectionFile } from '../filesystem/atomic.js';
import { RELEASE_MARKER_NAME, withPublishLock } from '../filesystem/locking.js';
import { isPlainObject } from '../protocol/json.js';
import {
  createPublicationPlan, createPublicationPlanSet, type PlannedPublicationOperation,
  type PriorManagedOwnership, type PublicationPhasePlan, type PublicationPlan
} from './publication-plan.js';
import { detectLegacyLeftovers } from './legacy-leftovers.js';

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
  readonly logicalPhase: 'harness';
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
  & { readonly bindingOrder?: readonly string[]; readonly managedOwnership?: PriorManagedOwnership };
function createTransactionDescriptor(
  plan: EnginePlan, logicalPhase: 'harness', scope: PublicationScope, releaseId: string,
  destinationRoot: string, durableStateRoot: string, projectIdentity: string | null
): TransactionDescriptor {
  const transactionWorkspaceRoot = scope === 'project'
    ? join(resolve(destinationRoot), `.evcrate-publish-${releaseId}`)
    : join(resolve(durableStateRoot), `release-${releaseId}`);
  const bindings = Object.freeze(plan.bindingOrder ?? plan.bindings.map(({ binding }) => binding));
  const operations = Object.freeze(plan.bindings.flatMap(({ operations }) => operations));

  return Object.freeze({
    logicalPhase, scope, releaseId, destinationRoot: resolve(destinationRoot),
    durableStateRoot: resolve(durableStateRoot), transactionWorkspaceRoot,
    journalPath: join(resolve(durableStateRoot), PUBLICATION_JOURNAL_NAME),
    markerPath: markerPath(durableStateRoot), backupRoot: join(transactionWorkspaceRoot, 'backups'),
    selectedTargets: Object.freeze([...plan.selectedTargets]), projectIdentity,
    lockPaths: Object.freeze([join(resolve(durableStateRoot), 'publish.lock')]),
    lockOrder: Object.freeze([scope]),
    retention: scope === 'project' ? 'none' : 'bounded-one-home-release',
    bindings, operations
  });
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
  if (!sameSnapshot(publicationSnapshot(operation.destination), operation.beforeSnapshot)) fail('CAS_CONFLICT');
}
function assertIntended(operation: PlannedPublicationOperation): PublicationNodeSnapshot {
  const current = publicationSnapshot(operation.destination);
  if (operation.intendedHash === null) {
    if (current.present) fail('PUBLICATION_FAILED');
    return current;
  }
  if (!current.present || current.kind !== 'file'
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
function stateRecord(
  plan: EnginePlan, descriptor: TransactionDescriptor, phase: 'harness',
  managedPaths: PriorManagedOwnership, previousManagedPaths: PriorManagedOwnership
): Record<string, unknown> {
  return {
    phase, scope: descriptor.scope, status: 'promoting',
    release_id: descriptor.releaseId,
    selected_targets: [...plan.selectedTargets],
    binding_order: [...descriptor.bindings],
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
      ...(operation.cleanup === undefined ? {} : { cleanup: operation.cleanup }),
      relative_path: operation.relativePath,
      kind: 'file',
      action: operation.action, destination: operation.relativePath === operation.binding
        ? operation.binding : `${operation.binding}/${operation.relativePath}`,
      before, backup: mutates && before.present ? `backups/${index}` : null,
      intendedHash: operation.intendedHash,
      intended: !mutates && before.present ? before : null, promoted: false
    };
  });
  const managedPaths = plan.managedOwnership ?? {};
  const records = { harness: stateRecord(plan, descriptor, 'harness', managedPaths, previous) };
  return {
    schema_version: 4, transaction_type: 'target-publication', status: 'staged',
    logical_phase: 'harness',
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
function stageOperation(transaction: string, operation: PlannedPublicationOperation, index: number): void {
  const stage = join(transaction, 'stage');
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
    if (!sameSnapshot(publicationSnapshot(backup), operation.beforeSnapshot)) {
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
  if (operation.content !== null) {
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
  const record = marker?.schema_version === 2 || marker?.schema_version === 3 ? publicationMarkerRecord(marker, phase) : marker;
  const value = record?.managed_paths;
  if (value === undefined) return Object.freeze({});
  if (!isPlainObject(value)) fail('RECOVERY_FAILED');
  if (marker?.schema_version === 2 || marker?.schema_version === 3) return value as PriorManagedOwnership;
  return Object.freeze({});
}
function homePriorOwnership(marker: Record<string, unknown> | null): PriorManagedOwnership {
  if (marker?.schema_version === 2 || marker?.schema_version === 3) return markerManagedOwnership(marker, 'harness');
  if (marker?.transaction_type === 'target-publication') {
    if (marker.status !== 'complete' && marker.status !== 'recovered') fail('RECOVERY_FAILED');
    const selected = publicationStateTargets(marker.selected_targets, true);
    const layout = publicationStateLayout(marker.binding_order, selected, 'home', true);
    return publicationFlatOwnership(marker.managed_paths, selected, 'home', layout.generation);
  }
  return Object.freeze({});
}
function projectPriorOwnership(marker: Record<string, unknown> | null): PriorManagedOwnership {
  if (marker?.schema_version === 2 || marker?.schema_version === 3) return markerManagedOwnership(marker, 'harness');
  if (marker === null || marker.managed_paths === undefined) return Object.freeze({});
  const selected = publicationStateTargets(marker.selected_targets);
  const layout = publicationStateLayout(marker.binding_order, selected, 'project');
  return publicationFlatOwnership(marker.managed_paths, selected, 'project', layout.generation);
}
function parseRetainedId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) fail('RECOVERY_FAILED');
  return value;
}
function retainedMarkerIds(marker: Record<string, unknown> | null): readonly string[] {
  if (marker?.schema_version === 2) {
    const sharedId = parseRetainedId(publicationMarkerRecord(marker, 'shared')?.retained_release_id);
    const harnessId = parseRetainedId(publicationMarkerRecord(marker, 'harness')?.retained_release_id);
    const result: string[] = [];
    if (sharedId !== null) result.push(sharedId);
    if (harnessId !== null && harnessId !== sharedId) result.push(harnessId);
    return Object.freeze(result);
  }
  const record = marker?.schema_version === 3 ? publicationMarkerRecord(marker, 'harness') : marker;
  const id = parseRetainedId(record?.retained_release_id);
  return Object.freeze(id !== null ? [id] : []);
}
function cleanupReleases(
  stateRoot: string, current: string | null, priors: readonly string[], now: number
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
  const known = new Set([current, ...priors].filter((value): value is string => value !== null));
  if (candidates.some(({ id }) => !known.has(id))) fail('RECOVERY_FAILED');
  const find = (id: string | null): { id: string; path: string; age: number; bytes: number } | undefined =>
    id === null ? undefined : candidates.find((candidate) => candidate.id === id);
  let retained = find(current);
  if (current !== null && retained === undefined) fail('RECOVERY_FAILED');
  if (retained !== undefined && (retained.age >= MAX_RETAINED_RELEASE_AGE_MS || retained.bytes > MAX_RETAINED_RELEASE_BYTES)) retained = undefined;
  if (retained === undefined) {
    for (const prior of priors) {
      const candidate = find(prior);
      if (candidate !== undefined && candidate.age < MAX_RETAINED_RELEASE_AGE_MS && candidate.bytes <= MAX_RETAINED_RELEASE_BYTES) {
        retained = candidate;
        break;
      }
    }
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
function dryRunPhase(plan: PublicationPlan, phase: 'harness'): DryRunPhaseRecord {
  return Object.freeze({
    phase, scope: 'home', selectedTargets: plan.selectedTargets,
    bindingOrder: plan.bindingOrder, changes: plan.changes
  });
}
function dryRunPayload(
  plan: PublicationPlan,
  options?: {
    readonly destinationRoot?: string;
    readonly previousMarker?: Record<string, unknown> | null;
  }
): PublishDryRunResultPayload {
  const previousOwnership = options?.previousMarker !== undefined
    ? homePriorOwnership(options.previousMarker) : Object.freeze({});
  const legacyLeftovers = options?.destinationRoot !== undefined
    ? detectLegacyLeftovers({
        scope: 'home',
        selectedTargets: plan.selectedTargets,
        destinationRoot: options.destinationRoot,
        currentOwnership: plan.managedOwnership,
        previousOwnership
      })
    : Object.freeze([]);
  return Object.freeze({
    scope: 'home', projectIdentity: null,
    buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
    phases: [dryRunPhase(plan, 'harness')] as const,
    legacyLeftovers
  });
}
function applyPhase(
  plan: PublicationPlan, phase: 'harness', releaseId: string, retainedReleaseId: string | null
): ApplyPhaseRecord {
  return Object.freeze({
    ...dryRunPhase(plan, phase), status: 'committed' as const, releaseId, retainedReleaseId
  });
}
function applyPayload(
  plan: PublicationPlan, releaseId: string, retainedReleaseId: string | null,
  options?: {
    readonly destinationRoot?: string;
    readonly previousMarker?: Record<string, unknown> | null;
  }
): PublishApplyResultPayload {
  const previousOwnership = options?.previousMarker !== undefined
    ? homePriorOwnership(options.previousMarker) : Object.freeze({});
  const legacyLeftovers = options?.destinationRoot !== undefined
    ? detectLegacyLeftovers({
        scope: 'home',
        selectedTargets: plan.selectedTargets,
        destinationRoot: options.destinationRoot,
        currentOwnership: plan.managedOwnership,
        previousOwnership
      })
    : Object.freeze([]);
  return Object.freeze({
    scope: 'home', projectIdentity: null,
    buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
    phases: [applyPhase(plan, 'harness', releaseId, retainedReleaseId)] as const,
    legacyLeftovers
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
  const phases: RecoveryPhaseRecord[] = [];
  if (result.bindingOrder.includes('.evcrate/bin')) phases.push({
    phase: 'shared', scope: 'home', releaseId: result.releaseId, action,
    selectedTargets: Object.freeze([]), bindingOrder: Object.freeze(['.evcrate/bin'])
  });
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
  harness: PublicationPhasePlan
): void {
  const candidate = projectApplyPayload(
    harness, { releaseId: 'harness-budget', retainedReleaseId: null }
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
    // A v4 journal identifies the real scoped workspace before marker or
    // harness destination mutation.
    writeJournal(descriptor.durableStateRoot, mutable);
    writeRelease(descriptor.durableStateRoot, mutable);
    mutable.status = 'promoting';
    refreshJournal(mutable);
    writeJournal(descriptor.durableStateRoot, mutable);
    const work: Array<{ operation: PlannedPublicationOperation; journalIndex: number }> = [];
    let journalIndex = 0;
    for (const [bindingIndex, binding] of plan.bindings.entries()) {
      options.hooks?.beforeBinding?.(binding.binding, bindingIndex);
      for (const operation of binding.operations) {
        if (operation.action !== 'noop' && operation.action !== 'preserve') {
          work.push({ operation, journalIndex });
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
      stageOperation(descriptor.transactionWorkspaceRoot, item.operation, item.journalIndex);
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
    });
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
        retainedMarkerIds(previousMarker), options.now?.() ?? Date.now()
      );
      if (retainedReleaseId !== (retain ? descriptor.releaseId : null)) {
        writeRelease(descriptor.durableStateRoot, {
          ...journal, status: 'complete', retained_release_id: retainedReleaseId,
          retain_transaction: retainedReleaseId !== null
        });
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
function writeRelease(stateRoot: string, value: Record<string, unknown>): void {
  if (!isPlainObject(value.records) || (value.scope !== 'home' && value.scope !== 'project')) {
    fail('PUBLICATION_FAILED');
  }
  const records: Record<string, unknown> = {};
  for (const [phase, record] of Object.entries(value.records)) {
    if (phase !== 'harness' || record === null) fail('PUBLICATION_FAILED');
    if (!isPlainObject(record)) fail('PUBLICATION_FAILED');
    records[phase] = {
      ...record,
      status: value.status === 'complete' ? 'complete' : 'promoting',
      retained_release_id: value.retained_release_id ?? null
    };
  }
  const marker = {
    schema_version: 3, transaction_type: 'target-publication', scope: value.scope, records
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
  if (marker.schema_version === 2 || marker.schema_version === 3) {
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
  harness: PublicationPhasePlan,
  previousMarker: Record<string, unknown> | null = null
): PublishDryRunResultPayload {
  const previousOwnership = projectPriorOwnership(previousMarker);
  const legacyLeftovers = detectLegacyLeftovers({
    scope: 'project',
    selectedTargets: harness.selectedTargets,
    destinationRoot: harness.destinationRoot,
    currentOwnership: harness.managedOwnership,
    previousOwnership
  });
  return Object.freeze({
    scope: 'project', projectIdentity: harness.projectIdentity,
    buildManifestPath: harness.buildManifestPath, buildManifestDigest: harness.buildManifestDigest,
    phases: [scopedDryRunPhase(harness)] as const,
    legacyLeftovers
  });
}
function projectApplyPayload(
  harness: PublicationPhasePlan,
  harnessResult: { readonly releaseId: string; readonly retainedReleaseId: string | null },
  previousMarker: Record<string, unknown> | null = null,
  scanLeftovers = true
): PublishApplyResultPayload {
  const previousOwnership = projectPriorOwnership(previousMarker);
  const legacyLeftovers = scanLeftovers
    ? detectLegacyLeftovers({
        scope: 'project',
        selectedTargets: harness.selectedTargets,
        destinationRoot: harness.destinationRoot,
        currentOwnership: harness.managedOwnership,
        previousOwnership
      })
    : Object.freeze([]);
  return Object.freeze({
    scope: 'project', projectIdentity: harness.projectIdentity,
    buildManifestPath: harness.buildManifestPath, buildManifestDigest: harness.buildManifestDigest,
    phases: [
      Object.freeze({ ...scopedDryRunPhase(harness), status: 'committed' as const,
        releaseId: harnessResult.releaseId, retainedReleaseId: null })
    ] as const,
    legacyLeftovers
  });
}
function homePublicationPlan(
  context: InvocationContext, stateRoot: string, marker: Record<string, unknown> | null
): PublicationPlan {
  if (marker?.schema_version === 2 || marker?.schema_version === 3) {
    return createPublicationPlanSet(context, {
      scope: 'home', priorManagedOwnership: homePriorOwnership(marker)
    }).harness;
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
    const projectRecord = projectMarker?.schema_version === 2 || projectMarker?.schema_version === 3
      ? publicationMarkerRecord(projectMarker, 'harness') : projectMarker;
    assertProjectMarkerBinding(projectMarker, projectContext.canonicalRoot, projectState, identity);
    if (projectRecord && projectRecord.status !== 'complete' && projectRecord.status !== 'recovered') {
      fail('RECOVERY_FAILED');
    }
    const plans = createPublicationPlanSet(context, {
      scope: 'project', priorManagedOwnership: projectPriorOwnership(projectMarker)
    });
    return projectDryRunPayload(plans.harness, projectMarker);
  }
  const stateRoot = publicationStateRoot(context.homeRoot); assertNoSymlinkAncestors(context.homeRoot);
  if (readPublicationJournal(stateRoot)) fail('RECOVERY_FAILED');
  const marker = readOptionalPublicationMarker(markerPath(stateRoot));
  if (marker?.schema_version === 2 || marker?.schema_version === 3) {
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
  return dryRunPayload(plan, { destinationRoot: context.homeRoot, previousMarker: marker });
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
    const earlyMarker = readOptionalPublicationMarker(markerPath(projectState));
    const earlyPlans = createPublicationPlanSet(context, {
      scope: 'project', priorManagedOwnership: projectPriorOwnership(earlyMarker)
    });
    const earlyDescriptor = createTransactionDescriptor(
      earlyPlans.harness, 'harness', 'project', randomUUID().replaceAll('-', ''),
      projectContext.canonicalRoot, projectState, identity
    );
    preflightTransaction(earlyDescriptor, earlyPlans.harness);
    return withPublishLock(projectState, () => {
      recoverAndMigrateProjectStateUnlocked(projectState, projectContext.canonicalRoot, identity);
      const projectMarker = readOptionalPublicationMarker(markerPath(projectState));
      assertProjectMarkerBinding(projectMarker, projectContext.canonicalRoot, projectState, identity);
      const plans = createPublicationPlanSet(context, {
        scope: 'project', priorManagedOwnership: projectPriorOwnership(projectMarker)
      });
      const descriptor = createTransactionDescriptor(
        plans.harness, 'harness', 'project', randomUUID().replaceAll('-', ''),
        projectContext.canonicalRoot, projectState, identity
      );
      assertProjectApplyResultBudget(plans.harness);
      try {
        const result = applyTransaction(plans.harness, descriptor, projectMarker, options);
        return projectApplyPayload(plans.harness, result, projectMarker);
      } catch (error) {
        if (readPublicationJournal(projectState)) {
          try {
            recoverPublicationUnlocked(projectState, projectContext.canonicalRoot, null, identity);
          } catch {
            throw new ControlPlaneError('ROLLBACK_FAILED');
          }
        }
        throw error;
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
      plan, 'harness', 'home', releaseId, context.homeRoot, stateRoot, null
    );
    preflightTransaction(descriptor, plan);
    const result = applyTransaction(plan, descriptor, previousMarker, options);
    return applyPayload(plan, releaseId, result.retainedReleaseId, { destinationRoot: context.homeRoot, previousMarker });
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
