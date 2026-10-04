import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson } from '../protocol/json.js';
import { PERSISTED_TARGETS } from '../protocol/validation.js';
import { completeTreeHash, compareCanonicalPaths, hashBytes, hashFile, resourceFileHash } from '../filesystem/hashing.js';
import { containedPath, normalizeRelativePath } from '../filesystem/paths.js';
import { snapshot, type NodeSnapshot } from '../distribution/promotion-recovery.js';
import { scanCanonicalResources } from './scanner.js';
import { emptyRegistryDocument, readRegistryDocument, registryDocumentBytes, RESOURCE_REGISTRY_SCHEMA_VERSION, validateRegistryDocument } from './schema.js';
import type { ResourceKind, ResourceRootMap } from '../manifests/types.js';
import type { RegistryDocument, RegistryFileRevision, ResourceRecord, ResourceRegistry, ResourceQueryFilters } from './types.js';

function invalid(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'CAS_CONFLICT' | 'CAPABILITY_UNSUPPORTED' = 'PROTOCOL_INVALID'): never { throw new ControlPlaneError(code); }
function present(path: string): boolean {
  try { const stat = lstatSync(path); if (stat.isSymbolicLink() || !stat.isFile()) invalid('PATH_UNSAFE'); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; if (error instanceof ControlPlaneError) throw error; invalid('PATH_UNSAFE'); }
}
function identity(path: string): RegistryFileRevision {
  const value = snapshot(path, 'PATH_UNSAFE');
  if (!value.present) return { kind: 'absent', identity: 'absent' };
  return { kind: 'present', identity: `sha256:${value.digest}:${value.dev}:${value.ino}:${value.size}` };
}
function regularFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) invalid('PATH_UNSAFE');
    return stat.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    return invalid('PATH_UNSAFE');
  }
}
function destination(record: ResourceRecord, canonicalRoot: string, roots: ResourceRootMap): string {
  const root = normalizeRelativePath(roots[record.kind]);
  const source = normalizeRelativePath(record.source_path);
  if (!source.startsWith(`${root}/`)) invalid('PATH_UNSAFE');
  const relativePath = source.slice(root.length + 1);
  if (!relativePath || (record.kind === 'skill' && relativePath.includes('/'))
    || ((record.kind === 'agent' || record.kind === 'workflow') && (relativePath.includes('/') || !relativePath.endsWith('.md')))
    || (record.kind === 'command' && !relativePath.endsWith('.md'))) invalid();
  const path = containedPath(canonicalRoot, source, true);
  const stat = lstatSync(path);
  if (record.kind === 'skill' && (!stat.isDirectory() || !regularFile(join(path, 'SKILL.md')))) invalid('PATH_UNSAFE');
  if ((record.kind === 'agent' || record.kind === 'workflow' || record.kind === 'command') && !stat.isFile()) invalid('PATH_UNSAFE');
  if (record.kind === 'hook' && !stat.isFile() && !stat.isDirectory()) invalid('PATH_UNSAFE');
  return path;
}
function verifyRecord(record: ResourceRecord, canonicalRoot: string, roots: ResourceRootMap): void {
  const path = destination(record, canonicalRoot, roots);
  const actual = lstatSync(path).isDirectory() ? completeTreeHash(path) : resourceFileHash(path);
  if (actual !== record.content_hash) invalid('CAS_CONFLICT');
}
function verifyRegistry(document: RegistryDocument, canonicalRoot: string, roots: ResourceRootMap): void {
  const expected = scanCanonicalResources(canonicalRoot, roots, document.resources);
  if (expected.length !== document.resources.length) invalid('CAS_CONFLICT');
  for (const record of document.resources) verifyRecord(record, canonicalRoot, roots);
  const byId = new Map(expected.map((record) => [record.id, record]));
  for (const record of document.resources) {
    const scanned = byId.get(record.id);
    if (!scanned || scanned.content_hash !== record.content_hash || JSON.stringify(scanned.compatibility) !== JSON.stringify(record.compatibility)
      || JSON.stringify(scanned.capabilities) !== JSON.stringify(record.capabilities)) invalid('CAS_CONFLICT');
  }
}
export function loadResourceRegistry(path: string, canonicalRoot: string, roots: ResourceRootMap): ResourceRegistry {
  const document = present(path) ? readRegistryDocument(path) : emptyRegistryDocument();
  if (document.resources.length) verifyRegistry(document, canonicalRoot, roots);
  else if (scanCanonicalResources(canonicalRoot, roots).length) invalid('CAS_CONFLICT');
  return Object.freeze({ path, document, fileRevision: identity(path) });
}
export function registryRevision(document: RegistryDocument): number { return document.revision; }
function matches(record: ResourceRecord, filters: ResourceQueryFilters): boolean {
  if (filters.kind !== undefined && record.kind !== filters.kind) return false;
  if (filters.status === undefined) return true;
  if (filters.target !== undefined) return record.compatibility[filters.target]?.status === filters.status;
  return PERSISTED_TARGETS.some((target) => record.compatibility[target]?.status === filters.status);
}
export function listResources(document: RegistryDocument, filters: ResourceQueryFilters = {}, cursor: string | null = null, limit = 50): { resources: readonly ResourceRecord[]; nextCursor: string | null } {
  const values = document.resources.filter((record) => matches(record, filters));
  const start = cursor === null ? 0 : values.findIndex((record) => compareCanonicalPaths(record.id, cursor) > 0);
  const selected = values.slice(start, start + limit);
  return { resources: Object.freeze(selected), nextCursor: start + selected.length < values.length ? selected.at(-1)?.id ?? null : null };
}
export function getResource(document: RegistryDocument, id: string): ResourceRecord {
  const value = document.resources.find((record) => record.id === id);
  if (!value) invalid('CAPABILITY_UNSUPPORTED');
  return value;
}
export function upsertResource(document: RegistryDocument, record: ResourceRecord): RegistryDocument {
  const index = document.resources.findIndex((value) => value.id === record.id);
  if (index >= 0 && canonicalJson(document.resources[index]) === canonicalJson(record)) return document;
  const resources = [...document.resources];
  if (index < 0) resources.push(record); else resources[index] = record;
  resources.sort((left, right) => compareCanonicalPaths(left.id, right.id));
  return validateRegistryDocument({ schema_version: RESOURCE_REGISTRY_SCHEMA_VERSION, revision: document.revision + 1, resources });
}
export function resourceDocumentBytes(document: RegistryDocument): Uint8Array { return registryDocumentBytes(document); }
export function resourceDocumentHash(document: RegistryDocument): string { return hashBytes(resourceDocumentBytes(document)); }
export function registrySnapshot(path: string): NodeSnapshot { return snapshot(path, 'PATH_UNSAFE'); }
export function allTargets(): readonly string[] { return Object.freeze([...PERSISTED_TARGETS]); }
