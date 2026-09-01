import { closeSync, constants, lstatSync, openSync, readSync, readdirSync, type Dirent, type Stats } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertOwnerControlledDirectory, containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { completeTreeHash, compareCanonicalPaths, hashFileWithMode } from '../filesystem/hashing.js';
import { PERSISTED_TARGETS } from '../protocol/validation.js';
import { IMPORT_CAPABILITIES, type ImportCapability } from '../protocol/resource-payloads.js';
import { isSensitivePathSegment } from '../protocol/resource-payload-validation.js';
import { registeredProjectionAdapters } from '../adapters/registry.js';
import { RESOURCE_KINDS, type ResourceKind, type ResourceRootMap } from '../manifests/types.js';
import { MAX_RESOURCE_RECORDS } from './schema.js';
import type { RegistryCompatibility, ResourceRecord } from './types.js';

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const SCRIPT_SUFFIX = /\.(?:bash|cjs|fish|js|mjs|pl|py|ps1|rb|sh|zsh)$/iu;
function unsafe(): never { throw new ControlPlaneError('PATH_UNSAFE'); }
function comparePaths(left: string, right: string): number { return compareCanonicalPaths(left, right); }
function entries(path: string): Dirent[] {
  try { return readdirSync(path, { withFileTypes: true }).sort((left, right) => comparePaths(left.name, right.name)); }
  catch { return unsafe(); }
}
function checkEntry(path: string): Stats {
  let stat: Stats;
  try { stat = lstatSync(path); } catch { return unsafe(); }
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) return unsafe();
  return stat;
}
function optionalFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return unsafe();
    return stat.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    return unsafe();
  }
}
function shebang(path: string): boolean {
  const descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  try {
    const bytes = Buffer.alloc(2);
    return readSync(descriptor, bytes, 0, 2, 0) === 2 && bytes[0] === 0x23 && bytes[1] === 0x21;
  } finally { closeSync(descriptor); }
}
function capabilities(kind: ResourceKind, path: string): readonly string[] {
  const result = new Set<ImportCapability>();
  if (kind === 'hook') result.add('hook-execution');
  const visit = (current: string): void => {
    const stat = checkEntry(current);
    if (stat.isDirectory()) {
      for (const entry of entries(current)) {
        if (isSensitivePathSegment(entry.name)) continue;
        visit(join(current, entry.name));
      }
      return;
    }
    if ((Number(stat.mode) & 0o111) !== 0 || SCRIPT_SUFFIX.test(current) || shebang(current)) result.add('script-execution');
  };
  visit(path);
  return Object.freeze(IMPORT_CAPABILITIES.filter((value) => result.has(value)));
}
function compatibility(kind: ResourceKind): RegistryCompatibility {
  const adapters = registeredProjectionAdapters();
  if (adapters.size !== PERSISTED_TARGETS.length) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  const result: Record<string, { status: 'native' | 'needsAdapter' | 'unsupported'; reason?: string }> = {};
  for (const target of PERSISTED_TARGETS) {
    const entry = adapters.get(target)?.compatibility[kind];
    if (!entry) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
    result[target] = entry.reason === undefined ? { status: entry.status } : { status: entry.status, reason: entry.reason };
  }
  return Object.freeze(result) as RegistryCompatibility;
}
function resourceDescriptor(kind: ResourceKind, sourcePath: string, absolutePath: string): { kind: ResourceKind; sourcePath: string; absolutePath: string; directory: boolean } {
  const stat = checkEntry(absolutePath);
  if (kind === 'skill' && (!stat.isDirectory() || !optionalFile(join(absolutePath, 'SKILL.md')))) return unsafe();
  if ((kind === 'agent' || kind === 'workflow' || kind === 'command') && (!stat.isFile() || !sourcePath.endsWith('.md'))) return unsafe();
  if (kind === 'hook' && !stat.isFile() && !stat.isDirectory()) return unsafe();
  return { kind, sourcePath, absolutePath, directory: stat.isDirectory() };
}
function collectFiles(kind: ResourceKind, root: string, base: string): Array<{ kind: ResourceKind; sourcePath: string; absolutePath: string; directory: boolean }> {
  const found: Array<{ kind: ResourceKind; sourcePath: string; absolutePath: string; directory: boolean }> = [];
  const walkCommands = (current: string): void => {
    for (const entry of entries(current)) {
      if (isSensitivePathSegment(entry.name)) continue;
      const path = join(current, entry.name);
      const stat = checkEntry(path);
      if (stat.isDirectory()) walkCommands(path);
      else if (entry.name.endsWith('.md')) found.push(resourceDescriptor(kind, relative(base, path).split('\\').join('/'), path));
    }
  };
  for (const entry of entries(root)) {
    if (isSensitivePathSegment(entry.name)) continue;
    const path = join(root, entry.name);
    const stat = checkEntry(path);
    if (kind === 'skill') {
      if (stat.isDirectory() && optionalFile(join(path, 'SKILL.md'))) {
        found.push(resourceDescriptor(kind, relative(base, path).split('\\').join('/'), path));
      }
      continue;
    }
    if (kind === 'agent' || kind === 'workflow') {
      if (stat.isFile() && entry.name.endsWith('.md')) found.push(resourceDescriptor(kind, relative(base, path).split('\\').join('/'), path));
      continue;
    }
    if (kind === 'command') {
      if (stat.isDirectory()) walkCommands(path);
      else if (entry.name.endsWith('.md')) found.push(resourceDescriptor(kind, relative(base, path).split('\\').join('/'), path));
      continue;
    }
    found.push(resourceDescriptor(kind, relative(base, path).split('\\').join('/'), path));
  }
  return found;
}
function recordFor(descriptor: ReturnType<typeof resourceDescriptor>, previous: ResourceRecord | undefined): ResourceRecord {
  const contentHash = descriptor.directory ? completeTreeHash(descriptor.absolutePath) : hashFileWithMode(descriptor.absolutePath);
  const revision = previous && previous.content_hash === contentHash ? previous.revision : (previous?.revision ?? 0) + 1;
  return Object.freeze({
    id: `${descriptor.kind}:${descriptor.sourcePath}`, kind: descriptor.kind, source_path: descriptor.sourcePath,
    content_hash: contentHash, origin: previous?.origin ?? 'canonical', compatibility: compatibility(descriptor.kind),
    capabilities: capabilities(descriptor.kind, descriptor.absolutePath),
    ...(previous?.model_metadata === undefined ? {} : { model_metadata: previous.model_metadata }), revision
  });
}
export function scanCanonicalResources(canonicalRoot: string, resourceRoots: ResourceRootMap, previous: readonly ResourceRecord[] = []): readonly ResourceRecord[] {
  assertOwnerControlledDirectory(canonicalRoot);
  completeTreeHash(canonicalRoot);
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const found: Array<{ kind: ResourceKind; sourcePath: string; absolutePath: string; directory: boolean }> = [];
  for (const kind of RESOURCE_KINDS) {
    const root = normalizeRelativePath(resourceRoots[kind]);
    const absoluteRoot = containedPath(canonicalRoot, root, true);
    assertOwnerControlledDirectory(absoluteRoot);
    found.push(...collectFiles(kind, absoluteRoot, canonicalRoot));
    if (found.length > MAX_RESOURCE_RECORDS) throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const seen = new Set<string>();
  const records = found.map((descriptor) => {
    if (!normalizeRelativePath(descriptor.sourcePath) || seen.has(descriptor.sourcePath)) unsafe();
    seen.add(descriptor.sourcePath);
    return recordFor(descriptor, previousById.get(`${descriptor.kind}:${descriptor.sourcePath}`));
  });
  records.sort((left, right) => comparePaths(left.id, right.id));
  return Object.freeze(records);
}
