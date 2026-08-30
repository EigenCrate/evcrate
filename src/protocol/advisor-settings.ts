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

export const ADVISOR_BACKENDS = Object.freeze(['claude', 'codex', 'antigravity', 'pi', 'omp'] as const);
export type AdvisorBackend = typeof ADVISOR_BACKENDS[number];
export type AdvisorOperation = 'get' | 'preview' | 'apply';

export interface AdvisorPolicyTarget { backend: AdvisorBackend; model: string; effort: string; timeout_ms: number; }
export interface AdvisorPolicy { version: 1; advisor: AdvisorPolicyTarget; }
export interface SafeAdvisorPolicyView { version: 1; advisor: AdvisorPolicyTarget; }
export interface SettingsRevision { kind: 'present' | 'absent'; identity: string; }
export interface SettingsMode { kind: 'existing' | 'create'; mode: number; }
export interface SettingsRecovery { kind: 'none' | 'required'; identity: string; }

const POLICY_KEYS = Object.freeze(['version', 'advisor'] as const);
const TARGET_KEYS = Object.freeze(['backend', 'model', 'effort', 'timeout_ms'] as const);
const REVISION_KEYS = Object.freeze(['kind', 'identity'] as const);
const MODE_KEYS = Object.freeze(['kind', 'mode'] as const);
const RECOVERY_KEYS = Object.freeze(['kind', 'identity'] as const);
const REQUEST_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'payload'] as const);
const RESULT_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'status'] as const);
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 900_000;
const MAX_PREVIEW_LIFETIME_MS = 900_000;
const MAX_POLICY_BYTES = 16 * 1024;

function assertSettingsDocumentSize(value: unknown): void {
  try {
    if (canonicalBytes(value).byteLength > MAX_JSON_BYTES) throw new ControlPlaneError('PROTOCOL_INVALID');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

export function validateAdvisorPolicy(value: unknown): AdvisorPolicy {
  assertExactKeys(value, POLICY_KEYS, 'SETTINGS_INVALID');
  const policy = value as Record<string, unknown>;
  if (policy.version !== 1) throw new ControlPlaneError('SETTINGS_INVALID');
  assertExactKeys(policy.advisor, TARGET_KEYS, 'SETTINGS_INVALID');
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
  const result: AdvisorPolicy = {
    version: 1,
    advisor: {
      backend: target.backend as AdvisorBackend, model, effort,
      timeout_ms: target.timeout_ms as number
    }
  };
  if (canonicalBytes(result).byteLength > MAX_POLICY_BYTES) throw new ControlPlaneError('SETTINGS_INVALID');
  return result;
}

export function safeAdvisorPolicyView(value: unknown): SafeAdvisorPolicyView {
  const policy = validateAdvisorPolicy(value);
  return { version: 1, advisor: { ...policy.advisor } };
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

export function validateSettingsMode(value: unknown): SettingsMode {
  assertExactKeys(value, MODE_KEYS, 'SETTINGS_INVALID');
  const mode = value as Record<string, unknown>;
  if ((mode.kind !== 'existing' && mode.kind !== 'create') || !Number.isInteger(mode.mode)
    || (mode.mode as number) < 0 || (mode.mode as number) > 0o777) throw new ControlPlaneError('SETTINGS_INVALID');
  if (mode.kind === 'create' && mode.mode !== 0o600) throw new ControlPlaneError('SETTINGS_INVALID');
  if (mode.kind === 'existing' && ((mode.mode as number) & 0o077) !== 0) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  return { kind: mode.kind, mode: mode.mode as number };
}
function assertSettingsModeRevision(revision: SettingsRevision, mode: SettingsMode): void {
  if ((revision.kind === 'absent') !== (mode.kind === 'create')) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
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
  rejectCredentialKeys(request.payload, 'SETTINGS_INVALID');
  rejectCounselFields(request.payload, ['backend'], 'SETTINGS_INVALID');
  const payload = request.payload as Record<string, unknown>;
  if (!isPlainObject(payload)) throw new ControlPlaneError('SETTINGS_INVALID');
  if (request.operation === 'get') assertExactKeys(payload, [], 'SETTINGS_INVALID');
  if (request.operation === 'preview') {
    assertExactKeys(payload, ['policy', 'currentRevision', 'destination', 'mode'], 'SETTINGS_INVALID');
    validateAdvisorPolicy(payload.policy);
    const revision = validateSettingsRevision(payload.currentRevision);
    safePath(payload.destination, 4096);
    const mode = validateSettingsMode(payload.mode);
    assertSettingsModeRevision(revision, mode);
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
  policy: SafeAdvisorPolicyView | null; revision: SettingsRevision; mode: SettingsMode | null;
}
export interface SettingsPreviewResult {
  protocol: typeof SETTINGS_PROTOCOL; protocolVersion: 1; requestId: string; operation: 'preview'; status: 'PREVIEW';
  token: string; issuedAt: number; expiresAt: number; currentRevision: SettingsRevision; intendedDigest: string; destination: string; mode: SettingsMode;
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
  assertExactKeys(result, [...RESULT_KEYS, 'policy', 'revision', 'mode'], 'PROTOCOL_INVALID');
  validateResultBase(result, 'get', 'OK');
  const policy = result.policy === null ? null : safeAdvisorPolicyView(result.policy);
  const revision = validateSettingsRevision(result.revision);
  const mode = result.mode === null ? null : validateSettingsMode(result.mode);
  if ((policy === null) !== (revision.kind === 'absent') || (policy === null) !== (mode === null)) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  if (revision.kind !== 'absent' && mode !== null) assertSettingsModeRevision(revision, mode);
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
    operation: 'get', status: 'OK', policy, revision, mode
  };
}

export function validatePreviewMetadata(value: unknown): SettingsPreviewResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('SETTINGS_INVALID');
  const result = value as Record<string, unknown>;
  assertExactKeys(result, [...RESULT_KEYS, 'token', 'issuedAt', 'expiresAt', 'currentRevision', 'intendedDigest', 'destination', 'mode'], 'PROTOCOL_INVALID');
  validateResultBase(result, 'preview', 'PREVIEW');
  if (!Number.isSafeInteger(result.issuedAt) || (result.issuedAt as number) < 0
    || !Number.isSafeInteger(result.expiresAt) || (result.expiresAt as number) <= (result.issuedAt as number)
    || (result.expiresAt as number) - (result.issuedAt as number) > MAX_PREVIEW_LIFETIME_MS
    || typeof result.intendedDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(result.intendedDigest)) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  const currentRevision = validateSettingsRevision(result.currentRevision);
  const mode = validateSettingsMode(result.mode);
  assertSettingsModeRevision(currentRevision, mode);
  return {
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: validateRequestId(result.requestId),
    operation: 'preview', status: 'PREVIEW',
    token: validateOpaque(result.token, 512, 'preview token'),
    issuedAt: result.issuedAt as number,
    expiresAt: result.expiresAt as number,
    currentRevision,
    intendedDigest: result.intendedDigest,
    destination: safePath(result.destination, 4096),
    mode
  };
}

export function bindPreviewMetadata(
  request: AdvisorSettingsRequest, token: string, expiresAt: number, revision: SettingsRevision,
  intendedDigest: string, destination: string, mode: SettingsMode,
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
  const requestedMode = validateSettingsMode(payload.mode);
  const normalizedRevision = validateSettingsRevision(revision);
  const normalizedDestination = safePath(destination, 4096);
  const normalizedMode = validateSettingsMode(mode);
  if (requestedRevision.kind !== normalizedRevision.kind
    || requestedRevision.identity !== normalizedRevision.identity
    || requestedDestination !== normalizedDestination
    || requestedMode.kind !== normalizedMode.kind || requestedMode.mode !== normalizedMode.mode
    || canonicalAdvisorPolicyDigest(payload.policy) !== intendedDigest) {
    throw new ControlPlaneError('SETTINGS_INVALID');
  }
  return validatePreviewMetadata({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'preview', status: 'PREVIEW', token, issuedAt, expiresAt,
    currentRevision: normalizedRevision, intendedDigest, destination: normalizedDestination, mode: normalizedMode
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
  revision: SettingsRevision, mode: SettingsMode | null
): SettingsGetResult {
  const normalizedRequest = requireFactoryRequest(request, 'get');
  return assertSettingsResultSize(validateSettingsGetResult({
    protocol: SETTINGS_PROTOCOL, protocolVersion: 1, requestId: normalizedRequest.requestId,
    operation: 'get', status: 'OK', policy, revision, mode
  })) as SettingsGetResult;
}

export function createSettingsPreviewResult(
  request: AdvisorSettingsRequest, token: string, expiresAt: number, revision: SettingsRevision,
  intendedDigest: string, destination: string, mode: SettingsMode,
  issuedAt?: number
): SettingsPreviewResult {
  return assertSettingsResultSize(bindPreviewMetadata(
    request, token, expiresAt, revision, intendedDigest, destination, mode, issuedAt
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
export const SETTINGS_MAX_PREVIEW_LIFETIME_MS = MAX_PREVIEW_LIFETIME_MS;
export const SETTINGS_MIN_TIMEOUT_MS = MIN_TIMEOUT_MS;
export const SETTINGS_MAX_TIMEOUT_MS = MAX_TIMEOUT_MS;
