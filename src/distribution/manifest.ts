import { lstatSync } from 'node:fs';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertExactKeys, assertSafeBoundedJson, boundedText } from '../protocol/validation.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { hashBytes, hashFile, readBoundedFile, treeHash } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, normalizeRelativePath } from '../filesystem/paths.js';
import type { BuildManifest } from '../manifests/types.js';

export const MAX_BUILD_MANIFEST_BYTES = 8 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
const MANIFEST_KEYS = ['schema_version', 'source_hashes', 'adapter_hashes', 'owners', 'output_hashes', 'validation', 'home_policy'] as const;
function fail(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'PUBLICATION_FAILED'): never { throw new ControlPlaneError(code); }
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) fail('PROTOCOL_INVALID');
  return value;
}
function safeKey(value: string): string {
  try {
    const normalized = normalizeRelativePath(value);
    if (normalized !== value) fail('PROTOCOL_INVALID');
    return normalized;
  } catch {
    fail('PROTOCOL_INVALID');
  }
}
function hashes(value: unknown): Readonly<Record<string, string>> {
  const source = record(value);
  const entries: Array<[string, string]> = [];
  const keys = new Set<string>();
  for (const [key, digest] of Object.entries(source)) {
    const normalized = safeKey(key);
    if (keys.has(normalized) || typeof digest !== 'string' || !HASH.test(digest)) fail('PROTOCOL_INVALID');
    keys.add(normalized);
    entries.push([normalized, digest]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
function owners(value: unknown): Readonly<Record<string, string>> {
  const source = record(value);
  const entries: Array<[string, string]> = [];
  const keys = new Set<string>();
  for (const [key, owner] of Object.entries(source)) {
    const normalized = safeKey(key);
    if (keys.has(normalized) || typeof owner !== 'string') fail('PROTOCOL_INVALID');
    keys.add(normalized);
    entries.push([normalized, boundedText(owner, 256, 'owner', 'PROTOCOL_INVALID')]);
  }
  return Object.freeze(Object.fromEntries(entries));
}
export function validateBuildManifest(value: unknown): BuildManifest {
  assertSafeBoundedJson(value, MAX_BUILD_MANIFEST_BYTES);
  if (isPlainObject(value) && (value.schema_version === 1 || value.schema_version === 2)) {
    throw new ControlPlaneError('PROTOCOL_INVALID', 'Obsolete build manifest; run npm run build && npm run generate:registry && npm run generate:manifests to regenerate current artifacts.');
  }
  assertExactKeys(value, MANIFEST_KEYS, 'PROTOCOL_INVALID');
  const data = value as Record<string, unknown>;
  if (data.schema_version !== 3) fail('PROTOCOL_INVALID');
  assertExactKeys(data.validation, ['complete', 'symlinks', 'target_registry'], 'PROTOCOL_INVALID');
  const validation = record(data.validation);
  if (validation.complete !== true || validation.symlinks !== 'rejected'
    || validation.target_registry !== 'validated') fail('PROTOCOL_INVALID');
  const homePolicy = record(data.home_policy);
  const manifest = {
    schema_version: 3 as const,
    source_hashes: hashes(data.source_hashes),
    adapter_hashes: hashes(data.adapter_hashes),
    owners: owners(data.owners),
    output_hashes: hashes(data.output_hashes),
    validation: Object.freeze({ ...validation }),
    home_policy: Object.freeze({ ...homePolicy })
  };
  return deepFreeze(manifest);
}
export interface BuildManifestSnapshot {
  readonly manifest: BuildManifest;
  readonly digest: string;
}
export function readBuildManifestSnapshot(pathValue: string): BuildManifestSnapshot {
  const path = pathValue;
  assertNoSymlinkAncestors(path);
  try {
    const bytes = readBoundedFile(path, MAX_BUILD_MANIFEST_BYTES);
    const manifest = validateBuildManifest(parseJsonDocument(bytes, MAX_BUILD_MANIFEST_BYTES));
    return Object.freeze({ manifest, digest: hashBytes(bytes) });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PROTOCOL_INVALID');
  }
}
export function readBuildManifest(pathValue: string): BuildManifest {
  return readBuildManifestSnapshot(pathValue).manifest;
}
function digestPath(path: string): string {
  assertNoSymlinkAncestors(path);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail('PATH_UNSAFE');
    if (stat.isDirectory()) return treeHash(path);
    if (stat.isFile()) return hashFile(path);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
  fail('PATH_UNSAFE');
}
function sameRecord(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => right[key] === value);
}
export function verifyOutputHashes(manifest: BuildManifest, outputs: Readonly<Record<string, string>>): void {
  const actualHashes: Record<string, string> = {};
  for (const [name, path] of Object.entries(outputs)) {
    actualHashes[safeKey(name)] = digestPath(path);
  }
  if (!sameRecord(manifest.output_hashes, actualHashes)) {
    fail('PUBLICATION_FAILED');
  }
}
export interface BuildVerificationOptions {
  readonly manifestPath: string;
  readonly outputRoots: Readonly<Record<string, string>>;
  readonly sourceHashes?: Readonly<Record<string, string>>;
  readonly adapterHashes?: Readonly<Record<string, string>>;
  readonly manifest?: BuildManifest;
}
export function verifyBuild(options: BuildVerificationOptions): BuildManifest {
  const manifest = options.manifest ?? readBuildManifest(options.manifestPath);
  if (manifest.validation.complete !== true) fail('PUBLICATION_FAILED');
  if (options.sourceHashes !== undefined && !sameRecord(manifest.source_hashes, options.sourceHashes)) fail('PUBLICATION_FAILED');
  if (options.adapterHashes !== undefined && !sameRecord(manifest.adapter_hashes, options.adapterHashes)) fail('PUBLICATION_FAILED');
  verifyOutputHashes(manifest, options.outputRoots);
  return manifest;
}
