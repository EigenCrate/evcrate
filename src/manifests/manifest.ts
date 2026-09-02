import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { type PersistedTarget } from '../protocol/validation.js';
import { assertJsonText } from '../protocol/canonical-json.js';
import { assertNoSymlinkAncestors, assertRegularFile, containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { readBoundedFile } from '../filesystem/hashing.js';
import { HOME_PUBLICATION_RULES, type HomePolicy, type HomePublicationRule, type PatchSpec, type SharedJsonSpec, type TargetManifest } from './types.js';

function invalid(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' = 'PROTOCOL_INVALID'): never {
  throw new ControlPlaneError(code);
}
function object(value: unknown, code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' = 'PROTOCOL_INVALID'): Record<string, unknown> {
  if (!isPlainObject(value)) invalid(code);
  return value;
}
function readObject(path: string): Record<string, unknown> {
  try {
    assertNoSymlinkAncestors(path);
    return object(parseJsonDocument(readBoundedFile(path, 64 * 1024)));
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    invalid();
  }
}
function pathList(value: unknown, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every((item) => typeof item === 'string')) invalid();
  const paths = value.map((item) => normalizeRelativePath(item));
  if (new Set(paths).size !== paths.length) invalid();
  return paths;
}
function repositoryFor(path: string): string {
  const targetDirectory = dirname(path);
  const targetsDirectory = dirname(targetDirectory);
  return targetsDirectory.endsWith(join('.evcrate', 'targets'))
    ? dirname(dirname(dirname(targetDirectory))) : targetDirectory;
}
function parsePolicy(value: unknown, roots: readonly string[]): HomePolicy {
  const raw = object(value);
  const allowed = new Set(['bindings', 'preserve_paths', 'promotion_order', 'reject_unmanaged_collisions', 'publication_rules']);
  if (Object.keys(raw).some((key) => !allowed.has(key))) invalid();
  const rawBindings = object(raw.bindings);
  const bindings: Record<string, string> = {};
  for (const [local, home] of Object.entries(rawBindings)) {
    const localRoot = normalizeRelativePath(local);
    if (!roots.includes(localRoot)) invalid();
    bindings[localRoot] = normalizeRelativePath(home);
  }
  if (Object.keys(bindings).length !== roots.length || new Set(Object.values(bindings)).size !== roots.length) invalid();
  const preserveRaw = raw.preserve_paths === undefined ? {} : object(raw.preserve_paths);
  const preservePaths: Record<string, readonly string[]> = {};
  for (const [root, values] of Object.entries(preserveRaw)) {
    const normalizedRoot = normalizeRelativePath(root);
    if (!roots.includes(normalizedRoot)) invalid();
    preservePaths[normalizedRoot] = Object.freeze(pathList(values));
  }
  if (!Number.isSafeInteger(raw.promotion_order) || (raw.promotion_order as number) < 0) invalid();
  const reject = raw.reject_unmanaged_collisions ?? false;
  if (typeof reject !== 'boolean') invalid();
  const rawRules = raw.publication_rules === undefined ? [] : raw.publication_rules;
  if (!Array.isArray(rawRules)
    || !rawRules.every((rule): rule is HomePublicationRule =>
      typeof rule === 'string' && HOME_PUBLICATION_RULES.includes(rule as HomePublicationRule))
    || new Set(rawRules).size !== rawRules.length) invalid();
  return Object.freeze({
    bindings: Object.freeze(bindings),
    preservePaths: Object.freeze(preservePaths),
    promotionOrder: raw.promotion_order as number,
    rejectUnmanagedCollisions: reject,
    publicationRules: Object.freeze(rawRules)
  });
}
function parseSharedJson(value: unknown): SharedJsonSpec {
  const raw = object(value);
  if (raw.schema !== 'pi-settings-v1' && raw.schema !== 'managed-json-v1') invalid();
  if (typeof raw.destination !== 'string' || typeof raw.fragment !== 'string') invalid();
  const destination = normalizeRelativePath(raw.destination);
  const fragment = normalizeRelativePath(raw.fragment);
  if (destination === fragment) invalid();
  const managed = pathList(raw.managed_keys, false);
  if (raw.schema === 'managed-json-v1' && managed.some((key) => key.includes('.'))) invalid();
  return Object.freeze({ schema: raw.schema, destination, fragment, managedKeys: Object.freeze(managed) });
}
export function loadTargetManifest(path: string, expectedId?: PersistedTarget): TargetManifest {
  const data = readObject(path);
  if (data.schema_version !== 2 || Object.hasOwn(data, 'runtime') || Object.hasOwn(data, 'advisor_runtime')) invalid();
  if (typeof data.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(data.name)) invalid();
  if (expectedId !== undefined && data.name !== expectedId) invalid();
  const id = data.name;
  const sourceRoot = dirname(path);
  const repository = repositoryFor(path);
  const adapter = data.adapter === undefined || data.adapter === null
    ? null : typeof data.adapter === 'string' ? normalizeRelativePath(data.adapter) : invalid();
  const adapterSources = pathList(data.adapter_sources ?? []);
  for (const source of adapterSources) {
    const full = containedPath(repository, source, false);
    if (existsSync(full)) assertRegularFile(full);
  }
  if (adapter !== null) {
    const full = containedPath(repository, adapter, false);
    if (existsSync(full)) assertRegularFile(full);
  }
  const rootsValue = data.output_roots ?? (typeof data.output_root === 'string'
    ? [data.output_root, ...(Array.isArray(data.additional_roots) ? data.additional_roots : [])] : undefined);
  const outputRoots = pathList(rootsValue, false);
  const ownedPaths = pathList(data.owned_paths ?? []);
  for (const owned of ownedPaths) {
    if (!owned.startsWith('files/')) invalid();
    containedPath(sourceRoot, owned, true);
  }
  const rawPatches = data.patches ?? [];
  if (!Array.isArray(rawPatches)) invalid();
  const patchDestinations = new Set<string>();
  const patches: PatchSpec[] = rawPatches.map((value) => {
    const patch = object(value);
    if (typeof patch.source !== 'string' || typeof patch.destination !== 'string' || !Array.isArray(patch.keys)) invalid();
    const source = normalizeRelativePath(patch.source);
    const destination = normalizeRelativePath(patch.destination);
    if (patchDestinations.has(destination)) invalid();
    patchDestinations.add(destination);
    const keys = patch.keys.map((key) => {
      if (typeof key !== 'string' || !key || key.split('.').some((part) => !part)) invalid();
      try { assertJsonText(key); } catch { invalid(); }
      return key;
    });
    if (!source.startsWith('patches/') || !outputRoots.some((root) => destination.startsWith(`${root}/`))
      || new Set(keys).size !== keys.length) invalid();
    assertRegularFile(containedPath(sourceRoot, source, true));
    return Object.freeze({ source, destination, keys: Object.freeze(keys) });
  });
  const docs = pathList(data.project_docs ?? []);
  if (docs.some((doc) => doc.includes('/'))) invalid();
  const overlayRoot = data.overlay_root === undefined || data.overlay_root === null
    ? null : containedPath(repository, normalizeRelativePath(data.overlay_root));
  const policyValue = data.home_policy ?? { bindings: {}, preserve_paths: {}, promotion_order: 0 };
  const policy = parsePolicy(policyValue, outputRoots);
  const sharedJson = data.shared_json === undefined || data.shared_json === null ? null : parseSharedJson(data.shared_json);
  return Object.freeze({ id, name: data.name, manifestPath: path, adapter,
    adapterSources: Object.freeze(adapterSources), outputRoots: Object.freeze(outputRoots), ownedPaths: Object.freeze(ownedPaths),
    patches: Object.freeze(patches), projectDocs: Object.freeze(docs), homePolicy: policy, sourceRoot, overlayRoot, sharedJson });
}
