import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertExactKeys } from '../protocol/validation.js';
import { isPlainObject } from '../protocol/json.js';
import { validateResourceRecord } from '../protocol/resource-payload-validation.js';
import { MAX_RESOURCE_RECORDS } from './schema.js';
import type { RegistryDocument, ResourceRecord, RegistryCompatibilityEntry } from './types.js';

export const LEGACY_SCHEMA_1_TARGETS = Object.freeze([
  'claude', 'codex', 'gemini', 'antigravity', 'pi', 'omp', 'copilot'
] as const);

export const DEFAULT_VSCODE_COMPATIBILITY: RegistryCompatibilityEntry = Object.freeze({
  status: 'needsAdapter',
  reason: 'Local projection requires qualification'
});

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0) as number);
  const b = Array.from(right, (value) => value.codePointAt(0) as number);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

export function normalizeLegacyRecord(value: unknown): ResourceRecord {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const raw = value as Record<string, unknown>;

  // Schema 1 records must have compatibility with exactly the 7 legacy targets
  if (!isPlainObject(raw.compatibility)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const compatKeys = Object.keys(raw.compatibility);
  if (compatKeys.length !== LEGACY_SCHEMA_1_TARGETS.length
    || LEGACY_SCHEMA_1_TARGETS.some((target) => !Object.hasOwn(raw.compatibility as object, target))) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }

  // Schema 1 containing vscode must be rejected (partial or corrupted migration)
  if (Object.hasOwn(raw.compatibility, 'vscode')) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }

  // Create temporary record with vscode filled in so validateResourceRecord passes 8-target validation
  const augmentedCompat: Record<string, unknown> = {
    ...(raw.compatibility as Record<string, unknown>),
    vscode: DEFAULT_VSCODE_COMPATIBILITY
  };

  const augmentedRecord = {
    ...raw,
    compatibility: augmentedCompat
  };

  try {
    const validated = validateResourceRecord(augmentedRecord);
    const sortedCaps = validated.capabilities.every((val, idx) => idx === 0 || compareCodePoints(validated.capabilities[idx - 1], val) < 0);
    if (!sortedCaps) throw new ControlPlaneError('PROTOCOL_INVALID');
    return validated;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'PROTOCOL_INVALID') throw error;
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

export function readLegacyRegistryDocument(value: unknown): RegistryDocument {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const raw = value as Record<string, unknown>;

  try {
    assertExactKeys(raw, ['schema_version', 'revision', 'resources'], 'PROTOCOL_INVALID');
  } catch {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }

  if (raw.schema_version !== 1 || !Number.isSafeInteger(raw.revision)
    || (raw.revision as number) < 0 || !Array.isArray(raw.resources)
    || raw.resources.length > MAX_RESOURCE_RECORDS) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }

  const records = raw.resources.map(normalizeLegacyRecord);
  const ids = records.map((record) => record.id);
  const paths = records.map((record) => record.source_path);

  const sortedIds = ids.every((val, idx) => idx === 0 || compareCodePoints(ids[idx - 1], val) < 0);
  if (!sortedIds || new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }

  return Object.freeze({
    schema_version: 2,
    revision: raw.revision as number,
    resources: Object.freeze(records)
  });
}
