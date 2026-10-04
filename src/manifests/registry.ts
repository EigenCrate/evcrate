import { existsSync, lstatSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import { isSensitivePathSegment } from '../protocol/resource-payload-validation.js';
import { assertNoSymlinkAncestors, assertRealDirectory, containedPath, normalizeRelativePath, pathOverlaps } from '../filesystem/paths.js';
import { canonicalJsonBytes, hashBytes, hashFile, readBoundedFile, treeHash } from '../filesystem/hashing.js';
import { loadTargetManifest } from './manifest.js';
import { RESOURCE_KINDS, type BuildManifest, type ResourceKind, type ResourceRootMap, type TargetManifest, type TargetManifestRegistry } from './types.js';
import { ADVISOR_CONTROLLER_FILES, controllerHashes } from './controller.js';
function invalid(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'CAPABILITY_UNSUPPORTED' = 'PROTOCOL_INVALID'): never {
  throw new ControlPlaneError(code);
}
function readObject(path: string): Record<string, unknown> {
  try {
    assertNoSymlinkAncestors(path);
    const parsed = parseJsonDocument(readBoundedFile(path, 64 * 1024));
    if (!isPlainObject(parsed)) invalid();
    return parsed;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    invalid();
  }
}
function loadResourceRoots(value: unknown, registryPath: string): ResourceRootMap {
  if (!isPlainObject(value)) invalid();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== RESOURCE_KINDS.length
    || RESOURCE_KINDS.some((kind) => !Object.hasOwn(raw, kind))) invalid();
  const repository = dirname(dirname(dirname(registryPath)));
  const canonicalRoot = join(repository, '.evcrate', 'source', '.claude');
  assertRealDirectory(canonicalRoot);
  const result: Record<ResourceKind, string> = {} as Record<ResourceKind, string>;
  for (const kind of RESOURCE_KINDS) {
    if (typeof raw[kind] !== 'string') invalid();
    const root = normalizeRelativePath(raw[kind]);
    if (root.split('/').some(isSensitivePathSegment)) invalid();
    assertRealDirectory(containedPath(canonicalRoot, root, true));
    if (RESOURCE_KINDS.some((other) => other !== kind && result[other] !== undefined && pathOverlaps(root, result[other]))) {
      invalid();
    }
    result[kind] = root;
  }
  return Object.freeze(result);
}
export function validateManifestSet(manifests: readonly TargetManifest[]): void {
  const outputOwners = new Map<string, string>();
  const docOwners = new Map<string, string>();
  const homeOwners = new Map<string, string>();
  const policies: Array<{ target: string; home: string; order: number }> = [];
  for (const manifest of manifests) {
    for (const root of manifest.outputRoots) {
      if ([...outputOwners.keys()].some((existing) => pathOverlaps(existing, root))) invalid();
      if ([...docOwners.keys()].some((existingDoc) => pathOverlaps(root, existingDoc))) invalid();
      outputOwners.set(root, manifest.name);
    }
    for (const doc of manifest.projectDocs) {
      if (docOwners.has(doc)) invalid();
      if ([...outputOwners.keys()].some((existingRoot) => pathOverlaps(existingRoot, doc))) invalid();
      docOwners.set(doc, manifest.name);
    }
    for (const [root, home] of Object.entries(manifest.homePolicy.bindings)) {
      const owner = homeOwners.get(home);
      if (owner !== undefined && owner !== manifest.name) invalid();
      homeOwners.set(home, manifest.name);
      policies.push({ target: manifest.name, home, order: manifest.homePolicy.promotionOrder });
      if (!manifest.outputRoots.includes(root)) invalid();
    }
  }
  const ordered = policies.sort((left, right) => left.order - right.order || (left.home < right.home ? -1 : left.home > right.home ? 1 : 0));
  for (let index = 0; index < ordered.length; index += 1) {
    for (const prior of ordered.slice(0, index)) {
      if (ordered[index].home.startsWith(`${prior.home}/`) && ordered[index].order <= prior.order) invalid();
    }
  }
}
export function loadTargetManifestRegistry(path: string): TargetManifestRegistry {
  const data = readObject(path);
  if (data.schema_version !== 2 || !isPlainObject(data.targets) || !isPlainObject(data.resource_roots)) invalid();
  const resourceRoots = loadResourceRoots(data.resource_roots, path);
  const entries = Object.entries(data.targets).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  if (!entries.length) invalid();
  const targets = new Map<PersistedTarget, TargetManifest>();
  const targetRoot = dirname(path);
  for (const [rawName, rawPath] of entries) {
    let id: PersistedTarget;
    try { id = normalizeTarget(rawName); } catch { invalid(); }
    if (id !== rawName || typeof rawPath !== 'string') invalid();
    let relativeManifest: string;
    try { relativeManifest = normalizeRelativePath(rawPath); } catch { invalid(); }
    if (relativeManifest !== `${id}/manifest.json`) invalid();
    let manifestPath: string;
    try { manifestPath = containedPath(targetRoot, relativeManifest, true); } catch { invalid(); }
    const manifest = loadTargetManifest(manifestPath, id);
    if (targets.has(id)) invalid();
    targets.set(id, manifest);
  }
  validateManifestSet([...targets.values()]);
  return Object.freeze({ registryPath: path, targets, resourceRoots });
}
export function loadSelectedManifests(
  registryOrPath: TargetManifestRegistry | string, requested: readonly string[] = []
): readonly TargetManifest[] {
  const registry = typeof registryOrPath === 'string' ? loadTargetManifestRegistry(registryOrPath) : registryOrPath;
  const normalized = requested.map((value) => normalizeTarget(value));
  if (new Set(normalized).size !== normalized.length) invalid();
  const wanted = normalized.length ? new Set(normalized) : new Set(registry.targets.keys());
  for (const id of wanted) if (!registry.targets.has(id)) invalid('CAPABILITY_UNSUPPORTED');
  const selected = [...registry.targets.entries()]
    .filter(([id]) => wanted.has(id)).map(([, manifest]) => manifest);
  validateManifestSet(selected);
  return Object.freeze(selected);
}
function sortedRecord(values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}
function putRecord(target: Record<string, string>, key: string, value: string): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}
export function manifestAdapterHashes(manifests: readonly TargetManifest[], repository: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const manifest of manifests) {
    for (const path of [manifest.adapter, ...manifest.adapterSources].filter((value): value is string => value !== null)) {
      const normalized = normalizeRelativePath(path);
      const full = containedPath(repository, normalized, false);
      if (existsSync(full)) {
        putRecord(values, normalized, hashFile(containedPath(repository, normalized, true)));
      }
    }
  }
  return sortedRecord(values);
}
export function manifestSourceHashes(manifests: readonly TargetManifest[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const manifest of manifests) {
    putRecord(values, `${manifest.name}/manifest.json`, hashFile(manifest.manifestPath));
    if (manifest.overlayRoot !== null) {
      const overlayName = basename(manifest.overlayRoot);
      if (!overlayName || overlayName === '.' || overlayName === '..') throw new ControlPlaneError('PATH_UNSAFE');
      putRecord(values, `${manifest.name}/${overlayName}`, treeHashIfPresent(manifest.overlayRoot));
    }
    for (const owned of manifest.ownedPaths) {
      const path = containedPath(manifest.sourceRoot, owned, true);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
      putRecord(values, `${manifest.name}/${owned}`, stat.isDirectory() ? treeHash(path) : hashFile(path));
    }
    for (const patch of manifest.patches) {
      putRecord(values, `${manifest.name}/${patch.source}`, hashFile(containedPath(manifest.sourceRoot, patch.source, true)));
    }
  }
  return sortedRecord(values);
}
function treeHashIfPresent(path: string): string {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ControlPlaneError('PATH_UNSAFE');
    return treeHash(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return hashBytes(new Uint8Array());
    throw error;
  }
}
export interface BuildManifestInputs {
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly controllerHashes: Readonly<Record<string, string>>;
  readonly owners: Readonly<Record<string, string>>;
  readonly outputRoots: Readonly<Record<string, string>>;
  readonly validation: Readonly<Record<string, unknown>>;
  readonly homePolicy: Readonly<Record<string, unknown>>;
}
export function buildManifestBytes(inputs: BuildManifestInputs): Uint8Array {
  const outputHashes: Record<string, string> = {};
  for (const [name, path] of Object.entries(inputs.outputRoots)) {
    const normalized = normalizeRelativePath(name);
    if (normalized !== name) invalid();
    assertNoSymlinkAncestors(path);
    let stat: ReturnType<typeof lstatSync>;
    try { stat = lstatSync(path); } catch { invalid('PATH_UNSAFE'); }
    if (!stat.isFile() && !stat.isDirectory()) invalid('PATH_UNSAFE');
    putRecord(outputHashes, normalized, stat.isDirectory() ? treeHash(path) : hashFile(path));
  }
  const expectedController = new Set(ADVISOR_CONTROLLER_FILES.map((entry) => `.evcrate/bin/${entry}`));
  const actualController = Object.keys(inputs.controllerHashes);
  if (actualController.length !== expectedController.size || actualController.some((key) => !expectedController.has(key))) invalid();
  const manifest: BuildManifest = { schema_version: 2, source_hashes: sortedRecord(inputs.sourceHashes),
    adapter_hashes: sortedRecord(inputs.adapterHashes), controller_hashes: sortedRecord(inputs.controllerHashes),
    owners: sortedRecord(inputs.owners), output_hashes: sortedRecord(outputHashes), validation: inputs.validation, home_policy: inputs.homePolicy };
  return canonicalJsonBytes(manifest);
}
export function buildManifestDigest(inputs: BuildManifestInputs): string { return hashBytes(buildManifestBytes(inputs)); }
export { controllerHashes };
