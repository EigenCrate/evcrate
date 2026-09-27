import { createHash } from 'node:crypto';
import {
  ControlPlaneError, serializeControlPlaneError, validateSerializedControlPlaneError
} from '../errors/control-plane-error.js';
import type { SerializedControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalBytes, canonicalJson, isPlainObject, JsonValue, MAX_JSON_BYTES } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText, rejectCredentialKeys, rejectCounselFields,
  safePath, validateOpaque, validateRequestId, SETTINGS_PROTOCOL, PROTOCOL_VERSION, utf8Length
} from './validation.js';

import {
  ADVISOR_BACKENDS,
  type AdvisorBackend,
  type AdvisorRouteTarget,
  type AdvisorWaitPolicy,
  type AdvisorHistoryPolicy,
  type AdvisorPolicyV2,
  type AdvisorPolicyTargetV1,
  type AdvisorPolicyV1,
  validateRouteTarget as runtimeValidateRouteTarget,
  validateWaitPolicy as runtimeValidateWaitPolicy,
  validateHistoryPolicy as runtimeValidateHistoryPolicy,
  validatePolicyV2 as runtimeValidatePolicyV2
} from './advisor-contract-runtime.js';

export {
  ADVISOR_BACKENDS,
  type AdvisorBackend,
  type AdvisorRouteTarget,
  type AdvisorWaitPolicy,
  type AdvisorHistoryPolicy,
  type AdvisorPolicyV2,
  type AdvisorPolicyTargetV1,
  type AdvisorPolicyV1
};
export type AdvisorOperation = 'get' | 'preview' | 'apply';

export type AdvisorPolicyTarget = AdvisorPolicyTargetV1;
export type AdvisorPolicy = AdvisorPolicyV2;

export interface LegacyAdvisorPolicyView {
  readonly version: 1;
  readonly advisor: AdvisorPolicyTargetV1;
  readonly migration_required: true;
}

export type SafeAdvisorPolicyView = AdvisorPolicyV2 | LegacyAdvisorPolicyView;

export interface SettingsRevision { kind: 'present' | 'absent'; identity: string; }
export interface SettingsRecovery { kind: 'none' | 'required'; identity: string; }

const POLICY_KEYS_V2 = Object.freeze(['version', 'advisor', 'wait', 'history'] as const);
const ADVISOR_KEYS_V2 = Object.freeze(['primary', 'backup'] as const);
const ROUTE_KEYS_V2 = Object.freeze(['backend', 'model', 'effort'] as const);
const WAIT_KEYS_V2 = Object.freeze(['mode', 'warn_after_ms', 'warn_every_ms'] as const);
const HISTORY_KEYS_V2 = Object.freeze(['retention_days', 'max_bytes'] as const);

const POLICY_KEYS_V1 = Object.freeze(['version', 'advisor'] as const);
const TARGET_KEYS_V1 = Object.freeze(['backend', 'model', 'effort', 'timeout_ms'] as const);

const POLICY_KEYS = POLICY_KEYS_V2;
const TARGET_KEYS = TARGET_KEYS_V1;
const REVISION_KEYS = Object.freeze(['kind', 'identity'] as const);
const RECOVERY_KEYS = Object.freeze(['kind', 'identity'] as const);
const REQUEST_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'payload'] as const);
const RESULT_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'status'] as const);
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 900_000;
const MAX_PREVIEW_LIFETIME_MS = 900_000;
const MAX_POLICY_BYTES = 16 * 1024;

const MIN_WARN_MS = 1_000;
const MAX_WARN_MS = 3_600_000;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const MIN_HISTORY_BYTES = 1_048_576;
const MAX_HISTORY_BYTES = 1_073_741_824;
function assertSettingsDocumentSize(value: unknown): void {
  try {
    if (canonicalBytes(value).byteLength > MAX_JSON_BYTES) throw new ControlPlaneError('PROTOCOL_INVALID');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

export function validateAdvisorRouteTarget(value: unknown): AdvisorRouteTarget {
  try {
    return runtimeValidateRouteTarget(value);
  } catch {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
}

export function validateAdvisorWaitPolicy(value: unknown): AdvisorWaitPolicy {
  try {
    return runtimeValidateWaitPolicy(value);
  } catch {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
}

export function validateAdvisorHistoryPolicy(value: unknown): AdvisorHistoryPolicy {
  try {
    return runtimeValidateHistoryPolicy(value);
  } catch {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
}

export function validateLegacyAdvisorPolicy(value: unknown): AdvisorPolicyV1 {
  assertExactKeys(value, POLICY_KEYS_V1, 'SETTINGS_INVALID');
  const policy = value as Record<string, unknown>;
  if (policy.version !== 1) throw new ControlPlaneError('SETTINGS_INVALID');
  assertExactKeys(policy.advisor, TARGET_KEYS_V1, 'SETTINGS_INVALID');
  const target = policy.advisor as Record<string, unknown>;
  if (typeof target.backend !== 'string' || !ADVISOR_BACKENDS.includes(target.backend as AdvisorBackend)) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  const model = boundedText(target.model, 256, 'model', 'SETTINGS_INVALID');
  const effort = boundedText(target.effort, 64, 'effort', 'SETTINGS_INVALID');
  if (!Number.isInteger(target.timeout_ms) || (target.timeout_ms as number) < MIN_TIMEOUT_MS
    || (target.timeout_ms as number) > MAX_TIMEOUT_MS) throw new ControlPlaneError('SETTINGS_INVALID');
  rejectCredentialKeys(policy, 'SETTINGS_INVALID');
  rejectCounselFields(policy, ['backend'], 'SETTINGS_INVALID');
  const result: AdvisorPolicyV1 = Object.freeze({
    version: 1 as const,
    advisor: Object.freeze({
      backend: target.backend as AdvisorBackend,
      model,
      effort,
      timeout_ms: target.timeout_ms as number
    })
  });
  if (canonicalBytes(result).byteLength > MAX_POLICY_BYTES) throw new ControlPlaneError('SETTINGS_INVALID');
  return result;
}

export function validateAdvisorPolicy(value: unknown): AdvisorPolicyV2 {
  try {
    const result = runtimeValidatePolicyV2(value);
    rejectCredentialKeys(value, 'SETTINGS_INVALID');
    rejectCounselFields(value, ['backend'], 'SETTINGS_INVALID');
    if (canonicalBytes(result).byteLength > MAX_POLICY_BYTES) throw new ControlPlaneError('SETTINGS_INVALID');
    return result;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
}

export function safeAdvisorPolicyView(value: unknown): SafeAdvisorPolicyView {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const raw = value as Record<string, unknown>;
    if (raw.version === 2) {
      const policy = validateAdvisorPolicy(value);
      return Object.freeze({
        version: 2 as const,
        advisor: Object.freeze({
          primary: Object.freeze({ ...policy.advisor.primary }),
          backup: Object.freeze({ ...policy.advisor.backup })
        }),
        wait: Object.freeze({ ...policy.wait }),
        history: Object.freeze({ ...policy.history })
      });
    }
    if (raw.version === 1) {
      if (Object.hasOwn(raw, 'hosts')) throw new ControlPlaneError('SETTINGS_INVALID');
      const allowedKeys = Object.hasOwn(raw, 'migration_required')
        ? ['version', 'advisor', 'migration_required']
        : ['version', 'advisor'];
      assertExactKeys(raw, allowedKeys, 'SETTINGS_INVALID');
      if (Object.hasOwn(raw, 'migration_required') && raw.migration_required !== true) {
        throw new ControlPlaneError('SETTINGS_INVALID');
      }
      const legacy = validateLegacyAdvisorPolicy({ version: 1, advisor: raw.advisor });
      return Object.freeze({
        version: 1 as const,
        advisor: Object.freeze({ ...legacy.advisor }),
        migration_required: true as const
      });
    }
  }
  throw new ControlPlaneError('SETTINGS_INVALID');
}

export function proposeAdvisorPolicyMigration(
  legacy: AdvisorPolicyV1,
  backup: AdvisorRouteTarget
): AdvisorPolicyV2 {
  const validatedLegacy = validateLegacyAdvisorPolicy(legacy);
  const validatedBackup = validateAdvisorRouteTarget(backup);
  const primary: AdvisorRouteTarget = {
    backend: validatedLegacy.advisor.backend,
    model: validatedLegacy.advisor.model,
    effort: validatedLegacy.advisor.effort
  };
  if (primary.backend === validatedBackup.backend && primary.model === validatedBackup.model && primary.effort === validatedBackup.effort) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  return validateAdvisorPolicy({
    version: 2,
    advisor: { primary, backup: validatedBackup },
    wait: {
      mode: 'until_terminal',
      warn_after_ms: 120_000,
      warn_every_ms: 300_000
    },
    history: {
      retention_days: 30,
      max_bytes: 104_857_600
    }
  });
}

export function canonicalAdvisorPolicy(value: unknown): { policy: AdvisorPolicy; bytes: Uint8Array; json: string } {
  const policy = validateAdvisorPolicy(value);
  return { policy, bytes: canonicalBytes(policy), json: canonicalJson(policy) };
}
export function canonicalAdvisorPolicyDigest(value: unknown): string {
  return createHash('sha256').update(canonicalAdvisorPolicy(value).bytes).digest('hex');
}

export function validateSettingsRevision(value: unknown): SettingsRevision {
  assertExactKeys(value, REVISION_KEYS, 'SETTINGS_INVALID');
  const revision = value as Record<string, unknown>;
  if (revision.kind !== 'present' && revision.kind !== 'absent') throw new ControlPlaneError('SETTINGS_INVALID');
  const identity = validateOpaque(revision.identity, 256, 'revision identity');
  if ((revision.kind === 'absent' && identity !== 'absent')
    || (revision.kind === 'present' && identity === 'absent')) throw new ControlPlaneError('SETTINGS_INVALID');
  return { kind: revision.kind, identity };
}


export interface AdvisorSettingsRequest {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string;
  operation: AdvisorOperation; payload: JsonValue;
}

export function validateAdvisorSettingsRequest(value: unknown): AdvisorSettingsRequest {
  assertExactKeys(value, REQUEST_KEYS, 'PROTOCOL_INVALID');
  const request = value as Record<string, unknown>;
  if (request.protocol !== SETTINGS_PROTOCOL || request.protocolVersion !== PROTOCOL_VERSION
    || !['get', 'preview', 'apply'].includes(request.operation as string)) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  assertSettingsDocumentSize(value);
  assertSafeBoundedJson(request.payload);
  rejectCredentialKeys(request.payload, 'SETTINGS_INVALID', request.operation === 'apply' ? ['token'] : []);
  rejectCounselFields(request.payload, ['backend'], 'SETTINGS_INVALID');
  const payload = request.payload as Record<string, unknown>;
  if (!isPlainObject(payload)) throw new ControlPlaneError('SETTINGS_INVALID');
  if (request.operation === 'get') assertExactKeys(payload, [], 'SETTINGS_INVALID');
  if (request.operation === 'preview') {
    assertExactKeys(payload, ['policy', 'currentRevision', 'destination'], 'SETTINGS_INVALID');
    validateAdvisorPolicy(payload.policy);
    validateSettingsRevision(payload.currentRevision);
    safePath(payload.destination, 4096);
  }
  if (request.operation === 'apply') {
    assertExactKeys(payload, ['token', 'currentRevision'], 'SETTINGS_INVALID');
    validateOpaque(payload.token, 512, 'preview token');
    validateSettingsRevision(payload.currentRevision);
  }
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1,
    requestId: validateRequestId(request.requestId),
    operation: request.operation as AdvisorOperation, payload: request.payload as JsonValue
  };
}

export function createAdvisorSettingsRequest(
  requestId: string, operation: AdvisorOperation, payload: JsonValue = {}
): AdvisorSettingsRequest {
  return validateAdvisorSettingsRequest({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId, operation, payload
  });
}

export interface SettingsGetResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'get'; status: 'OK';
  policy: SafeAdvisorPolicyView | null; revision: SettingsRevision;
}
export interface SettingsPreviewResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'preview'; status: 'PREVIEW';
  token: string; issuedAt: number; expiresAt: number; currentRevision: SettingsRevision; intendedDigest: string; destination: string;
}
export interface SettingsApplyResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'apply'; status: 'APPLIED';
  revision: SettingsRevision; recovery: SettingsRecovery;
}
export interface SettingsConflictResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'apply'; status: 'CONFLICT';
  error: SerializedControlPlaneError; expectedRevision: SettingsRevision; actualRevision: SettingsRevision;
}
export interface SettingsErrorResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: AdvisorOperation; status: 'FAILED';
  error: SerializedControlPlaneError;
}
export interface SettingsRecoveryResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'apply'; status: 'RECOVERED';
  revision: SettingsRevision; recovery: SettingsRecovery;
}
export type AdvisorSettingsResult =
  | SettingsGetResult | SettingsPreviewResult | SettingsApplyResult | SettingsConflictResult
  | SettingsErrorResult | SettingsRecoveryResult;

function validateSettingsError(value: unknown): SerializedControlPlaneError {
  return validateSerializedControlPlaneError(value);
}

function validateSettingsRecovery(value: unknown): SettingsRecovery {
  assertExactKeys(value, RECOVERY_KEYS, 'PROTOCOL_INVALID');
  const recovery = value as Record<string, unknown>;
  if (recovery.kind !== 'none' && recovery.kind !== 'required') {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const identity = validateOpaque(recovery.identity, 256, 'recovery identity');
  if ((recovery.kind === 'none' && identity !== 'none')
    || (recovery.kind === 'required' && identity === 'none')) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return { kind: recovery.kind, identity };
}

function validateResultBase(value: unknown, operation: AdvisorOperation, status: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const result = value as Record<string, unknown>;
  if (result.protocol !== SETTINGS_PROTOCOL || result.protocolVersion !== PROTOCOL_VERSION
    || result.operation !== operation || result.status !== status) throw new ControlPlaneError('PROTOCOL_INVALID');
  return result;
}

export function validateSettingsGetResult(value: unknown): SettingsGetResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const result = value as Record<string, unknown>;
  assertExactKeys(result, [...RESULT_KEYS, 'policy', 'revision'], 'PROTOCOL_INVALID');
  validateResultBase(result, 'get', 'OK');
  const policy = result.policy === null ? null : safeAdvisorPolicyView(result.policy);
  const revision = validateSettingsRevision(result.revision);
  if ((policy === null) !== (revision.kind === 'absent')) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
    operation: 'get', status: 'OK', policy, revision
  };
}

export function validatePreviewMetadata(value: unknown): SettingsPreviewResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('SETTINGS_INVALID');
  const result = value as Record<string, unknown>;
  assertExactKeys(result, [...RESULT_KEYS, 'token', 'issuedAt', 'expiresAt', 'currentRevision', 'intendedDigest', 'destination'], 'PROTOCOL_INVALID');
  validateResultBase(result, 'preview', 'PREVIEW');
  if (!Number.isSafeInteger(result.issuedAt) || (result.issuedAt as number) < 0
    || !Number.isSafeInteger(result.expiresAt) || (result.expiresAt as number) <= (result.issuedAt as number)
    || (result.expiresAt as number) - (result.issuedAt as number) > MAX_PREVIEW_LIFETIME_MS
    || typeof result.intendedDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(result.intendedDigest)) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  const currentRevision = validateSettingsRevision(result.currentRevision);
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
    operation: 'preview', status: 'PREVIEW',
    token: validateOpaque(result.token, 512, 'preview token'),
    issuedAt: result.issuedAt as number,
    expiresAt: result.expiresAt as number,
    currentRevision,
    intendedDigest: result.intendedDigest,
    destination: safePath(result.destination, 4096)
  };
}

export function bindPreviewMetadata(
  request: AdvisorSettingsRequest, token: string, expiresAt: number, revision: SettingsRevision,
  intendedDigest: string, destination: string,
  issuedAt = expiresAt - MAX_PREVIEW_LIFETIME_MS
): SettingsPreviewResult {
  const normalizedRequest = validateAdvisorSettingsRequest(request);
  if (normalizedRequest.operation !== 'preview' || utf8Length(intendedDigest) !== 64
    || !/^[a-f0-9]{64}$/u.test(intendedDigest) || !isPlainObject(normalizedRequest.payload)) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  const payload = normalizedRequest.payload;
  const requestedRevision = validateSettingsRevision(payload.currentRevision);
  const requestedDestination = safePath(payload.destination, 4096);
  const normalizedRevision = validateSettingsRevision(revision);
  const normalizedDestination = safePath(destination, 4096);
  if (requestedRevision.kind !== normalizedRevision.kind
    || requestedRevision.identity !== normalizedRevision.identity
    || requestedDestination !== normalizedDestination
    || canonicalAdvisorPolicyDigest(payload.policy) !== intendedDigest) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  return validatePreviewMetadata({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'preview', status: 'PREVIEW', token, issuedAt, expiresAt,
    currentRevision: normalizedRevision, intendedDigest, destination: normalizedDestination
  });
}

export function validateSettingsApplyResult(value: unknown): SettingsApplyResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const result = value as Record<string, unknown>;
  assertExactKeys(result, [...RESULT_KEYS, 'revision', 'recovery'], 'PROTOCOL_INVALID');
  validateResultBase(result, 'apply', 'APPLIED');
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
    operation: 'apply', status: 'APPLIED', revision: validateSettingsRevision(result.revision),
    recovery: validateSettingsRecovery(result.recovery)
  };
}

export function validateAdvisorSettingsResult(value: unknown): AdvisorSettingsResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  const result = value as Record<string, unknown>;
  if (result.status === 'OK') return validateSettingsGetResult(result);
  if (result.status === 'PREVIEW') return validatePreviewMetadata(result);
  if (result.status === 'APPLIED') return validateSettingsApplyResult(result);
  if (result.status === 'RECOVERED') {
    assertExactKeys(result, [...RESULT_KEYS, 'revision', 'recovery'], 'PROTOCOL_INVALID');
    validateResultBase(result, 'apply', 'RECOVERED');
    return {
      protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
      operation: 'apply', status: 'RECOVERED', revision: validateSettingsRevision(result.revision),
      recovery: validateSettingsRecovery(result.recovery)
    };
  }
  if (result.status === 'CONFLICT') {
    assertExactKeys(result, [...RESULT_KEYS, 'error', 'expectedRevision', 'actualRevision'], 'PROTOCOL_INVALID');
    validateResultBase(result, 'apply', 'CONFLICT');
    return {
      protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
      operation: 'apply', status: 'CONFLICT', error: validateSettingsError(result.error),
      expectedRevision: validateSettingsRevision(result.expectedRevision),
      actualRevision: validateSettingsRevision(result.actualRevision)
    };
  }
  if (result.status === 'FAILED') {
    assertExactKeys(result, [...RESULT_KEYS, 'error'], 'PROTOCOL_INVALID');
    const base = result.operation;
    if (base !== 'get' && base !== 'preview' && base !== 'apply') throw new ControlPlaneError('PROTOCOL_INVALID');
    validateResultBase(result, base, 'FAILED');
    return {
      protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
      operation: base, status: 'FAILED', error: validateSettingsError(result.error)
    };
  }
  throw new ControlPlaneError('PROTOCOL_INVALID');
}

function assertSettingsResultSize(value: AdvisorSettingsResult): AdvisorSettingsResult {
  if (canonicalBytes(value).byteLength > MAX_JSON_BYTES) throw new ControlPlaneError('PROTOCOL_INVALID');
  return value;
}
function requireFactoryRequest(request: AdvisorSettingsRequest, operation: AdvisorOperation): AdvisorSettingsRequest {
  const normalized = validateAdvisorSettingsRequest(request);
  if (normalized.operation !== operation) throw new ControlPlaneError('SETTINGS_INVALID');
  return normalized;
}

export function createSettingsGetResult(
  request: AdvisorSettingsRequest, policy: SafeAdvisorPolicyView | null,
  revision: SettingsRevision
): SettingsGetResult {
  const normalizedRequest = requireFactoryRequest(request, 'get');
  return assertSettingsResultSize(validateSettingsGetResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'get', status: 'OK', policy, revision
  })) as SettingsGetResult;
}

export function createSettingsPreviewResult(
  request: AdvisorSettingsRequest, token: string, expiresAt: number, revision: SettingsRevision,
  intendedDigest: string, destination: string,
  issuedAt?: number
): SettingsPreviewResult {
  return assertSettingsResultSize(bindPreviewMetadata(
    request, token, expiresAt, revision, intendedDigest, destination, issuedAt
  )) as SettingsPreviewResult;
}

export function createSettingsApplyResult(
  request: AdvisorSettingsRequest, revision: SettingsRevision, recovery: SettingsRecovery
): SettingsApplyResult {
  const normalizedRequest = requireFactoryRequest(request, 'apply');
  return assertSettingsResultSize(validateSettingsApplyResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'apply', status: 'APPLIED', revision, recovery
  })) as SettingsApplyResult;
}

export function createSettingsConflictResult(
  request: AdvisorSettingsRequest, expectedRevision: SettingsRevision, actualRevision: SettingsRevision
): SettingsConflictResult {
  const normalizedRequest = requireFactoryRequest(request, 'apply');
  return assertSettingsResultSize(validateAdvisorSettingsResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'apply', status: 'CONFLICT',
    error: serializeControlPlaneError(new ControlPlaneError('CAS_CONFLICT')),
    expectedRevision, actualRevision
  })) as SettingsConflictResult;
}

export function createSettingsErrorResult(
  request: AdvisorSettingsRequest, error: unknown
): SettingsErrorResult {
  const normalizedRequest = validateAdvisorSettingsRequest(request);
  return assertSettingsResultSize(validateAdvisorSettingsResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: normalizedRequest.operation, status: 'FAILED', error: serializeControlPlaneError(error)
  })) as SettingsErrorResult;
}

export function createSettingsRecoveryResult(
  request: AdvisorSettingsRequest, revision: SettingsRevision, recovery: SettingsRecovery
): SettingsRecoveryResult {
  const normalizedRequest = requireFactoryRequest(request, 'apply');
  return assertSettingsResultSize(validateAdvisorSettingsResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'apply', status: 'RECOVERED', revision, recovery
  })) as SettingsRecoveryResult;
}

export const SETTINGS_POLICY_KEYS = POLICY_KEYS;
export const SETTINGS_TARGET_KEYS = TARGET_KEYS;
export const SETTINGS_POLICY_KEYS_V2 = POLICY_KEYS_V2;
export const SETTINGS_POLICY_KEYS_V1 = POLICY_KEYS_V1;
export const SETTINGS_ADVISOR_KEYS_V2 = ADVISOR_KEYS_V2;
export const SETTINGS_ROUTE_KEYS_V2 = ROUTE_KEYS_V2;
export const SETTINGS_WAIT_KEYS_V2 = WAIT_KEYS_V2;
export const SETTINGS_HISTORY_KEYS_V2 = HISTORY_KEYS_V2;
export const SETTINGS_MAX_PREVIEW_LIFETIME_MS = MAX_PREVIEW_LIFETIME_MS;
export const SETTINGS_MIN_TIMEOUT_MS = MIN_TIMEOUT_MS;
export const SETTINGS_MAX_TIMEOUT_MS = MAX_TIMEOUT_MS;
export const SETTINGS_MIN_WARN_MS = MIN_WARN_MS;
export const SETTINGS_MAX_WARN_MS = MAX_WARN_MS;
export const SETTINGS_MIN_RETENTION_DAYS = MIN_RETENTION_DAYS;
export const SETTINGS_MAX_RETENTION_DAYS = MAX_RETENTION_DAYS;
export const SETTINGS_MIN_HISTORY_BYTES = MIN_HISTORY_BYTES;
export const SETTINGS_MAX_HISTORY_BYTES = MAX_HISTORY_BYTES;
