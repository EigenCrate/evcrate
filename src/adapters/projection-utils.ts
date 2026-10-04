import { lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument } from '../protocol/json.js';
import { normalizeTarget } from '../protocol/validation.js';
import { assertNoSymlinkAncestors, containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { hashBytes, readBoundedFile } from '../filesystem/hashing.js';
import { writeAtomicProjectionFile } from '../filesystem/atomic.js';
import { registerProjectionExpectation, projectionExpectations } from './types.js';
import type { ProjectionBuildContext, ProjectionExpectedEntry, ProjectionValidation, ProjectedFileDiagnostic } from './types.js';
import type { ResourceGraphFile } from './resource-graph.js';
const FORBIDDEN_CONTROLLER_PARTS = new Set(['__tests__', 'tests', 'fixtures', 'helpers']);
const FORBIDDEN_CONTROLLER_SUFFIXES = ['.test.cjs', '.test.js', '.test.mjs', '.test.py', '.spec.cjs', '.spec.js'];

export function isProductionControllerArtifact(path: string): boolean {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  return parts.some((part) => FORBIDDEN_CONTROLLER_PARTS.has(part))
    || name.startsWith('fake-')
    || FORBIDDEN_CONTROLLER_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function unsafe(): never {
  throw new ControlPlaneError('PATH_UNSAFE');
}

function normalized(value: string): string {
  try { return normalizeRelativePath(value); } catch { return unsafe(); }
}

export function graphFile(context: ProjectionBuildContext, path: string): ResourceGraphFile {
  const name = normalized(path);
  const file = context.resources.files.find((entry) => entry.path === name);
  if (!file) throw new ControlPlaneError('VALIDATION_INVALID');
  return file;
}

export function graphText(context: ProjectionBuildContext, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(graphFile(context, path).bytes); }
  catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

export function sourceSibling(context: ProjectionBuildContext, path: string): string {
  const name = normalized(path);
  return containedPath(dirname(context.canonicalRoot), name, true);
}

export function siblingBytes(context: ProjectionBuildContext, path: string, maxBytes = 16 * 1024 * 1024): Uint8Array {
  try { return readBoundedFile(sourceSibling(context, path), maxBytes); }
  catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

export function siblingText(context: ProjectionBuildContext, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(siblingBytes(context, path)); }
  catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

export function siblingJson(context: ProjectionBuildContext, path: string): unknown {
  return parseJsonDocument(siblingBytes(context, path));
}

export function ensureProjectionDirectory(context: ProjectionBuildContext, path: string): string {
  const name = normalized(path);
  const destination = context.stagePath(name);
  assertNoSymlinkAncestors(destination);
  try { mkdirSync(destination, { recursive: true }); }
  catch { unsafe(); }
  assertNoSymlinkAncestors(destination);
  const stat = lstatSync(destination);
  if (stat.isSymbolicLink() || !stat.isDirectory()) unsafe();
  registerProjectionExpectation(context, {
    path: name,
    kind: 'directory'
  });
  return destination;
}

export function writeProjectionFile(
  context: ProjectionBuildContext,
  path: string,
  bytes: Uint8Array,
  executable = false,
): void {
  const name = normalized(path);
  const destination = context.stagePath(name);
  const parent = relative(context.stage.path, dirname(destination)).split('\\').join('/');
  if (parent) ensureProjectionDirectory(context, parent);
  else assertNoSymlinkAncestors(context.stage.path);
  try {
    writeAtomicProjectionFile(destination, bytes, executable);
    registerProjectionExpectation(context, {
      path: name,
      kind: 'file',
      size: bytes.byteLength,
      hash: hashBytes(bytes)
    });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PUBLICATION_FAILED');
  }
}

export function copyGraphFile(context: ProjectionBuildContext, source: string, destination: string): void {
  const file = graphFile(context, source);
  writeProjectionFile(context, destination, file.bytes, file.executable ?? false);
}

export function copyGraphTree(
  context: ProjectionBuildContext,
  sourcePrefix: string,
  destinationPrefix: string,
  transform?: (path: string, bytes: Uint8Array) => Uint8Array,
): void {
  const prefix = normalized(sourcePrefix).replace(/\/$/u, '');
  for (const file of context.resources.files) {
    if (file.path !== prefix && !file.path.startsWith(`${prefix}/`)) continue;
    const suffix = file.path === prefix ? '' : file.path.slice(prefix.length + 1);
    const target = suffix ? `${destinationPrefix}/${suffix}` : destinationPrefix;
    writeProjectionFile(context, target, transform ? transform(file.path, file.bytes) : file.bytes, file.executable ?? false);
  }
}

type ActualProjectionEntry = {
  readonly kind: 'file' | 'directory';
  readonly size?: number;
  readonly hash?: string;
};

function collectFiles(
  context: ProjectionBuildContext,
  current: string,
  actual: Map<string, ActualProjectionEntry>,
  diagnostics: ProjectedFileDiagnostic[]
): void {
  let entries;
  try { entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)); }
  catch {
    diagnostics.push({ path: relative(context.stage.path, current).split('\\').join('/'), kind: 'directory', code: 'unsafe' });
    return;
  }
  for (const entry of entries) {
    const path = join(current, entry.name);
    const relativePath = relative(context.stage.path, path).split('\\').join('/');
    let stat;
    try { stat = lstatSync(path); }
    catch {
      diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
      continue;
    }
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
      continue;
    }
    if (stat.isDirectory()) {
      actual.set(relativePath, { kind: 'directory' });
      collectFiles(context, path, actual, diagnostics);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = readBoundedFile(path, 16 * 1024 * 1024);
      const final = lstatSync(path);
      if (final.isSymbolicLink() || !final.isFile()
        || Number(final.dev) !== Number(stat.dev) || Number(final.ino) !== Number(stat.ino)
        || Number(final.size) !== Number(stat.size)) {
        throw new ControlPlaneError('PATH_UNSAFE');
      }
    } catch {
      diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
      continue;
    }
    const hash = hashBytes(bytes);
    actual.set(relativePath, { kind: 'file', size: bytes.byteLength, hash });
    const rootRelative = relative(context.stage.path, path).split('\\').join('/');
    if (rootRelative.endsWith('/migration-behavior-matrix.json')
      || rootRelative.endsWith('/evcrate/migration-inventory.json')
      || rootRelative.endsWith('/evcrate/projection-inventory.json')) continue;
    const text = bytes.includes(0) ? '' : new TextDecoder('utf-8').decode(bytes);
    if (/\.claude(?:[\\/]|$)/u.test(text.replace(/(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu, ''))
      || relativePath.includes('bin/lib/advisor/')) {
      diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
    }
  }
}

function expectedEntries(context: ProjectionBuildContext): Map<string, ProjectionExpectedEntry> {
  const expected = new Map(projectionExpectations(context).map((entry) => [entry.path, entry]));
  for (const entry of [...expected.values()]) {
    const parts = entry.path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      const parent = parts.slice(0, index).join('/');
      if (!expected.has(parent)) expected.set(parent, { path: parent, kind: 'directory' });
    }
  }
  return expected;
}

export function validateProjection(context: ProjectionBuildContext): ProjectionValidation {
  const diagnostics: ProjectedFileDiagnostic[] = [];
  try {
    assertNoSymlinkAncestors(context.stage.path);
    const stage = lstatSync(context.stage.path);
    if (stage.isSymbolicLink() || !stage.isDirectory()) throw new ControlPlaneError('PATH_UNSAFE');
  } catch {
    return Object.freeze({
      target: normalizeTarget(context.manifest.id),
      valid: false,
      diagnostics: Object.freeze([{ path: '', kind: 'directory' as const, code: 'unsafe' as const }])
    });
  }
  const actual = new Map<string, ActualProjectionEntry>();
  collectFiles(context, context.stage.path, actual, diagnostics);
  const expected = expectedEntries(context);
  for (const [path, entry] of actual) {
    const wanted = expected.get(path);
    if (!wanted) {
      diagnostics.push({ path, kind: entry.kind, code: 'unexpected' });
      continue;
    }
    if (wanted.kind !== entry.kind) {
      diagnostics.push({ path, kind: entry.kind, code: 'kind-mismatch', expected: wanted.kind, actual: entry.kind });
      continue;
    }
    if (entry.kind === 'file' && wanted.kind === 'file') {
      if (wanted.size !== undefined && wanted.size !== entry.size) {
        diagnostics.push({ path, kind: 'file', code: 'bytes-mismatch', expected: wanted.size, actual: entry.size });
      } else if (wanted.hash !== undefined && wanted.hash !== entry.hash) {
        diagnostics.push({ path, kind: 'file', code: 'hash-mismatch', expected: wanted.hash, actual: entry.hash });
      }
    }
  }
  for (const [path, entry] of expected) {
    if (!actual.has(path)) {
      diagnostics.push({
        path,
        kind: entry.kind,
        code: 'missing',
        expected: entry.hash
      });
    }
  }
  return Object.freeze({
    target: normalizeTarget(context.manifest.id),
    valid: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics)
  });
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

export function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value.replace(/\r\n?/gu, '\n'));
}

export function contentHash(value: Uint8Array): string { return hashBytes(value); }

export { restoreIndexedTokens } from './uri-restoration.js';
