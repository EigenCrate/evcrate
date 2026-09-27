import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject } from '../protocol/json.js';
import { normalizeTarget, PERSISTED_TARGETS, type PersistedTarget } from '../protocol/validation.js';
import { getProjectionAdapter } from './registry.js';
import type { TargetManifest } from '../manifests/types.js';
import type { ProjectionAdapter, ProjectionValidation } from './types.js';
export const QUALIFICATION_EVIDENCE_VERSION = 1 as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const DIAGNOSTIC_CODES = new Set([
  'missing', 'unexpected', 'kind-mismatch', 'bytes-mismatch', 'hash-mismatch', 'unsafe'
]);
const QUALIFIED_RECORDS = new WeakSet<object>();
export interface QualificationEvidence {
  readonly version: typeof QUALIFICATION_EVIDENCE_VERSION;
  readonly hash: string;
}
/** A receipt is tied to one validated schema-2 manifest and one parity snapshot. */
export interface QualificationRecord {
  readonly target: PersistedTarget;
  readonly manifest: TargetManifest;
  readonly evidence: QualificationEvidence;
  readonly validation: ProjectionValidation;
}
export interface QualificationInput {
  readonly adapter: ProjectionAdapter;
  readonly manifest: TargetManifest;
  readonly evidence: QualificationEvidence;
  readonly validation: ProjectionValidation;
  readonly currentEvidenceHash: string;
}
export type ProjectionEngine = 'typescript' | 'python-compatibility';
export type QualifiedRecordMap = ReadonlyMap<PersistedTarget, QualificationRecord>;
function fail(code: 'VALIDATION_INVALID' | 'CAPABILITY_UNSUPPORTED' | 'CAS_CONFLICT'): never {
  throw new ControlPlaneError(code);
}
function canonicalId(value: unknown, code: 'VALIDATION_INVALID' | 'CAPABILITY_UNSUPPORTED' = 'CAPABILITY_UNSUPPORTED'): PersistedTarget {
  let target: PersistedTarget;
  try {
    target = normalizeTarget(value);
  } catch {
    fail(code);
  }
  if (value !== target) fail('VALIDATION_INVALID');
  return target;
}
function evidence(value: unknown): QualificationEvidence {
  if (!isPlainObject(value) || Object.keys(value).some((key) => key !== 'version' && key !== 'hash')
    || value.version !== QUALIFICATION_EVIDENCE_VERSION || typeof value.hash !== 'string' || !SHA256.test(value.hash)) {
    fail('VALIDATION_INVALID');
  }
  return Object.freeze({ version: QUALIFICATION_EVIDENCE_VERSION, hash: value.hash });
}
function validProjection(value: unknown, target: PersistedTarget): ProjectionValidation {
  if (!isPlainObject(value) || value.target !== target || value.valid !== true || !Array.isArray(value.diagnostics)) {
    if (isPlainObject(value) && value.valid === false) fail('CAPABILITY_UNSUPPORTED');
    fail('VALIDATION_INVALID');
  }
  for (const diagnostic of value.diagnostics) {
    if (!isPlainObject(diagnostic) || typeof diagnostic.path !== 'string'
      || (diagnostic.kind !== 'file' && diagnostic.kind !== 'directory')
      || typeof diagnostic.code !== 'string' || !DIAGNOSTIC_CODES.has(diagnostic.code)) fail('VALIDATION_INVALID');
  }
  return Object.freeze({
    target,
    valid: true,
    diagnostics: Object.freeze(value.diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })))
  });
}
function adapterFor(value: unknown, target: PersistedTarget): ProjectionAdapter {
  if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.build !== 'function'
    || typeof value.validate !== 'function') fail('VALIDATION_INVALID');
  if (canonicalId(value.id) !== target) fail('VALIDATION_INVALID');
  let registered: ProjectionAdapter;
  try {
    registered = getProjectionAdapter(target);
  } catch {
    fail('CAPABILITY_UNSUPPORTED');
  }
  if (registered !== (value as unknown as ProjectionAdapter)) fail('CAPABILITY_UNSUPPORTED');
  return value as unknown as ProjectionAdapter;
}
function recordFrom(input: QualificationInput): QualificationRecord {
  if (!isPlainObject(input) || !isPlainObject(input.manifest)) fail('VALIDATION_INVALID');
  const target = canonicalId(input.manifest.id);
  adapterFor(input.adapter, target);
  if (input.manifest.name !== target) fail('VALIDATION_INVALID');
  const validatedEvidence = evidence(input.evidence);
  if (typeof input.currentEvidenceHash !== 'string' || !SHA256.test(input.currentEvidenceHash)) fail('VALIDATION_INVALID');
  if (input.currentEvidenceHash !== validatedEvidence.hash) fail('CAS_CONFLICT');
  const validation = validProjection(input.validation, target);
  const record = Object.freeze({ target, manifest: input.manifest, evidence: validatedEvidence, validation });
  QUALIFIED_RECORDS.add(record);
  return record;
}
export function qualifyProjectionAdapter(input: QualificationInput): QualificationRecord;
export function qualifyProjectionAdapter(
  adapter: ProjectionAdapter, manifest: TargetManifest, evidenceValue: QualificationEvidence,
  validation: ProjectionValidation, currentEvidenceHash: string
): QualificationRecord;
export function qualifyProjectionAdapter(
  manifest: TargetManifest, adapter: ProjectionAdapter, evidenceValue: QualificationEvidence,
  validation: ProjectionValidation, currentEvidenceHash: string
): QualificationRecord;
export function qualifyProjectionAdapter(
  first: QualificationInput | ProjectionAdapter | TargetManifest,
  second?: TargetManifest | ProjectionAdapter, evidenceValue?: QualificationEvidence,
  validation?: ProjectionValidation, currentEvidenceHash = ''
): QualificationRecord {
  if (isPlainObject(first) && Object.hasOwn(first, 'adapter')) {
    return recordFrom(first as QualificationInput);
  }
  if (isPlainObject(second) && typeof second.build === 'function') {
    return recordFrom({ adapter: second as ProjectionAdapter, manifest: first as TargetManifest,
      evidence: evidenceValue as QualificationEvidence, validation: validation as ProjectionValidation, currentEvidenceHash });
  }
  return recordFrom({ adapter: first as ProjectionAdapter, manifest: second as TargetManifest,
    evidence: evidenceValue as QualificationEvidence, validation: validation as ProjectionValidation, currentEvidenceHash });
}
export const createQualificationRecord = qualifyProjectionAdapter;
class ReadOnlyQualifiedRecordMap implements ReadonlyMap<PersistedTarget, QualificationRecord> {
  readonly #records: ReadonlyMap<PersistedTarget, QualificationRecord>;
  constructor(records: ReadonlyMap<PersistedTarget, QualificationRecord>) {
    this.#records = records;
    Object.freeze(this);
  }
  get size(): number { return this.#records.size; }
  get(target: PersistedTarget): QualificationRecord | undefined { return this.#records.get(target); }
  has(target: PersistedTarget): boolean { return this.#records.has(target); }
  entries(): IterableIterator<[PersistedTarget, QualificationRecord]> { return this.#records.entries(); }
  keys(): IterableIterator<PersistedTarget> { return this.#records.keys(); }
  values(): IterableIterator<QualificationRecord> { return this.#records.values(); }
  [Symbol.iterator](): IterableIterator<[PersistedTarget, QualificationRecord]> { return this.entries(); }
  forEach(callbackfn: (value: QualificationRecord, key: PersistedTarget, map: ReadonlyMap<PersistedTarget, QualificationRecord>) => void, thisArg?: unknown): void {
    this.#records.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
}
export function createQualifiedRecordMap(records: readonly QualificationRecord[]): QualifiedRecordMap;
export function createQualifiedRecordMap(records: ReadonlyMap<PersistedTarget, QualificationRecord>): QualifiedRecordMap;
export function createQualifiedRecordMap(
  records: readonly QualificationRecord[] | ReadonlyMap<PersistedTarget, QualificationRecord>
): QualifiedRecordMap {
  const values = new Map<PersistedTarget, QualificationRecord>();
  let entries: Iterable<QualificationRecord>;
  if (Array.isArray(records)) {
    entries = records;
  } else if (records && typeof records.entries === 'function') {
    entries = [...records.values()];
  } else {
    fail('VALIDATION_INVALID');
  }
  for (const record of entries) {
    assertRecord(record);
    if (values.has(record.target)) fail('VALIDATION_INVALID');
    values.set(record.target, record);
  }
  return new ReadOnlyQualifiedRecordMap(values);
}

function assertRecord(value: unknown): asserts value is QualificationRecord {
  if (!isPlainObject(value) || !QUALIFIED_RECORDS.has(value)) fail('VALIDATION_INVALID');
  const target = canonicalId(value.target);
  if (!isPlainObject(value.manifest) || canonicalId(value.manifest.id) !== target || value.manifest.name !== target) fail('VALIDATION_INVALID');
  evidence(value.evidence);
  validProjection(value.validation, target);
}
export function selectProjectionEngine(
  requested: readonly string[], qualified: QualifiedRecordMap
): ProjectionEngine {
  if (!Array.isArray(requested) || requested.length === 0 || !qualified || typeof qualified.entries !== 'function') fail('VALIDATION_INVALID');
  const targets = requested.map((value) => normalizeTarget(value));
  if (new Set(targets).size !== targets.length) fail('VALIDATION_INVALID');
  const records = new Map<PersistedTarget, QualificationRecord>();
  try {
    for (const [key, record] of qualified.entries()) {
      if (!PERSISTED_TARGETS.includes(key) || records.has(key) || record.target !== key) fail('VALIDATION_INVALID');
      assertRecord(record);
      records.set(key, record);
    }
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('VALIDATION_INVALID');
  }
  const qualifiedCount = targets.reduce((count, target) => count + (records.has(target) ? 1 : 0), 0);
  if (qualifiedCount === targets.length) return 'typescript';
  if (qualifiedCount === 0) return 'python-compatibility';
  fail('CAS_CONFLICT');
}
export const createQualificationMap = createQualifiedRecordMap;
export const selectEngine = selectProjectionEngine;
