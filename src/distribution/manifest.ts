import { lstatSync } from 'node:fs';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertExactKeys, assertSafeBoundedJson, boundedText } from '../protocol/validation.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { hashFile, readBoundedFile, treeHash } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors, normalizeRelativePath } from '../filesystem/paths.js';
import { ADVISOR_CONTROLLER_FILES, controllerHashes } from '../manifests/controller.js';
import type { BuildManifest } from '../manifests/types.js';

export const MAX_BUILD_MANIFEST_BYTES = 4 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
const MANIFEST_KEYS = ['schema_version', 'source_hashes', 'adapter_hashes', 'controller_hashes', 'owners', 'output_hashes', 'validation', 'home_policy'] as const;
function fail(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'PUBLICATION_FAILED'): never { throw new ControlPlaneError(code); }
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
function controllerHashValues(value: unknown): Readonly<Record<string, string>> {
  const result = hashes(value);
  const expected = new Set(ADVISOR_CONTROLLER_FILES.map((entry) => `.evcrate/bin/${entry}`));
  const keys = Object.keys(result);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) fail('PROTOCOL_INVALID');
  return result;
}
export function validateBuildManifest(value: unknown): BuildManifest {
  assertSafeBoundedJson(value, MAX_BUILD_MANIFEST_BYTES);
  assertExactKeys(value, MANIFEST_KEYS, 'PROTOCOL_INVALID');
  const data = value as Record<string, unknown>;
  if (data.schema_version !== 2) fail('PROTOCOL_INVALID');
  const validation = record(data.validation);
  const homePolicy = record(data.home_policy);
  return Object.freeze({
    schema_version: 2,
    source_hashes: hashes(data.source_hashes),
    adapter_hashes: hashes(data.adapter_hashes),
    controller_hashes: controllerHashValues(data.controller_hashes),
    owners: owners(data.owners),
    output_hashes: hashes(data.output_hashes),
    validation: Object.freeze({ ...record(data.validation) }),
    home_policy: Object.freeze({ ...record(data.home_policy) })
  });
}
export function readBuildManifest(pathValue: string): BuildManifest {
  const path = pathValue;
  assertNoSymlinkAncestors(path);
  try {
    return validateBuildManifest(parseJsonDocument(readBoundedFile(path, MAX_BUILD_MANIFEST_BYTES), MAX_BUILD_MANIFEST_BYTES));
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PROTOCOL_INVALID');
  }
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
export function verifyControllerHashes(manifest: BuildManifest, controllerRoot: string): void {
  const actual = controllerHashes(controllerRoot);
  if (!sameRecord(actual, manifest.controller_hashes)) fail('PUBLICATION_FAILED');
}
export interface BuildVerificationOptions {
  readonly manifestPath: string;
  readonly outputRoots: Readonly<Record<string, string>>;
  readonly controllerRoot: string;
  readonly sourceHashes?: Readonly<Record<string, string>>;
  readonly adapterHashes?: Readonly<Record<string, string>>;
}
export function verifyBuild(options: BuildVerificationOptions): BuildManifest {
  const manifest = readBuildManifest(options.manifestPath);
  if (manifest.validation.complete !== true) fail('PUBLICATION_FAILED');
  if (options.sourceHashes !== undefined && !sameRecord(manifest.source_hashes, options.sourceHashes)) fail('PUBLICATION_FAILED');
  if (options.adapterHashes !== undefined && !sameRecord(manifest.adapter_hashes, options.adapterHashes)) fail('PUBLICATION_FAILED');
  if (options.controllerRoot !== undefined) verifyControllerHashes(manifest, options.controllerRoot);
  verifyOutputHashes(manifest, options.outputRoots);
  return manifest;
}
