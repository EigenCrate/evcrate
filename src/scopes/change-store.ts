import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJson, isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { assertExactKeys, assertSafeBoundedJson } from '../protocol/validation.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, writeAtomicFile } from '../filesystem/atomic.js';
import { assertOwnerOnlyFile, containedPath } from '../filesystem/paths.js';
import { validateScopeMutationPayload, validateScopeResultPayload, type ChangesPreviewResultPayload, type ScopeMutationPayload } from '../protocol/scope-payloads.js';
import { validateToken } from '../protocol/resource-payload-validation.js';
import { validateProjectIdentity } from './identity.js';

const MAX_TOKEN_BYTES = 256 * 1024;
const TOKEN_KEYS = Object.freeze(['schema_version', 'operation', 'token', 'project_id', 'mutation_payload', 'result'] as const);
export interface ScopeChangeTokenRecord {
  readonly schema_version: 1;
  readonly operation: 'changes.preview';
  readonly token: string;
  readonly projectId: string | null;
  readonly mutationPayload: ScopeMutationPayload;
  readonly result: ChangesPreviewResultPayload;
}
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function tokenPath(stateRoot: string, token: string): string {
  return containedPath(stateRoot, join('scope-changes', `${validateToken(token)}.json`));
}
function jsonRecord(record: ScopeChangeTokenRecord): Record<string, unknown> {
  return {
    schema_version: 1, operation: 'changes.preview', token: record.token,
    project_id: record.projectId, mutation_payload: record.mutationPayload, result: record.result
  };
}
function parseRecord(value: unknown): ScopeChangeTokenRecord {
  if (!isPlainObject(value)) return conflict();
  const raw = value as Record<string, unknown>;
  assertExactKeys(raw, TOKEN_KEYS);
  if (raw.schema_version !== 1 || raw.operation !== 'changes.preview') return conflict();
  const token = validateToken(raw.token);
  const result = validateScopeResultPayload('changes.preview', raw.result) as unknown as ChangesPreviewResultPayload;
  if (result.token !== token) return conflict();
  const projectId = raw.project_id === null ? null : validateProjectIdentity(raw.project_id);
  const mutationPayload = validateScopeMutationPayload(result.mutation, raw.mutation_payload);
  if (canonicalJson(mutationPayload.expectedRevision) !== canonicalJson(result.expectedRevision)
    || canonicalJson(result.revisionVector) !== canonicalJson(result.expectedRevision)
    || result.before?.resourceId !== mutationPayload.resourceId
    || result.after?.resourceId !== mutationPayload.resourceId) return conflict();
  assertSafeBoundedJson(jsonRecord({ schema_version: 1, operation: 'changes.preview', token, projectId, mutationPayload, result }), MAX_TOKEN_BYTES);
  return Object.freeze({ schema_version: 1, operation: 'changes.preview', token, projectId, mutationPayload, result });
}
export function saveScopeChangePreview(stateRoot: string, record: ScopeChangeTokenRecord): void {
  const normalized = parseRecord(jsonRecord(record));
  writeAtomicFile(tokenPath(stateRoot, normalized.token), canonicalJsonBytes(jsonRecord(normalized)), 0o600);
}
export function loadScopeChangePreview(stateRoot: string, token: string): ScopeChangeTokenRecord {
  const path = tokenPath(stateRoot, token);
  try {
    const initial = assertOwnerOnlyFile(path);
    const record = parseRecord(parseJsonDocument(readBoundedFile(path, MAX_TOKEN_BYTES), MAX_TOKEN_BYTES));
    const final = assertOwnerOnlyFile(path);
    if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
      || Number(initial.size) !== Number(final.size) || record.token !== token) return conflict();
    return record;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function consumeScopeChangePreview(stateRoot: string, token: string): void {
  try { assertOwnerOnlyFile(tokenPath(stateRoot, token)); removePath(tokenPath(stateRoot, token)); }
  catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function scopeChangeExpired(record: ScopeChangeTokenRecord, now = Date.now()): boolean {
  if (!Number.isSafeInteger(now)) throw new ControlPlaneError('VALIDATION_INVALID');
  return now >= record.result.expiresAt;
}
