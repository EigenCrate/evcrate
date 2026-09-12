import { lstatSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  MAX_PUBLICATION_CHANGES, MAX_PUBLICATION_STATE_BYTES, PUBLICATION_BINDING_ORDER, PUBLICATION_CHANGE_ACTIONS,
  PUBLICATION_LOCAL_ROOTS, PUBLICATION_PROJECT_TARGET_BINDINGS, PUBLICATION_TARGET_BINDINGS, PUBLICATION_TARGET_LOCAL_ROOTS,
  type PublicationChangeAction, type PublicationTarget, type PublicationScope
} from '../protocol/publication-payloads.js';
import {
  assertNoSymlinkAncestors, assertOwnerControlledDirectory, assertOwnerOnlyDirectory,
  assertOwnerOnlyFile, containedPath, normalizeRelativePath
} from '../filesystem/paths.js';
import { canonicalJsonBytes, hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, sameVolume, syncDirectory } from '../filesystem/atomic.js';
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
  readonly intended: PublicationNodeSnapshot | null; readonly promoted: boolean; readonly mode: number;
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
  readonly scope: PublicationScope; readonly destination_root: string; readonly durable_state_root: string;
  readonly workspace_root: string; readonly workspace_name: string;
  readonly workspace_device: number | null; readonly workspace_inode: number | null;
  readonly workspace_parent_device: number | null; readonly workspace_parent_inode: number | null;
  readonly legacy_without_workspace_identity: boolean; readonly project_identity: string | null;
  readonly retention: 'bounded-one-home-release' | 'none';
  readonly lock_paths: readonly string[]; readonly lock_order: readonly string[];
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
function nullableSafeInteger(value: unknown, maximum: number): number | null {
  return value === undefined || value === null ? null : safeInteger(value, maximum);
}
function targets(value: unknown, allowEmpty = false): readonly PersistedTarget[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length)) fail();
  try {
    const result = value.map((entry) => normalizeTarget(entry));
    if (new Set(result).size !== result.length) fail();
    return Object.freeze(result);
  } catch { fail(); }
}
function expectedBindings(selectedTargets: readonly PersistedTarget[], scope: PublicationScope): readonly string[] {
  const names = new Set<string>(scope === 'home' ? ['.evcrate/bin'] : []);
  for (const target of selectedTargets) {
    const bindings = scope === 'home'
      ? PUBLICATION_TARGET_BINDINGS[target] : PUBLICATION_PROJECT_TARGET_BINDINGS[target];
    if (!bindings) fail();
    for (const binding of bindings) {
      if (names.has(binding)) fail();
      names.add(binding);
    }
  }
  if (scope === 'project') {
    return Object.freeze(selectedTargets.flatMap((target) => PUBLICATION_PROJECT_TARGET_BINDINGS[target]));
  }
  return Object.freeze(PUBLICATION_BINDING_ORDER.filter((binding) => names.has(binding)));
}
function order(
  value: unknown, selectedTargets: readonly PersistedTarget[], scope: PublicationScope = 'home'
): readonly string[] {
  if (!Array.isArray(value) || value.length > PUBLICATION_BINDING_ORDER.length + 16) fail();
  const result = value.map(relativePath);
  const expected = expectedBindings(selectedTargets, scope);
  if (result.length !== expected.length || result.some((binding, index) => binding !== expected[index])) fail();
  return Object.freeze(result);
}
function managed(value: unknown, scope: PublicationScope = 'home'): Record<string, unknown> {
  if (!isPlainObject(value)) fail();
  const result: Record<string, unknown> = {};
  const known = new Set<string>(
    scope === 'home' ? PUBLICATION_LOCAL_ROOTS : Object.values(PUBLICATION_PROJECT_TARGET_BINDINGS).flat()
  );
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
function targetForBinding(target: PublicationTarget, binding: string, scope: PublicationScope): boolean {
  if (target === 'advisor-controller') return scope === 'home' && binding === '.evcrate/bin';
  const bindings = scope === 'home'
    ? PUBLICATION_TARGET_BINDINGS[target] : PUBLICATION_PROJECT_TARGET_BINDINGS[target];
  return bindings !== undefined && bindings.includes(binding as never);
}
function targetForLocalRoot(target: PublicationTarget, localRoot: string, scope: PublicationScope): boolean {
  if (target === 'advisor-controller') return scope === 'home' && localRoot === '.evcrate/bin';
  const roots = scope === 'project'
    ? PUBLICATION_PROJECT_TARGET_BINDINGS[target] : PUBLICATION_TARGET_LOCAL_ROOTS[target];
  return roots !== undefined && roots.includes(localRoot as never);
}
function stringArray(value: unknown, maximum: number, absolute: boolean, minimum = 0): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail('PATH_UNSAFE');
  const result = value.map((entry) => {
    if (typeof entry !== 'string' || (absolute && resolve(entry) !== entry)) fail('PATH_UNSAFE');
    return entry;
  });
  return Object.freeze(result);
}
function readJournal(path: string): PublicationJournal {
  try {
    assertOwnerOnlyFile(path);
    const parsed = parseJsonDocument(readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES);
    if (!isPlainObject(parsed)) fail();
    const allowed = ['schema_version', 'transaction_type', 'status', 'release_id', 'home_root', 'transaction_dir',
      'selected_targets', 'binding_order', 'previous_managed_paths', 'managed_paths', 'build_manifest_path',
      'build_manifest_digest', 'retained_release_id', 'retain_transaction', 'operation_count', 'operations_digest',
      'operations', 'scope', 'destination_root', 'durable_state_root', 'workspace_root', 'workspace_name',
      'workspace_device', 'workspace_inode', 'workspace_parent_device', 'workspace_parent_inode',
      'project_identity', 'retention', 'lock_paths', 'lock_order'];
    if (Object.keys(parsed).some((key) => !allowed.includes(key))
      || parsed.schema_version !== 1 || parsed.transaction_type !== 'target-publication'
      || (parsed.status !== 'staged' && parsed.status !== 'promoting' && parsed.status !== 'committed')) fail();
    if (typeof parsed.home_root !== 'string' || resolve(parsed.home_root) !== parsed.home_root) fail();
    const scope: PublicationScope = parsed.scope === undefined ? 'home'
      : parsed.scope === 'home' || parsed.scope === 'project' ? parsed.scope : fail();
    const destinationRoot = parsed.destination_root === undefined ? parsed.home_root : parsed.destination_root;
    const durableStateRoot = parsed.durable_state_root === undefined ? resolve(dirname(path)) : parsed.durable_state_root;
    const workspaceRootValue = parsed.workspace_root;
    if (typeof destinationRoot !== 'string' || resolve(destinationRoot) !== destinationRoot
      || typeof durableStateRoot !== 'string' || resolve(durableStateRoot) !== durableStateRoot) fail('PATH_UNSAFE');
    const release = releaseId(parsed.release_id);
    const transaction = relativePath(parsed.transaction_dir);
    if (transaction !== `release-${release}`) fail();
    const workspaceRoot = workspaceRootValue === undefined
      ? join(resolve(durableStateRoot), transaction) : workspaceRootValue;
    if (typeof workspaceRoot !== 'string' || resolve(workspaceRoot) !== workspaceRoot) fail('PATH_UNSAFE');
    const workspaceName = parsed.workspace_name === undefined ? transaction : parsed.workspace_name;
    if (typeof workspaceName !== 'string'
      || workspaceName !== (scope === 'project' ? `.evcrate-publish-${release}` : transaction)) fail('PATH_UNSAFE');
    const workspaceIdentityKeys = ['workspace_device', 'workspace_inode',
      'workspace_parent_device', 'workspace_parent_inode'];
    const workspaceIdentityPresent = workspaceIdentityKeys.map((key) => Object.hasOwn(parsed, key));
    if (workspaceIdentityPresent.some(Boolean) && !workspaceIdentityPresent.every(Boolean)) fail('PATH_UNSAFE');
    const legacyWithoutWorkspaceIdentity = !workspaceIdentityPresent.some(Boolean);
    const workspaceDevice = nullableSafeInteger(parsed.workspace_device, Number.MAX_SAFE_INTEGER);
    const workspaceInode = nullableSafeInteger(parsed.workspace_inode, Number.MAX_SAFE_INTEGER);
    const workspaceParentDevice = nullableSafeInteger(parsed.workspace_parent_device, Number.MAX_SAFE_INTEGER);
    const workspaceParentInode = nullableSafeInteger(parsed.workspace_parent_inode, Number.MAX_SAFE_INTEGER);
    const workspaceIdentity = [workspaceDevice, workspaceInode, workspaceParentDevice, workspaceParentInode];
    if (workspaceIdentity.some((value) => value === null) && workspaceIdentity.some((value) => value !== null)) {
      fail('PATH_UNSAFE');
    }
    const selectedTargets = targets(parsed.selected_targets, scope === 'home');
    const bindingOrder = order(parsed.binding_order, selectedTargets, scope);
    const previousManagedPaths = managed(parsed.previous_managed_paths, scope);
    const managedPaths = managed(parsed.managed_paths, scope);
    const manifestPath = relativePath(parsed.build_manifest_path);
    const manifestDigest = hash(parsed.build_manifest_digest);
    const operationCount = safeInteger(parsed.operation_count, MAX_PUBLICATION_CHANGES);
    const operationsDigest = hash(parsed.operations_digest);
    if (manifestDigest === null || operationsDigest === null) fail();
    if (typeof parsed.retain_transaction !== 'boolean'
      || (parsed.retained_release_id !== null && typeof parsed.retained_release_id !== 'string')) fail();
    const retainedRelease = parsed.retained_release_id === null ? null : releaseId(parsed.retained_release_id);
    const retention = parsed.retention === undefined
      ? 'bounded-one-home-release' : parsed.retention;
    if (retention !== 'bounded-one-home-release' && retention !== 'none') fail();
    if ((scope === 'project' && (retention !== 'none' || retainedRelease !== null || parsed.retain_transaction))
      || parsed.status !== 'committed' && (parsed.retain_transaction || retainedRelease !== null)) fail();
    if (parsed.retain_transaction !== (retainedRelease !== null)
      || (retainedRelease !== null && retainedRelease !== release)) fail();
    const projectIdentity: string | null = parsed.project_identity === undefined || parsed.project_identity === null
      ? null : typeof parsed.project_identity === 'string' ? parsed.project_identity : fail('PATH_UNSAFE');
    if ((scope === 'home' && projectIdentity !== null)
      || (scope === 'project' && (typeof projectIdentity !== 'string' || !/^[a-f0-9]{64}$/u.test(projectIdentity)))) fail('PATH_UNSAFE');
    const lockPaths = parsed.lock_paths === undefined
      ? Object.freeze([join(durableStateRoot, 'publish.lock')])
      : stringArray(parsed.lock_paths, PUBLICATION_BINDING_ORDER.length + 16, true, 1);
    const lockOrder = parsed.lock_order === undefined
      ? Object.freeze(['home', scope === 'project' ? 'project' : 'home'])
      : stringArray(parsed.lock_order, PUBLICATION_BINDING_ORDER.length + 16, false);
    const operations = parsed.operations;
    if (!Array.isArray(operations) || operations.length > MAX_PUBLICATION_CHANGES || operations.length !== operationCount
      || hashBytes(canonicalJsonBytes(operations)) !== operationsDigest) fail();
    const destinations = new Set<string>();
    const parsedOperations = operations.map((value, index): PublicationJournalOperation => {
      if (!isPlainObject(value)) fail();
      const keys = ['target', 'binding', 'local_root', 'relative_path', 'kind', 'action', 'destination',
        'backup', 'before', 'intendedHash', 'intended', 'promoted', 'mode'];
      const legacyKeys = keys.slice(0, -1);
      if ((Object.keys(value).length !== keys.length && Object.keys(value).length !== legacyKeys.length)
        || Object.keys(value).some((key) => !keys.includes(key)) || typeof value.target !== 'string') fail();
      const target = value.target === 'advisor-controller' ? value.target : normalizeTarget(value.target);
      if (target !== 'advisor-controller' && !selectedTargets.includes(target)) fail();
      const binding = relativePath(value.binding);
      const localRoot = relativePath(value.local_root);
      const relativePathValue = relativePath(value.relative_path);
      if (!bindingOrder.includes(binding) || !targetForBinding(target, binding, scope)) fail();
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
        : value.kind !== 'file' || !targetForLocalRoot(target, localRoot, scope)) fail();
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
      const mode = value.mode === undefined ? before.mode ?? 0o600 : safeInteger(value.mode, 0o777);
      return Object.freeze({
        target, binding, localRoot, relativePath: relativePathValue, kind: value.kind,
        action, destination, backup, before, intendedHash, intended, promoted: value.promoted, mode
      });
    });
    if (parsed.status === 'committed' && parsedOperations.some((operation) => mutation(operation.action) && !operation.promoted)) fail();
    return Object.freeze({ schema_version: 1, transaction_type: 'target-publication', status: parsed.status,
      release_id: release, home_root: parsed.home_root, transaction_dir: transaction,
      selected_targets: selectedTargets, binding_order: bindingOrder, previous_managed_paths: previousManagedPaths,
      managed_paths: managedPaths, build_manifest_path: manifestPath, build_manifest_digest: manifestDigest,
      retained_release_id: retainedRelease, retain_transaction: parsed.retain_transaction,
      operation_count: operationCount, operations_digest: operationsDigest, operations: Object.freeze(parsedOperations),
      scope, destination_root: destinationRoot, durable_state_root: durableStateRoot,
      workspace_root: workspaceRoot, workspace_name: workspaceName,
      workspace_device: workspaceDevice, workspace_inode: workspaceInode,
      workspace_parent_device: workspaceParentDevice, workspace_parent_inode: workspaceParentInode,
      legacy_without_workspace_identity: legacyWithoutWorkspaceIdentity,
      project_identity: projectIdentity, retention,
      lock_paths: Object.freeze([...lockPaths]), lock_order: Object.freeze([...lockOrder]) });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail();
  }
}
function readProgress(journal: PublicationJournal): PublicationJournal {
  const transactionRoot = resolve(journal.workspace_root);
  const progressRoot = join(transactionRoot, 'progress');
  try {
    assertNoSymlinkAncestors(transactionRoot);
    const transactionStat = lstatSync(transactionRoot);
    if (!transactionStat.isDirectory() || transactionStat.isSymbolicLink()) fail('PATH_UNSAFE');
    assertOwnerOnlyDirectory(transactionRoot);
    assertNoSymlinkAncestors(progressRoot);
    const progressStat = lstatSync(progressRoot);
    if (!progressStat.isDirectory() || progressStat.isSymbolicLink()) fail('PATH_UNSAFE');
    assertOwnerOnlyDirectory(progressRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return journal;
    if (error instanceof ControlPlaneError) throw error;
    fail('RECOVERY_FAILED');
  }
  const operations = journal.operations.map((operation) => ({ ...operation }));
  const seen = new Set<number>();
  for (const name of readdirSync(progressRoot)) {
    const match = /^([0-9]+)\.json$/u.exec(name);
    if (!match) fail('RECOVERY_FAILED');
    const index = Number(match[1]);
    if (!Number.isSafeInteger(index) || index < 0 || index >= operations.length || seen.has(index)) {
      fail('RECOVERY_FAILED');
    }
    seen.add(index);
    const path = join(progressRoot, name);
    assertOwnerOnlyFile(path);
    const parsed = parseJsonDocument(
      readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES
    );
    if (!isPlainObject(parsed) || Object.keys(parsed).some((key) => !['index', 'promoted', 'intended'].includes(key))
      || parsed.index !== index || parsed.promoted !== true) fail('RECOVERY_FAILED');
    const operation = operations[index];
    if (!operation || !mutation(operation.action)) fail('RECOVERY_FAILED');
    const intended = parsed.intended === null ? null : node(parsed.intended);
    if (intended === null || (intended.present && intended.mode !== operation.mode)
      || (operation.intendedHash === null
        ? intended.present
        : !intended.present || intended.kind !== operation.kind || intended.hash !== operation.intendedHash)) {
      fail('RECOVERY_FAILED');
    }
    if (operation.promoted && operation.intended !== null && !same(operation.intended, intended)) {
      fail('RECOVERY_FAILED');
    }
    operations[index] = Object.freeze({ ...operation, promoted: true, intended });
  }
  const updated = Object.freeze({
    ...journal, operations: Object.freeze(operations),
    operations_digest: hashBytes(canonicalJsonBytes(operations))
  });
  if (updated.status === 'committed'
    && updated.operations.some((operation) => mutation(operation.action) && !operation.promoted)) {
    fail('RECOVERY_FAILED');
  }
  return updated;
}
function assertWorkspaceIdentity(journal: PublicationJournal, transactionRoot: string): void {
  const identity = [
    journal.workspace_device, journal.workspace_inode,
    journal.workspace_parent_device, journal.workspace_parent_inode
  ];
  if (identity.every((value) => value === null)) {
    if (journal.scope === 'project') fail('PATH_UNSAFE');
    return;
  }
  if (identity.some((value) => value === null)) fail('PATH_UNSAFE');
  let workspace;
  let parent;
  try {
    workspace = lstatSync(transactionRoot);
    parent = lstatSync(dirname(transactionRoot));
  } catch {
    fail('PATH_UNSAFE');
  }
  if (!workspace.isDirectory() || workspace.isSymbolicLink() || !parent.isDirectory() || parent.isSymbolicLink()
    || Number(workspace.dev) !== journal.workspace_device
    || Number(workspace.ino) !== journal.workspace_inode
    || Number(parent.dev) !== journal.workspace_parent_device
    || Number(parent.ino) !== journal.workspace_parent_inode) {
    fail('PATH_UNSAFE');
  }
}

function assertPromotionEvidence(journal: PublicationJournal, transactionRoot: string): void {
  if (journal.status !== 'promoting' || journal.workspace_device === null) return;
  const promoted = journal.operations.flatMap((operation, index) =>
    mutation(operation.action) && operation.promoted ? [index] : []
  );
  if (!promoted.length) return;
  const progressRoot = join(transactionRoot, 'progress');
  let names: readonly string[];
  try {
    names = readdirSync(progressRoot);
  } catch {
    fail('RECOVERY_FAILED');
  }
  const available = new Set(names);
  if (promoted.some((index) => !available.has(`${index}.json`))) fail('RECOVERY_FAILED');
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
  return readProgress(readJournal(path));
}
function safeDestination(homeRoot: string, value: string): string {
  return containedPath(homeRoot, value);
}
function safeBackup(transactionRoot: string, value: string): string {
  const backup = containedPath(transactionRoot, value);
  if (!value.startsWith('backups/')) fail();
  return backup;
}
function ensureParent(path: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertOwnerControlledDirectory(parent);
}
function cleanup(stateRoot: string, workspaceRoot: string, retain: boolean): void {
  if (!retain) removePath(workspaceRoot);
  try {
    unlinkSync(join(resolve(stateRoot), PUBLICATION_JOURNAL_NAME));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail();
  }
  syncDirectory(resolve(stateRoot));
}
function committedMarker(journal: PublicationJournal): Record<string, unknown> {
  return {
    schema_version: 1, status: 'complete', transaction_type: 'target-publication', release_id: journal.release_id,
    selected_targets: [...journal.selected_targets], binding_order: [...journal.binding_order],
    managed_paths: journal.managed_paths, previous_managed_paths: journal.previous_managed_paths,
    build_manifest_path: journal.build_manifest_path, build_manifest_digest: journal.build_manifest_digest,
    transaction_dir: journal.transaction_dir, retained_release_id: journal.retained_release_id,
    ...(journal.scope === 'project' ? {
      scope: 'project', destination_root: journal.destination_root, durable_state_root: journal.durable_state_root,
      workspace_root: journal.workspace_root, workspace_name: journal.workspace_name,
      project_identity: journal.project_identity, retention: journal.retention
    } : {})
  };
}
function recoveredMarker(journal: PublicationJournal): Record<string, unknown> {
  return {
    schema_version: 1, status: 'recovered', transaction_type: 'target-publication', release_id: journal.release_id,
    selected_targets: [...journal.selected_targets], binding_order: [...journal.binding_order],
    managed_paths: journal.previous_managed_paths, previous_managed_paths: journal.previous_managed_paths,
    build_manifest_path: journal.build_manifest_path, build_manifest_digest: journal.build_manifest_digest,
    transaction_dir: journal.transaction_dir, retained_release_id: null,
    ...(journal.scope === 'project' ? {
      scope: 'project', destination_root: journal.destination_root, durable_state_root: journal.durable_state_root,
      workspace_root: journal.workspace_root, workspace_name: journal.workspace_name,
      project_identity: journal.project_identity, retention: journal.retention
    } : {})
  };
}
function assertMarkerMatches(
  stateRoot: string, journal: PublicationJournal, expectedProjectIdentity: string | null
): void {
  const stagedWithoutPromotion = journal.status === 'staged'
    && journal.operations.every((operation) => !operation.promoted);
  if (journal.scope === 'project') {
    if (expectedProjectIdentity === null || journal.project_identity !== expectedProjectIdentity) fail('PATH_UNSAFE');
  } else if (expectedProjectIdentity !== null) {
    fail('PATH_UNSAFE');
  }
  const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
  if (!marker) {
    if (stagedWithoutPromotion) return;
    fail();
  }
  if (journal.scope === 'project'
    && (marker.scope !== 'project' || marker.project_identity !== expectedProjectIdentity)) {
    fail('PATH_UNSAFE');
  }
  const markerScopeMatches = journal.scope === 'project'
    ? marker.scope === 'project' : marker.scope === undefined;
  if (stagedWithoutPromotion && markerScopeMatches
    && (marker.status === 'complete' || marker.status === 'recovered')) return;
  if (releaseId(marker.release_id) !== journal.release_id
    || marker.transaction_dir !== journal.transaction_dir
    || marker.build_manifest_digest !== journal.build_manifest_digest) fail();
  const markerTargets = targets(marker.selected_targets, journal.scope === 'home');
  const markerOrder = order(marker.binding_order, journal.selected_targets, journal.scope);
  if (markerTargets.length !== journal.selected_targets.length
    || markerTargets.some((target, index) => target !== journal.selected_targets[index])
    || markerOrder.length !== journal.binding_order.length
    || markerOrder.some((binding, index) => binding !== journal.binding_order[index])) fail();
  const allowedStatuses = journal.status === 'staged'
    ? ['promoting'] : ['promoting', 'complete'];
  if (!allowedStatuses.includes(marker.status as string)) fail();
}
export function recoverPublicationUnlocked(
  stateRoot: string, homeRoot: string, expectedReleaseId: string | null = null,
  expectedProjectIdentity: string | null = null
): PublicationRecoveryOutcome {
  const journal = readPublicationJournal(stateRoot);
  if (!journal) {
    if (expectedReleaseId !== null) fail();
    const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
    if (marker && ((expectedProjectIdentity === null && marker.scope === 'project')
      || (expectedProjectIdentity !== null
        && (marker.scope !== 'project' || marker.project_identity !== expectedProjectIdentity)))) {
      fail('PATH_UNSAFE');
    }
    if (marker && marker.status !== 'none' && marker.status !== 'complete' && marker.status !== 'recovered') fail();
    return { action: 'none', releaseId: null, selectedTargets: [], bindingOrder: [] };
  }
  if (expectedReleaseId !== null && journal.release_id !== expectedReleaseId) fail();
  if (journal.scope === 'project'
    ? expectedProjectIdentity === null || journal.project_identity !== expectedProjectIdentity
    : expectedProjectIdentity !== null) {
    fail('PATH_UNSAFE');
  }
  if (resolve(journal.destination_root) !== resolve(homeRoot)
    || resolve(journal.durable_state_root) !== resolve(stateRoot)) fail('PATH_UNSAFE');
  assertNoSymlinkAncestors(resolve(homeRoot));
  assertOwnerControlledDirectory(resolve(homeRoot));
  assertOwnerOnlyDirectory(resolve(stateRoot));
  if (journal.scope === 'project') {
    const expectedWorkspace = join(resolve(homeRoot), journal.workspace_name);
    if (resolve(journal.workspace_root) !== expectedWorkspace
      || !sameVolume(resolve(homeRoot), dirname(resolve(journal.workspace_root)))) fail('PATH_UNSAFE');
  } else if (resolve(journal.workspace_root) !== join(resolve(stateRoot), journal.transaction_dir)) {
    fail('PATH_UNSAFE');
  }
  assertMarkerMatches(stateRoot, journal, expectedProjectIdentity);
  const transactionRoot = resolve(journal.workspace_root);
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
  if (transactionPresent) {
    assertWorkspaceIdentity(journal, transactionRoot);
    assertPromotionEvidence(journal, transactionRoot);
  }
  if (!transactionPresent) {
    if (journal.status === 'staged' && journal.operations.every((operation) => !operation.promoted)) {
      cleanup(stateRoot, transactionRoot, false);
      return {
        action: 'rolled-back', releaseId: journal.release_id,
        selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order
      };
    }
    if (journal.status !== 'committed' || journal.retain_transaction) fail();
  }
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
      if (operation.backup !== null && !journal.retain_transaction) removePath(safeBackup(transactionRoot, operation.backup));
      continue;
    }
    if (operation.action === 'noop' || operation.action === 'preserve') {
      if (!same(current, operation.before)) fail();
      continue;
    }
    const before = operation.before;
    if (!operation.promoted && !journal.legacy_without_workspace_identity) {
      if (same(current, before)) {
        if (operation.backup !== null && publicationNode(safeBackup(transactionRoot, operation.backup)).present) {
          fail('RECOVERY_FAILED');
        }
        continue;
      }
      if (!before.present || operation.backup === null || current.present) fail('RECOVERY_FAILED');
      const backup = safeBackup(transactionRoot, operation.backup);
      const backupNode = snapshot(backup, operation.target === 'advisor-controller');
      if (!backupNode.present || !same(backupNode, before)) fail('RECOVERY_FAILED');
      ensureParent(destination);
      renameSync(backup, destination);
      if (!same(snapshot(destination, operation.target === 'advisor-controller'), before)) {
        fail('RECOVERY_FAILED');
      }
      continue;
    }
    if (before.present) {
      const backup = operation.backup === null ? null : safeBackup(transactionRoot, operation.backup);
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
      if (operation.backup !== null && publicationNode(safeBackup(transactionRoot, operation.backup)).present) fail();
      if (current.present) {
        if (!matchesIntended) fail();
        removePath(destination);
      }
    }
    if (!same(snapshot(destination, operation.target === 'advisor-controller'), before)) fail();
  }
  if (journal.status === 'committed') {
    writeReleaseMarker(stateRoot, committedMarker(journal));
    cleanup(stateRoot, transactionRoot, journal.retain_transaction);
    return { action: 'finalized', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
  }
  writeReleaseMarker(stateRoot, recoveredMarker(journal));
  cleanup(stateRoot, transactionRoot, false);
  return { action: 'rolled-back', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
}
