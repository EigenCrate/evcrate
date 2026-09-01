import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertExactKeys } from '../protocol/validation.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';
import { PERSISTED_TARGETS } from '../protocol/validation.js';
import { validateResourceRecord } from '../protocol/resource-payload-validation.js';
import type { RegistryDocument, ResourceRecord } from './types.js';

export const RESOURCE_REGISTRY_SCHEMA_VERSION = 1;
export const MAX_RESOURCE_REGISTRY_BYTES = 4 * 1024 * 1024;
export const MAX_RESOURCE_RECORDS = 10_000;

function invalid(): never { throw new ControlPlaneError('PROTOCOL_INVALID'); }
function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0) as number);
  const b = Array.from(right, (value) => value.codePointAt(0) as number);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
function sortedStrings(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareCodePoints(values[index - 1], value) < 0);
}
function normalizeRecord(value: unknown): ResourceRecord {
  try {
    const record = validateResourceRecord(value);
    if (!sortedStrings(record.capabilities)) invalid();
    if (Object.keys(record.compatibility).length !== PERSISTED_TARGETS.length
      || PERSISTED_TARGETS.some((target) => !Object.hasOwn(record.compatibility, target))) invalid();
    return record;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'PROTOCOL_INVALID') throw error;
    invalid();
  }
}
export function validateRegistryDocument(value: unknown): RegistryDocument {
  if (!isPlainObject(value)) invalid();
  const raw = value as Record<string, unknown>;
  try { assertExactKeys(raw, ['schema_version', 'revision', 'resources'], 'PROTOCOL_INVALID'); } catch { invalid(); }
  if (raw.schema_version !== RESOURCE_REGISTRY_SCHEMA_VERSION || !Number.isSafeInteger(raw.revision)
    || (raw.revision as number) < 0 || !Array.isArray(raw.resources) || raw.resources.length > MAX_RESOURCE_RECORDS) invalid();
  const records = raw.resources.map(normalizeRecord);
  const ids = records.map((record) => record.id);
  const paths = records.map((record) => record.source_path);
  if (!sortedStrings(ids) || new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) invalid();
  return Object.freeze({ schema_version: 1, revision: raw.revision as number, resources: Object.freeze(records) });
}
export function emptyRegistryDocument(): RegistryDocument {
  return Object.freeze({ schema_version: 1, revision: 0, resources: Object.freeze([]) });
}
export function readRegistryDocument(path: string): RegistryDocument {
  try {
    assertNoSymlinkAncestors(path);
    return validateRegistryDocument(parseJsonDocument(readBoundedFile(path, MAX_RESOURCE_REGISTRY_BYTES), MAX_RESOURCE_REGISTRY_BYTES));
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'PROTOCOL_INVALID') throw error;
    if (error instanceof ControlPlaneError) throw error;
    invalid();
  }
}
export function registryDocumentBytes(document: RegistryDocument): Uint8Array {
  return canonicalJsonBytes(validateRegistryDocument(document));
}
