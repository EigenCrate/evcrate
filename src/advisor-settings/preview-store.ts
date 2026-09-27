import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import {
  assertExactKeys, assertSafeBoundedJson, safePath, validateOpaque
} from '../protocol/validation.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, writeAtomicFile } from '../filesystem/atomic.js';
import { assertRegularFile, containedPath } from '../filesystem/paths.js';
import {
  canonicalAdvisorPolicyDigest, validateAdvisorPolicy, validateSettingsRevision,
  type AdvisorPolicy, type SettingsRevision
} from '../protocol/advisor-settings.js';

const MAX_TOKEN_BYTES = 64 * 1024;
const TOKEN_KEYS = Object.freeze(['schema_version', 'operation', 'token', 'destination', 'policy', 'current_revision', 'expires_at', 'intended_digest'] as const);
export interface AdvisorSettingsPreviewToken {
  readonly schema_version: 1;
  readonly operation: 'advisor-settings.preview';
  readonly token: string;
  readonly destination: string;
  readonly policy: AdvisorPolicy;
  readonly currentRevision: SettingsRevision;
  readonly expiresAt: number;
  readonly intendedDigest: string;
}
function conflict(): never { throw new ControlPlaneError('CAS_CONFLICT'); }
function pathFor(stateRoot: string, token: string): string {
  return containedPath(stateRoot, `advisor-settings-previews/${validateOpaque(token, 512, 'preview token')}.json`);
}
function jsonRecord(record: AdvisorSettingsPreviewToken): Record<string, unknown> {
  return {
    schema_version: 1, operation: record.operation, token: record.token, destination: record.destination,
    policy: record.policy, current_revision: record.currentRevision,
    expires_at: record.expiresAt, intended_digest: record.intendedDigest
  };
}
function parseRecord(value: unknown): AdvisorSettingsPreviewToken {
  if (!isPlainObject(value)) return conflict();
  const raw = value as Record<string, unknown>;
  assertExactKeys(raw, TOKEN_KEYS);
  if (raw.schema_version !== 1 || raw.operation !== 'advisor-settings.preview') return conflict();
  const token = validateOpaque(raw.token, 512, 'preview token');
  const destination = safePath(raw.destination, 4096);
  const policy = validateAdvisorPolicy(raw.policy);
  const currentRevision = validateSettingsRevision(raw.current_revision);
  if (!Number.isSafeInteger(raw.expires_at) || (raw.expires_at as number) <= 0
    || typeof raw.intended_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.intended_digest)
    || raw.intended_digest !== canonicalAdvisorPolicyDigest(policy)) return conflict();
  const record = { schema_version: 1 as const, operation: 'advisor-settings.preview' as const, token, destination, policy, currentRevision, expiresAt: raw.expires_at as number, intendedDigest: raw.intended_digest };
  assertSafeBoundedJson(jsonRecord(record), MAX_TOKEN_BYTES);
  return Object.freeze(record);
}
export function saveAdvisorSettingsPreview(stateRoot: string, record: AdvisorSettingsPreviewToken): void {
  const normalized = parseRecord(jsonRecord(record));
  writeAtomicFile(pathFor(stateRoot, normalized.token), canonicalJsonBytes(jsonRecord(normalized)));
}
export function loadAdvisorSettingsPreview(stateRoot: string, token: string): AdvisorSettingsPreviewToken {
  const path = pathFor(stateRoot, token);
  try {
    const initial = assertRegularFile(path);
    const record = parseRecord(parseJsonDocument(readBoundedFile(path, MAX_TOKEN_BYTES), MAX_TOKEN_BYTES));
    const final = assertRegularFile(path);
    if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
      || Number(initial.size) !== Number(final.size) || record.token !== token) return conflict();
    return record;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
export function consumeAdvisorSettingsPreview(stateRoot: string, token: string): void {
  try { assertRegularFile(pathFor(stateRoot, token)); removePath(pathFor(stateRoot, token)); }
  catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'CAS_CONFLICT') throw error;
    conflict();
  }
}
