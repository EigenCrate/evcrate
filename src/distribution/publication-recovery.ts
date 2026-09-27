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
  assertNoSymlinkAncestors, assertRealDirectory, assertRegularFile,
  containedPath, normalizeRelativePath
} from '../filesystem/paths.js';
import { canonicalJsonBytes, hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, sameVolume, syncDirectory, writeAtomicFile } from '../filesystem/atomic.js';
import {
  publicationNode, publicationSnapshot, readOptionalPublicationMarker,
  validatePublicationStateRecord, publicationMarkerRecord,
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
export interface PublicationStateRecord {
  readonly phase: 'shared' | 'harness';
  readonly scope: PublicationScope;
  readonly status: 'promoting' | 'complete' | 'recovered';
  readonly release_id: string;
  readonly selected_targets: readonly PersistedTarget[];
  readonly binding_order: readonly string[];
  readonly managed_paths: Record<string, unknown>;
  readonly previous_managed_paths: Record<string, unknown>;
  readonly build_manifest_path: string;
  readonly build_manifest_digest: string;
  readonly transaction_dir: string;
  readonly retained_release_id: string | null;
  readonly destination_root: string;
  readonly durable_state_root: string;
  readonly workspace_root: string;
  readonly workspace_name: string;
  readonly project_identity: string | null;
  readonly retention: 'bounded-one-home-release' | 'none';
}
export interface PublicationJournal {
  readonly schema_version: 1 | 2 | 3; readonly transaction_type: 'target-publication';
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
  readonly logical_phase?: 'shared' | 'harness' | 'combined';
  readonly records?: Readonly<Record<string, PublicationStateRecord | null>>;
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
  const keys = ['present', 'kind', 'device', 'inode', 'size', 'hash'];
  return keys.every((key) => left[key as keyof PublicationNodeSnapshot] === right[key as keyof PublicationNodeSnapshot]);
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
  if (typeof value !== 'number' || value < 0) fail();
  if (process.platform === 'win32' && Number.isFinite(value)) return value;
  if (!Number.isSafeInteger(value) || value > maximum) fail();
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
function managed(
  value: unknown, scope: PublicationScope = 'home', nested = false
): Record<string, unknown> {
  if (!isPlainObject(value)) fail();
  const result: Record<string, unknown> = {};
  if (nested) {
    const targetBindings = scope === 'home'
      ? PUBLICATION_TARGET_BINDINGS : PUBLICATION_PROJECT_TARGET_BINDINGS;
    for (const [target, rawBindings] of Object.entries(value)) {
      const expected = targetBindings[target as keyof typeof targetBindings];
      if (!expected || !isPlainObject(rawBindings)) fail();
      const bindings: Record<string, readonly string[]> = {};
      for (const [binding, rawValues] of Object.entries(rawBindings)) {
        if (!expected.includes(binding as never) || !Array.isArray(rawValues)) fail();
        const values = rawValues.map(relativePath);
        if (new Set(values).size !== values.length) fail();
        bindings[binding] = Object.freeze(values);
      }
      result[target] = Object.freeze(bindings);
    }
    return Object.freeze(result);
  }
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
function node(value: unknown, allowMode = false): PublicationNodeSnapshot {
  if (!isPlainObject(value)) fail();
  const allowed = allowMode
    ? ['present', 'kind', 'device', 'inode', 'size', 'hash', 'mode']
    : ['present', 'kind', 'device', 'inode', 'size', 'hash'];
  if (Object.keys(value).some((key) => !allowed.includes(key)) || typeof value.present !== 'boolean') fail();
  if (!value.present) {
    if (Object.keys(value).length !== 1) fail();
    return Object.freeze({ present: false });
  }
  const minKeys = ['present', 'kind', 'device', 'inode', 'size', 'hash'];
  if (minKeys.some((k) => !Object.hasOwn(value, k)) || (value.kind !== 'file' && value.kind !== 'directory')) fail();
  if (Object.hasOwn(value, 'mode')) {
    safeInteger((value as Record<string, unknown>).mode, 0o7777);
  }
  const device = safeInteger(value.device, Number.MAX_SAFE_INTEGER);
  const inode = safeInteger(value.inode, Number.MAX_SAFE_INTEGER);
  const size = safeInteger(value.size, Number.MAX_SAFE_INTEGER);
  const digest = hash(value.hash);
  if (digest === null) fail();
  return Object.freeze({ present: true, kind: value.kind, device, inode, size, hash: digest });
}
function mutation(action: PublicationChangeAction): boolean {
  return action !== 'noop' && action !== 'preserve';
}
function journalRecords(
  value: unknown, scope: PublicationScope, release: string, manifestDigest: string
): Readonly<Record<string, PublicationStateRecord | null>> {
  if (!isPlainObject(value)) fail();
  const expectedKeys = scope === 'home' ? ['shared', 'harness'] : ['harness'];
  if (Object.keys(value).length !== expectedKeys.length
    || Object.keys(value).some((key) => !expectedKeys.includes(key))) fail();
  const result: Record<string, PublicationStateRecord | null> = {};
  const shared = value.shared;
  if (scope === 'home') {
    if (shared === null || !isPlainObject(shared)) fail();
    validatePublicationStateRecord(shared, 'shared', 'home');
    result.shared = shared as unknown as PublicationStateRecord;
    if (value.harness === null) result.harness = null;
    else {
      validatePublicationStateRecord(value.harness, 'harness', 'home');
      result.harness = value.harness as unknown as PublicationStateRecord;
    }
  } else {
    validatePublicationStateRecord(value.harness, 'harness', 'project');
    result.harness = value.harness as unknown as PublicationStateRecord;
  }
  for (const record of Object.values(result)) {
    if (record === null) continue;
    if (record.status !== 'promoting'
      || record.release_id !== release || record.build_manifest_digest !== manifestDigest) fail();
  }
  if (scope === 'home' && result.harness !== null) {
    const left = result.shared as PublicationStateRecord;
    const right = result.harness;
    for (const key of ['status', 'destination_root', 'durable_state_root', 'workspace_root', 'workspace_name',
      'transaction_dir', 'build_manifest_path', 'retained_release_id'] as const) {
      if (left[key] !== right[key]) fail();
    }
  }
  return Object.freeze(result);
}
function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameTargetArray(left: readonly PersistedTarget[], right: readonly PersistedTarget[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function assertSchema2JournalPhase(
  scope: PublicationScope, logicalPhase: unknown,
  records: Readonly<Record<string, PublicationStateRecord | null>>,
  selectedTargets: readonly PersistedTarget[], bindingOrder: readonly string[],
  operations: readonly PublicationJournalOperation[]
): void {
  const harness = records.harness;
  if (scope === 'project') {
    if (logicalPhase !== 'harness' || harness === null
      || !sameTargetArray(selectedTargets, harness.selected_targets)
      || !sameStringArray(bindingOrder, harness.binding_order)
      || operations.some((operation) => operation.target === 'advisor-controller')) fail('PATH_UNSAFE');
    return;
  }
  if (logicalPhase === 'shared') {
    if (harness !== null || selectedTargets.length !== 0
      || !sameStringArray(bindingOrder, ['.evcrate/bin'])
      || operations.length === 0
      || operations.some((operation) => operation.target !== 'advisor-controller')) fail('PATH_UNSAFE');
    return;
  }
  if (logicalPhase !== 'combined' || harness === null
    || !sameTargetArray(selectedTargets, harness.selected_targets)
    || !sameStringArray(bindingOrder, ['.evcrate/bin', ...harness.binding_order])
    || !operations.some((operation) => operation.target === 'advisor-controller')
    || !operations.some((operation) => operation.target !== 'advisor-controller')) fail('PATH_UNSAFE');
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
    assertRegularFile(path);
    const parsed = parseJsonDocument(readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES);
    if (!isPlainObject(parsed)) fail();
    const schemaVersion = parsed.schema_version;
    const legacyAllowed = ['schema_version', 'transaction_type', 'status', 'release_id', 'home_root', 'transaction_dir',
      'selected_targets', 'binding_order', 'previous_managed_paths', 'managed_paths', 'build_manifest_path',
      'build_manifest_digest', 'retained_release_id', 'retain_transaction', 'operation_count', 'operations_digest',
      'operations', 'scope', 'destination_root', 'durable_state_root', 'workspace_root', 'workspace_name',
      'workspace_device', 'workspace_inode', 'workspace_parent_device', 'workspace_parent_inode',
      'project_identity', 'retention', 'lock_paths', 'lock_order'];
    const isV2OrV3 = schemaVersion === 2 || schemaVersion === 3;
    const allowed = isV2OrV3 ? [...legacyAllowed, 'logical_phase', 'records'] : legacyAllowed;
    if (Object.keys(parsed).some((key) => !allowed.includes(key))
      || (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) || parsed.transaction_type !== 'target-publication'
      || (parsed.status !== 'staged' && parsed.status !== 'promoting' && parsed.status !== 'committed')) fail();
    if (isV2OrV3
      && (parsed.scope !== 'home' && parsed.scope !== 'project')) fail('PATH_UNSAFE');
    const scope: PublicationScope = parsed.scope === undefined ? 'home'
      : parsed.scope === 'home' || parsed.scope === 'project' ? parsed.scope : fail();
    if (typeof parsed.home_root !== 'string' || resolve(parsed.home_root) !== parsed.home_root) fail();
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
    if (isV2OrV3 && !workspaceIdentityPresent.every(Boolean)) fail('PATH_UNSAFE');
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
    const previousManagedPaths = managed(parsed.previous_managed_paths, scope, isV2OrV3);
    const managedPaths = managed(parsed.managed_paths, scope, isV2OrV3);
    const manifestPath = relativePath(parsed.build_manifest_path);
    const manifestDigest = hash(parsed.build_manifest_digest);
    const operationCount = safeInteger(parsed.operation_count, MAX_PUBLICATION_CHANGES);
    const operationsDigest = hash(parsed.operations_digest);
    if (manifestDigest === null || operationsDigest === null) fail();
    if (typeof parsed.retain_transaction !== 'boolean'
      || (parsed.retained_release_id !== null && typeof parsed.retained_release_id !== 'string')) fail();
    const retainedRelease = parsed.retained_release_id === null ? null : releaseId(parsed.retained_release_id);
    const records = isV2OrV3
      ? journalRecords(parsed.records, scope, release, manifestDigest) : undefined;
    const logicalPhase = isV2OrV3
      ? parsed.logical_phase : undefined;
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
    const allowMode = schemaVersion === 1 || schemaVersion === 2;
    const parsedOperations = operations.map((value, index): PublicationJournalOperation => {
      if (!isPlainObject(value)) fail();
      const baseKeys = ['target', 'binding', 'local_root', 'relative_path', 'kind', 'action', 'destination',
        'backup', 'before', 'intendedHash', 'intended', 'promoted'];
      const allowedOpKeys = allowMode ? [...baseKeys, 'mode'] : baseKeys;
      if (Object.keys(value).length > allowedOpKeys.length
        || Object.keys(value).some((key) => !allowedOpKeys.includes(key))
        || baseKeys.some((k) => !Object.hasOwn(value, k))
        || typeof value.target !== 'string') fail();
      if (Object.hasOwn(value, 'mode')) {
        safeInteger(value.mode, 0o7777);
      }
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
      const before = node(value.before, allowMode);
      const needsBackup = mutation(action) && before.present;
      if (needsBackup !== (backup !== null) || (backup !== null && backup !== `backups/${index}`)) fail();
      if (before.present && before.kind !== value.kind) fail();
      const intendedHash = hash(value.intendedHash);
      if (['create', 'update', 'merge-create', 'merge-update'].includes(action) && intendedHash === null) fail();
      if (action === 'delete' && intendedHash !== null) fail();
      if ((action === 'noop' || action === 'preserve')
        && (intendedHash !== before.hash && !(intendedHash === null && !before.present))) fail();
      const intended = value.intended === null ? null : node(value.intended, allowMode);
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
    if (isV2OrV3) {
      assertSchema2JournalPhase(
        scope, logicalPhase, records as Readonly<Record<string, PublicationStateRecord | null>>,
        selectedTargets, bindingOrder, parsedOperations
      );
    }
    if (parsed.status === 'committed' && parsedOperations.some((operation) => mutation(operation.action) && !operation.promoted)) fail();
    return Object.freeze({ schema_version: schemaVersion as 1 | 2 | 3, transaction_type: 'target-publication', status: parsed.status,
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
      lock_paths: Object.freeze([...lockPaths]), lock_order: Object.freeze([...lockOrder]),
      ...(isV2OrV3 ? {
        logical_phase: logicalPhase as 'shared' | 'harness' | 'combined',
        records
      } : {}) });
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
    assertRealDirectory(transactionRoot);
    assertNoSymlinkAncestors(progressRoot);
    const progressStat = lstatSync(progressRoot);
    if (!progressStat.isDirectory() || progressStat.isSymbolicLink()) fail('PATH_UNSAFE');
    assertRealDirectory(progressRoot);
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
    assertRegularFile(path);
    const parsed = parseJsonDocument(
      readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES), MAX_PUBLICATION_STATE_BYTES
    );
    if (!isPlainObject(parsed) || Object.keys(parsed).some((key) => !['index', 'promoted', 'intended'].includes(key))
      || parsed.index !== index || parsed.promoted !== true) fail('RECOVERY_FAILED');
    const operation = operations[index];
    if (!operation || !mutation(operation.action)) fail('RECOVERY_FAILED');
    const intended = parsed.intended === null ? null : node(parsed.intended, journal.schema_version === 1 || journal.schema_version === 2);
    if (intended === null
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
    assertRealDirectory(root);
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
function legacyOwnershipRecord(
  marker: Record<string, unknown>, key: 'managed_paths' | 'previous_managed_paths'
): Record<string, unknown> {
  const selected = marker.selected_targets;
  const values = marker[key];
  if (!Array.isArray(selected) || !isPlainObject(values)) fail();
  const result: Record<string, Record<string, readonly string[]>> = {};
  for (const [localRoot, rawPaths] of Object.entries(values)) {
    if (localRoot === '.evcrate/bin') {
      if (!Array.isArray(rawPaths) || rawPaths.length !== 0) fail();
      continue;
    }
    if (!Array.isArray(rawPaths)) fail();
    const matches = selected
      .map((target) => normalizeTarget(target))
      .filter((target) => PUBLICATION_TARGET_LOCAL_ROOTS[target]?.includes(localRoot as never));
    if (matches.length !== 1) fail();
    const target = matches[0];
    const localRoots = PUBLICATION_TARGET_LOCAL_ROOTS[target];
    const bindings = PUBLICATION_TARGET_BINDINGS[target];
    if (!localRoots || !bindings) fail();
    const index = localRoots.indexOf(localRoot as never);
    if (index < 0 || index >= bindings.length) fail();
    const normalized = rawPaths.map(relativePath);
    if (new Set(normalized).size !== normalized.length) fail();
    result[target] ??= {};
    result[target][bindings[index]] = Object.freeze(normalized);
  }
  return Object.freeze(result);
}
function migratedStateRecord(
  marker: Record<string, unknown>, stateRoot: string, homeRoot: string,
  phase: 'shared' | 'harness', managedPaths: Record<string, unknown>,
  previousManagedPaths: Record<string, unknown>
): Record<string, unknown> {
  const release = releaseId(marker.release_id);
  const selected = phase === 'shared' ? [] : targets(marker.selected_targets, true);
  const bindingOrder = phase === 'shared'
    ? ['.evcrate/bin']
    : expectedBindings(selected, 'home').filter((binding) => binding !== '.evcrate/bin');
  const retained = marker.retained_release_id === null ? null : releaseId(marker.retained_release_id);
  const digest = hash(marker.build_manifest_digest);
  if (digest === null) fail();
  return {
    phase, scope: 'home', status: marker.status, release_id: release,
    selected_targets: selected, binding_order: bindingOrder,
    managed_paths: managedPaths, previous_managed_paths: previousManagedPaths,
    build_manifest_path: relativePath(marker.build_manifest_path),
    build_manifest_digest: digest,
    transaction_dir: `release-${release}`, retained_release_id: retained,
    destination_root: resolve(homeRoot), durable_state_root: resolve(stateRoot),
    workspace_root: join(resolve(stateRoot), `release-${release}`),
    workspace_name: `release-${release}`, project_identity: null,
    retention: 'bounded-one-home-release'
  };
}
const LEGACY_CLEANUP_FILE = '.legacy-cleanup.json';
const LEGACY_CLEANUP_KEYS = [
  'schema_version', 'scope', 'release_id', 'destination_root', 'durable_state_root',
  'workspace_root', 'workspace_name', 'quarantine_root',
  'workspace_device', 'workspace_inode', 'parent_device', 'parent_inode', 'project_identity'
] as const;
interface LegacyCleanupPlan {
  readonly schema_version: 1;
  readonly scope: PublicationScope;
  readonly release_id: string;
  readonly destination_root: string;
  readonly durable_state_root: string;
  readonly workspace_root: string;
  readonly workspace_name: string;
  readonly quarantine_root: string;
  readonly workspace_device: number;
  readonly workspace_inode: number;
  readonly parent_device: number;
  readonly parent_inode: number;
  readonly project_identity: string | null;
}
interface LegacyMarkerDetails {
  readonly release_id: string;
  readonly workspace_root: string;
  readonly workspace_name: string;
  readonly project_identity: string | null;
}
type LegacyStat = NonNullable<ReturnType<typeof lstatSync>>;
function legacyCleanupPath(stateRoot: string): string {
  return join(resolve(stateRoot), LEGACY_CLEANUP_FILE);
}
function assertLegacyOwnedNode(
  path: string, expected: 'file' | 'directory' | null = null
): LegacyStat {
  let stat: LegacyStat;
  try { stat = lstatSync(path); } catch { fail('PATH_UNSAFE'); }
  if (stat.isSymbolicLink() || (expected === 'file' && !stat.isFile())
    || (expected === 'directory' && !stat.isDirectory())
    || (!stat.isFile() && !stat.isDirectory())) fail('PATH_UNSAFE');
  try {
    if (stat.isDirectory()) assertRealDirectory(path);
    else assertRegularFile(path);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PATH_UNSAFE');
  }
  return stat;
}
function assertLegacyWorkspaceTree(workspaceRoot: string): LegacyStat {
  const rootStat = assertLegacyOwnedNode(workspaceRoot, 'directory');
  let nodes = 0;
  const visit = (current: string, topLevel: boolean): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { fail('PATH_UNSAFE'); }
    for (const name of entries) {
      if (++nodes > MAX_PUBLICATION_CHANGES) fail('PATH_UNSAFE');
      if (topLevel && !['backups', 'progress', 'stage'].includes(name)) fail('PATH_UNSAFE');
      const child = join(current, name);
      const childStat = assertLegacyOwnedNode(child);
      if (topLevel && !childStat.isDirectory()) fail('PATH_UNSAFE');
      if (childStat.isDirectory()) visit(child, false);
    }
  };
  visit(workspaceRoot, true);
  return rootStat;
}
function cleanupPlanIdentity(value: unknown): number {
  const result = safeInteger(value, Number.MAX_SAFE_INTEGER);
  if (process.platform === 'win32' ? result < 0 : result <= 0) fail('PATH_UNSAFE');
  return result;
}
function readLegacyCleanupPlan(stateRoot: string): LegacyCleanupPlan | null {
  const path = legacyCleanupPath(stateRoot);
  assertNoSymlinkAncestors(path);
  let stat: LegacyStat;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail('PATH_UNSAFE');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('PATH_UNSAFE');
  assertLegacyOwnedNode(path, 'file');
  let parsed: unknown;
  try { parsed = parseJsonDocument(readBoundedFile(path, MAX_PUBLICATION_STATE_BYTES)); }
  catch { fail('PATH_UNSAFE'); }
  if (!isPlainObject(parsed)
    || Object.keys(parsed).length !== LEGACY_CLEANUP_KEYS.length
    || Object.keys(parsed).some((key) => !LEGACY_CLEANUP_KEYS.includes(key as never))
    || parsed.schema_version !== 1
    || (parsed.scope !== 'home' && parsed.scope !== 'project')
    || typeof parsed.release_id !== 'string'
    || typeof parsed.destination_root !== 'string'
    || typeof parsed.durable_state_root !== 'string'
    || typeof parsed.workspace_root !== 'string'
    || typeof parsed.workspace_name !== 'string'
    || typeof parsed.quarantine_root !== 'string'
    || (parsed.project_identity !== null
      && (typeof parsed.project_identity !== 'string'
        || !/^[a-f0-9]{64}$/u.test(parsed.project_identity)))) fail('PATH_UNSAFE');
  const absolute = [parsed.destination_root, parsed.durable_state_root,
    parsed.workspace_root, parsed.quarantine_root];
  if (absolute.some((value) => resolve(value) !== value)
    || !/^[A-Za-z0-9._-]{1,128}$/u.test(parsed.workspace_name)
    || parsed.workspace_name === '.' || parsed.workspace_name === '..') fail('PATH_UNSAFE');
  const release = releaseId(parsed.release_id);
  const workspaceDevice = cleanupPlanIdentity(parsed.workspace_device);
  const workspaceInode = cleanupPlanIdentity(parsed.workspace_inode);
  const parentDevice = cleanupPlanIdentity(parsed.parent_device);
  const parentInode = cleanupPlanIdentity(parsed.parent_inode);
  if ((parsed.scope === 'home' && parsed.project_identity !== null)
    || (parsed.scope === 'project' && parsed.project_identity === null)) fail('PATH_UNSAFE');
  return Object.freeze({
    schema_version: 1, scope: parsed.scope, release_id: release,
    destination_root: parsed.destination_root, durable_state_root: parsed.durable_state_root,
    workspace_root: parsed.workspace_root, workspace_name: parsed.workspace_name,
    quarantine_root: parsed.quarantine_root, workspace_device: workspaceDevice,
    workspace_inode: workspaceInode, parent_device: parentDevice, parent_inode: parentInode,
    project_identity: parsed.project_identity
  });
}
function legacyMarkerDetails(
  marker: Record<string, unknown>, stateRoot: string, destinationRoot: string,
  scope: PublicationScope, projectIdentity: string | null
): LegacyMarkerDetails {
  if (marker.schema_version === 1) {
    if (marker.transaction_type !== 'target-publication'
      || (marker.status !== 'complete' && marker.status !== 'recovered')) fail('PATH_UNSAFE');
    const release = releaseId(marker.release_id);
    if (scope === 'home') {
      if (marker.scope !== undefined || projectIdentity !== null) fail('PATH_UNSAFE');
      const transaction = relativePath(marker.transaction_dir);
      if (transaction !== `release-${release}`) fail('PATH_UNSAFE');
      return {
        release_id: release, workspace_root: join(resolve(stateRoot), transaction),
        workspace_name: transaction, project_identity: null
      };
    }
    if (marker.scope !== 'project' || marker.project_identity !== projectIdentity
      || typeof marker.destination_root !== 'string'
      || typeof marker.durable_state_root !== 'string'
      || typeof marker.workspace_root !== 'string' || typeof marker.workspace_name !== 'string'
      || resolve(marker.destination_root) !== resolve(destinationRoot)
      || resolve(marker.durable_state_root) !== resolve(stateRoot)) fail('PATH_UNSAFE');
    const workspaceName = relativePath(marker.workspace_name);
    const workspaceRoot = resolve(marker.workspace_root);
    if (workspaceName !== `.evcrate-publish-${release}`
      || workspaceRoot !== join(resolve(destinationRoot), workspaceName)) fail('PATH_UNSAFE');
    return { release_id: release, workspace_root: workspaceRoot, workspace_name: workspaceName, project_identity: projectIdentity };
  }
  if (marker.schema_version !== 2 || marker.scope !== scope) fail('PATH_UNSAFE');
  const phase = scope === 'home' ? 'shared' : 'harness';
  const record = publicationMarkerRecord(marker, phase);
  if (record === null || record.project_identity !== projectIdentity
    || record.destination_root !== resolve(destinationRoot)
    || record.durable_state_root !== resolve(stateRoot)
    || typeof record.workspace_root !== 'string' || typeof record.workspace_name !== 'string') fail('PATH_UNSAFE');
  return {
    release_id: releaseId(record.release_id), workspace_root: resolve(record.workspace_root),
    workspace_name: relativePath(record.workspace_name), project_identity: projectIdentity
  };
}
function validateLegacyCleanupPlan(
  plan: LegacyCleanupPlan, marker: Record<string, unknown>, stateRoot: string,
  destinationRoot: string, scope: PublicationScope, projectIdentity: string | null
): void {
  const details = legacyMarkerDetails(marker, stateRoot, destinationRoot, scope, projectIdentity);
  const expectedQuarantine = join(
    dirname(details.workspace_root), `.${details.workspace_name}.legacy-cleanup`
  );
  if (plan.scope !== scope || plan.release_id !== details.release_id
    || plan.destination_root !== resolve(destinationRoot)
    || plan.durable_state_root !== resolve(stateRoot)
    || plan.workspace_root !== details.workspace_root
    || plan.workspace_name !== details.workspace_name
    || plan.quarantine_root !== expectedQuarantine
    || plan.project_identity !== projectIdentity) fail('PATH_UNSAFE');
}
function optionalLegacyStat(path: string): LegacyStat | null {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail('PATH_UNSAFE');
  }
}
function sameLegacyIdentity(
  stat: LegacyStat, device: number, inode: number
): boolean {
  return Number(stat.dev) === device && Number(stat.ino) === inode;
}
function assertLegacyCleanupTarget(plan: LegacyCleanupPlan): void {
  const parent = dirname(plan.workspace_root);
  assertNoSymlinkAncestors(parent);
  const parentStat = assertRealDirectory(parent);
  if (Number(parentStat.dev) !== plan.parent_device || Number(parentStat.ino) !== plan.parent_inode) {
    fail('PATH_UNSAFE');
  }
  const workspace = optionalLegacyStat(plan.workspace_root);
  const quarantine = optionalLegacyStat(plan.quarantine_root);
  if (workspace !== null && quarantine !== null) fail('PATH_UNSAFE');
  const currentPath = workspace === null
    ? quarantine === null ? null : plan.quarantine_root : plan.workspace_root;
  if (currentPath === null) return;
  const current = assertLegacyWorkspaceTree(currentPath);
  if (!sameLegacyIdentity(current, plan.workspace_device, plan.workspace_inode)
    || !sameVolume(currentPath, parent)) fail('PATH_UNSAFE');
}

function removeLegacyCleanupPlan(stateRoot: string): void {
  const path = legacyCleanupPath(stateRoot);
  try {
    assertLegacyOwnedNode(path, 'file');
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof ControlPlaneError) throw error;
      fail('RECOVERY_FAILED');
    }
  }
  syncDirectory(resolve(stateRoot));
}
function finishLegacyCleanup(stateRoot: string, plan: LegacyCleanupPlan): void {
  assertLegacyCleanupTarget(plan);
  const parent = dirname(plan.workspace_root);
  assertNoSymlinkAncestors(parent);
  const parentStat = assertRealDirectory(parent);
  if (Number(parentStat.dev) !== plan.parent_device || Number(parentStat.ino) !== plan.parent_inode) {
    fail('PATH_UNSAFE');
  }
  const workspace = optionalLegacyStat(plan.workspace_root);
  const quarantine = optionalLegacyStat(plan.quarantine_root);
  if (workspace !== null && quarantine !== null) fail('PATH_UNSAFE');
  if (workspace === null && quarantine === null) {
    removeLegacyCleanupPlan(stateRoot);
    return;
  }
  if (workspace !== null) {
    const verified = assertLegacyWorkspaceTree(plan.workspace_root);
    if (!sameLegacyIdentity(verified, plan.workspace_device, plan.workspace_inode)
      || !sameVolume(plan.workspace_root, parent)) fail('PATH_UNSAFE');
    assertNoSymlinkAncestors(plan.quarantine_root);
    if (optionalLegacyStat(plan.quarantine_root) !== null) fail('PATH_UNSAFE');
    try { renameSync(plan.workspace_root, plan.quarantine_root); }
    catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      fail('RECOVERY_FAILED');
    }
  }
  const moved = assertLegacyWorkspaceTree(plan.quarantine_root);
  if (!sameLegacyIdentity(moved, plan.workspace_device, plan.workspace_inode)
    || !sameVolume(plan.quarantine_root, parent)) fail('PATH_UNSAFE');
  removePath(plan.quarantine_root);
  syncDirectory(parent);
  removeLegacyCleanupPlan(stateRoot);
}
function prepareLegacyCleanup(
  stateRoot: string, destinationRoot: string, scope: PublicationScope,
  projectIdentity: string | null, marker: Record<string, unknown>
): LegacyCleanupPlan | null {
  const details = legacyMarkerDetails(marker, stateRoot, destinationRoot, scope, projectIdentity);
  const existingPlan = readLegacyCleanupPlan(stateRoot);
  if (existingPlan !== null) {
    validateLegacyCleanupPlan(existingPlan, marker, stateRoot, destinationRoot, scope, projectIdentity);
    assertLegacyCleanupTarget(existingPlan);
    return existingPlan;
  }
  const workspaceRoot = details.workspace_root;
  assertNoSymlinkAncestors(workspaceRoot);
  const workspace = optionalLegacyStat(workspaceRoot);
  if (workspace === null) return null;
  const verified = assertLegacyWorkspaceTree(workspaceRoot);
  const parent = dirname(workspaceRoot);
  const parentStat = assertRealDirectory(parent);
  if (!sameLegacyIdentity(verified, Number(workspace.dev), Number(workspace.ino))
    || !sameVolume(workspaceRoot, parent)) fail('PATH_UNSAFE');
  const quarantineRoot = join(parent, `.${details.workspace_name}.legacy-cleanup`);
  assertNoSymlinkAncestors(quarantineRoot);
  if (optionalLegacyStat(quarantineRoot) !== null) fail('PATH_UNSAFE');
  const plan = Object.freeze({
    schema_version: 1 as const, scope, release_id: details.release_id,
    destination_root: resolve(destinationRoot), durable_state_root: resolve(stateRoot),
    workspace_root: workspaceRoot, workspace_name: details.workspace_name, quarantine_root: quarantineRoot,
    workspace_device: cleanupPlanIdentity(workspace.dev), workspace_inode: cleanupPlanIdentity(workspace.ino),
    parent_device: cleanupPlanIdentity(parentStat.dev), parent_inode: cleanupPlanIdentity(parentStat.ino),
    project_identity: projectIdentity
  });
  writeAtomicFile(legacyCleanupPath(stateRoot), canonicalJsonBytes(plan));
  syncDirectory(resolve(stateRoot));
  return plan;
}
function retryLegacyCleanup(
  stateRoot: string, destinationRoot: string, scope: PublicationScope,
  projectIdentity: string | null, marker: Record<string, unknown>
): void {
  const plan = readLegacyCleanupPlan(stateRoot);
  if (plan === null) return;
  validateLegacyCleanupPlan(plan, marker, stateRoot, destinationRoot, scope, projectIdentity);
  finishLegacyCleanup(stateRoot, plan);
}
function migrateLegacyHomeMarker(
  stateRoot: string, homeRoot: string, marker: Record<string, unknown>
): void {
  if (marker.schema_version !== 1 || marker.transaction_type !== 'target-publication'
    || marker.scope !== undefined || (marker.status !== 'complete' && marker.status !== 'recovered')) fail();
  const managedPaths = legacyOwnershipRecord(marker, 'managed_paths');
  const previousManagedPaths = legacyOwnershipRecord(marker, 'previous_managed_paths');
  const selectedTargets = targets(marker.selected_targets, true);
  const harness = selectedTargets.length === 0 ? null : migratedStateRecord(
    marker, stateRoot, homeRoot, 'harness', managedPaths, previousManagedPaths
  );
  const shared = migratedStateRecord(marker, stateRoot, homeRoot, 'shared', {}, {});
  const migrated = {
    schema_version: 2, transaction_type: 'target-publication', scope: 'home',
    records: { shared, harness }
  };
  const cleanupPlan = marker.retained_release_id === null
    ? prepareLegacyCleanup(stateRoot, homeRoot, 'home', null, marker) : null;
  writeReleaseMarker(stateRoot, migrated);
  syncDirectory(resolve(stateRoot));
  if (cleanupPlan !== null) finishLegacyCleanup(stateRoot, cleanupPlan);
}
export function recoverAndMigrateHomeStateUnlocked(
  stateRoot: string, homeRoot: string, expectedReleaseId: string | null = null
): PublicationRecoveryOutcome {
  const journal = readPublicationJournal(stateRoot);
  let result: PublicationRecoveryOutcome = {
    action: 'none', releaseId: null, selectedTargets: [], bindingOrder: []
  };
  if (journal) {
    if (journal.scope !== 'home') fail('PATH_UNSAFE');
    result = recoverPublicationUnlocked(stateRoot, homeRoot, expectedReleaseId);
  } else {
    result = recoverPublicationUnlocked(stateRoot, homeRoot, expectedReleaseId);
  }
  const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
  if (marker?.schema_version === 1) {
    if (marker.transaction_type !== 'target-publication') {
      if (marker.status !== 'none') fail('RECOVERY_FAILED');
    } else {
      migrateLegacyHomeMarker(stateRoot, homeRoot, marker);
    }
  } else if (marker?.schema_version === 2) {
    retryLegacyCleanup(stateRoot, homeRoot, 'home', null, marker);
  }
  return result;
}
function legacyProjectOwnership(
  marker: Record<string, unknown>
): Record<string, unknown> {
  const selected = targets(marker.selected_targets);
  const values = marker.managed_paths;
  if (!isPlainObject(values)) fail();
  const result: Record<string, Record<string, readonly string[]>> = {};
  for (const [binding, rawPaths] of Object.entries(values)) {
    if (!Array.isArray(rawPaths)) fail();
    const owners = selected.filter((target) =>
      PUBLICATION_PROJECT_TARGET_BINDINGS[target]?.includes(binding as never));
    if (owners.length !== 1) fail();
    const target = owners[0];
    result[target] ??= {};
    if (result[target][binding] !== undefined) fail();
    const paths = rawPaths.map(relativePath);
    if (new Set(paths).size !== paths.length) fail();
    result[target][binding] = Object.freeze(paths);
  }
  return Object.freeze(result);
}
function migrateLegacyProjectMarker(
  stateRoot: string, projectRoot: string, identity: string, marker: Record<string, unknown>
): void {
  if (marker.schema_version !== 1 || marker.transaction_type !== 'target-publication'
    || marker.scope !== 'project' || marker.project_identity !== identity
    || typeof marker.destination_root !== 'string' || typeof marker.durable_state_root !== 'string'
    || typeof marker.workspace_root !== 'string' || typeof marker.workspace_name !== 'string'
    || resolve(marker.destination_root) !== resolve(projectRoot)
    || resolve(marker.durable_state_root) !== resolve(stateRoot)
    || (marker.status !== 'complete' && marker.status !== 'recovered')) fail('PATH_UNSAFE');
  const release = releaseId(marker.release_id);
  const digest = hash(marker.build_manifest_digest);
  if (digest === null) fail();
  const selectedTargets = targets(marker.selected_targets);
  const workspaceName = relativePath(marker.workspace_name);
  const workspaceRoot = resolve(marker.workspace_root);
  if (workspaceName !== `.evcrate-publish-${release}`
    || workspaceRoot !== join(resolve(projectRoot), workspaceName)) fail('PATH_UNSAFE');
  const record = {
    phase: 'harness', scope: 'project', status: marker.status, release_id: release,
    selected_targets: selectedTargets,
    binding_order: order(marker.binding_order, selectedTargets, 'project'),
    managed_paths: legacyProjectOwnership(marker),
    previous_managed_paths: legacyProjectOwnership({
      ...marker, managed_paths: marker.previous_managed_paths
    }),
    build_manifest_path: relativePath(marker.build_manifest_path),
    build_manifest_digest: digest, transaction_dir: `release-${release}`,
    retained_release_id: null, destination_root: resolve(projectRoot),
    durable_state_root: resolve(stateRoot), workspace_root: workspaceRoot,
    workspace_name: workspaceName, project_identity: identity, retention: 'none'
  };
  const migrated = {
    schema_version: 2, transaction_type: 'target-publication', scope: 'project',
    records: { harness: record }
  };
  const cleanupPlan = prepareLegacyCleanup(stateRoot, projectRoot, 'project', identity, marker);
  writeReleaseMarker(stateRoot, migrated);
  syncDirectory(resolve(stateRoot));
  if (cleanupPlan !== null) finishLegacyCleanup(stateRoot, cleanupPlan);
}
export function recoverAndMigrateProjectStateUnlocked(
  stateRoot: string, projectRoot: string, identity: string,
  expectedReleaseId: string | null = null
): PublicationRecoveryOutcome {
  const journal = readPublicationJournal(stateRoot);
  let result: PublicationRecoveryOutcome = {
    action: 'none', releaseId: null, selectedTargets: [], bindingOrder: []
  };
  if (journal) {
    if (journal.scope !== 'project' || journal.project_identity !== identity) fail('PATH_UNSAFE');
    result = recoverPublicationUnlocked(stateRoot, projectRoot, expectedReleaseId, identity);
  } else {
    result = recoverPublicationUnlocked(stateRoot, projectRoot, expectedReleaseId, identity);
  }
  const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
  if (marker?.schema_version === 1) {
    if (marker.transaction_type !== 'target-publication') {
      if (marker.status !== 'none') fail('RECOVERY_FAILED');
    } else {
      migrateLegacyProjectMarker(stateRoot, projectRoot, identity, marker);
    }
  } else if (marker?.schema_version === 2) {
    retryLegacyCleanup(stateRoot, projectRoot, 'project', identity, marker);
  }
  return result;
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
  mkdirSync(parent, { recursive: true });
  assertRealDirectory(parent);
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
function v2Marker(
  journal: PublicationJournal, status: 'complete' | 'recovered',
  preservedHarness: Record<string, unknown> | null = null
): Record<string, unknown> {
  if (journal.records === undefined) fail();
  const records: Record<string, unknown> = {};
  for (const [phase, rawRecord] of Object.entries(journal.records)) {
    if (rawRecord === null) {
      records[phase] = phase === 'harness' && journal.scope === 'home'
        && journal.logical_phase === 'shared' && preservedHarness !== null
        ? preservedHarness : null;
      continue;
    }
    records[phase] = {
      ...rawRecord,
      status,
      managed_paths: status === 'recovered' ? rawRecord.previous_managed_paths : rawRecord.managed_paths,
      retained_release_id: status === 'recovered' ? null : journal.retained_release_id
    };
  }
  return {
    schema_version: 2, transaction_type: 'target-publication', scope: journal.scope,
    records
  };
}
function committedMarker(
  journal: PublicationJournal, preservedHarness: Record<string, unknown> | null = null
): Record<string, unknown> {
  if (journal.schema_version === 2 || journal.schema_version === 3) return v2Marker(journal, 'complete', preservedHarness);
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
function recoveredMarker(
  journal: PublicationJournal, preservedHarness: Record<string, unknown> | null = null
): Record<string, unknown> {
  if (journal.schema_version === 2 || journal.schema_version === 3) return v2Marker(journal, 'recovered', preservedHarness);
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
function assertMarkerRecordRoots(
  marker: Record<string, unknown>, destinationRoot: string, stateRoot: string
): void {
  const phases = marker.scope === 'home' ? ['shared', 'harness'] as const : ['harness'] as const;
  for (const phase of phases) {
    const record = publicationMarkerRecord(marker, phase);
    if (record !== null
      && (record.destination_root !== resolve(destinationRoot)
        || record.durable_state_root !== resolve(stateRoot))) fail('PATH_UNSAFE');
  }
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
  if (journal.schema_version === 2 || journal.schema_version === 3) {
    if (marker.schema_version !== 2 || marker.scope !== journal.scope || journal.records === undefined) fail();
    const markerRecords = marker.records;
    if (!isPlainObject(markerRecords)) fail();
    if (stagedWithoutPromotion
      && Object.values(markerRecords).every((record) =>
        record === null || (isPlainObject(record)
          && (record.status === 'complete' || record.status === 'recovered')))) return;
    for (const [phase, journalRecord] of Object.entries(journal.records)) {
      const markerRecord = publicationMarkerRecord(marker, phase as 'shared' | 'harness');
      if (journalRecord === null) {
        const preservedHarness = journal.scope === 'home' && journal.logical_phase === 'shared'
          && phase === 'harness' && markerRecord !== null
          && (markerRecord.status === 'complete' || markerRecord.status === 'recovered');
        if (markerRecord !== null && !preservedHarness) fail();
        continue;
      }
      if (markerRecord === null
        || markerRecord.release_id !== journalRecord.release_id
        || markerRecord.transaction_dir !== journalRecord.transaction_dir
        || markerRecord.build_manifest_digest !== journalRecord.build_manifest_digest) fail();
      const allowedStatuses = journal.status === 'staged'
        ? ['promoting'] : ['promoting', 'complete'];
      if (!allowedStatuses.includes(String(markerRecord.status))) fail();
    }
    return;
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
    const marker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
    const markerRecord = marker?.schema_version === 2
      ? publicationMarkerRecord(marker, 'shared') ?? publicationMarkerRecord(marker, 'harness') : marker;
    if (expectedReleaseId !== null && markerRecord?.release_id !== expectedReleaseId) fail();
    if (marker?.schema_version === 2) {
      const harness = publicationMarkerRecord(marker, 'harness');
      const markerIdentity = harness?.project_identity ?? null;
      if ((expectedProjectIdentity === null && marker.scope !== 'home')
        || (expectedProjectIdentity !== null
          && (marker.scope !== 'project' || markerIdentity !== expectedProjectIdentity))) fail('PATH_UNSAFE');
      assertMarkerRecordRoots(marker, homeRoot, stateRoot);
      for (const phase of marker.scope === 'home' ? ['shared', 'harness'] as const : ['harness'] as const) {
        const record = publicationMarkerRecord(marker, phase);
        if (record !== null && record.status !== 'complete' && record.status !== 'recovered') fail();
      }
    } else {
      if (marker && ((expectedProjectIdentity === null && marker.scope === 'project')
        || (expectedProjectIdentity !== null
          && (marker.scope !== 'project' || marker.project_identity !== expectedProjectIdentity)))) {
        fail('PATH_UNSAFE');
      }
      if (marker && expectedProjectIdentity !== null && marker.transaction_type === 'target-publication') {
        if (typeof marker.destination_root !== 'string'
          || resolve(marker.destination_root) !== resolve(homeRoot)
          || typeof marker.durable_state_root !== 'string'
          || resolve(marker.durable_state_root) !== resolve(stateRoot)
          || typeof marker.workspace_root !== 'string' || typeof marker.workspace_name !== 'string'
          || marker.workspace_name !== `.evcrate-publish-${releaseId(marker.release_id)}`
          || resolve(marker.workspace_root) !== join(resolve(homeRoot), marker.workspace_name)) {
          fail('PATH_UNSAFE');
        }
      }
      if (marker && marker.status !== 'none' && marker.status !== 'complete' && marker.status !== 'recovered') fail();
    }
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
  assertRealDirectory(resolve(homeRoot));
  assertRealDirectory(resolve(stateRoot));
  if (journal.scope === 'project') {
    const expectedWorkspace = join(resolve(homeRoot), journal.workspace_name);
    if (resolve(journal.workspace_root) !== expectedWorkspace
      || !sameVolume(resolve(homeRoot), dirname(resolve(journal.workspace_root)))) fail('PATH_UNSAFE');
  } else if (resolve(journal.workspace_root) !== join(resolve(stateRoot), journal.transaction_dir)) {
    fail('PATH_UNSAFE');
  }
  const currentMarker = readOptionalPublicationMarker(join(resolve(stateRoot), RELEASE_MARKER_NAME));
  const preservedHarness = (journal.schema_version === 2 || journal.schema_version === 3) && journal.scope === 'home'
    && journal.logical_phase === 'shared' && currentMarker !== null
    ? publicationMarkerRecord(currentMarker, 'harness') : null;
  assertMarkerMatches(stateRoot, journal, expectedProjectIdentity);
  const transactionRoot = resolve(journal.workspace_root);
  let transactionPresent = true;
  try {
    const stat = lstatSync(transactionRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
    assertRealDirectory(transactionRoot);
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
    writeReleaseMarker(stateRoot, committedMarker(journal, preservedHarness));
    cleanup(stateRoot, transactionRoot, journal.retain_transaction);
    return { action: 'finalized', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
  }
  writeReleaseMarker(stateRoot, recoveredMarker(journal, preservedHarness));
  cleanup(stateRoot, transactionRoot, false);
  return { action: 'rolled-back', releaseId: journal.release_id, selectedTargets: journal.selected_targets, bindingOrder: journal.binding_order };
}
