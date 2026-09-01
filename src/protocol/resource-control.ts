import { ControlPlaneError, serializeControlPlaneError, validateSerializedControlPlaneError } from '../errors/control-plane-error.js';
import type { SerializedControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalBytes, isPlainObject, JsonValue, MAX_JSON_BYTES } from './json.js';
import {
  assertExactKeys, assertSafeBoundedJson, boundedText, normalizeTarget, rejectCredentialKeys,
  rejectCounselFields, safePath, validateOpaque, validateProjectId, validateRequestId,
  RESOURCE_PROTOCOL, PROTOCOL_VERSION, PersistedTarget
} from './validation.js';
import { validateResourceRequestPayload, validateResourceResultPayload } from './resource-payloads.js';

export const RESOURCE_OPERATIONS = Object.freeze([
  'version', 'resources.list', 'resources.get', 'imports.preview', 'imports.apply',
  'scopes.list', 'scopes.get', 'scopes.assign', 'scopes.remove', 'scopes.enable',
  'scopes.disable', 'models.set', 'models.unset', 'changes.preview', 'changes.apply',
  'publish.dry-run', 'publish.apply', 'recover', 'distribute.build', 'distribute.check',
  'distribute.publish', 'distribute.all', 'distribute.recover'
] as const);
export type ResourceOperation = typeof RESOURCE_OPERATIONS[number];

export interface ResourceContext {
  canonicalSourceRoot: string;
  targetManifestPath: string;
  generatedRoot: string;
  homeRoot: string;
  stateRoot: string;
  projectId: string;
  projectRoot: string;
  target: PersistedTarget;
}

export interface ResourceRequest {
  protocol: typeof RESOURCE_PROTOCOL;
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  operation: ResourceOperation;
  context: ResourceContext;
  payload: JsonValue;
}

export interface ResourceRevision { kind: 'present' | 'absent'; identity: string; }
export interface ResourceRecovery { kind: 'none' | 'required'; identity: string; }
export type ResourceSuccessStatus = 'ok' | 'preview' | 'applied' | 'published' | 'activated';
export type ResourceError = SerializedControlPlaneError;

export interface ResourceSuccessResult {
  protocol: typeof RESOURCE_PROTOCOL;
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  operation: ResourceOperation;
  status: ResourceSuccessStatus;
  payload: JsonValue;
}
export interface ResourceRecoveredResult {
  protocol: typeof RESOURCE_PROTOCOL;
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  operation: ResourceOperation;
  status: 'recovered';
  payload: JsonValue;
  recovery: ResourceRecovery;
}
export interface ResourceErrorResult {
  protocol: typeof RESOURCE_PROTOCOL;
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  operation: ResourceOperation;
  status: 'error';
  error: ResourceError;
}
export interface ResourceConflictResult {
  protocol: typeof RESOURCE_PROTOCOL;
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
  operation: ResourceOperation;
  status: 'conflict';
  error: ResourceError;
  conflict: { expectedRevision: ResourceRevision; actualRevision: ResourceRevision; retryable: boolean };
}
export type ResourceResult =
  | ResourceSuccessResult | ResourceRecoveredResult | ResourceErrorResult | ResourceConflictResult;

const REQUEST_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'context', 'payload'] as const);
const CONTEXT_KEYS = Object.freeze(['canonicalSourceRoot', 'targetManifestPath', 'generatedRoot', 'homeRoot', 'stateRoot', 'projectId', 'projectRoot', 'target'] as const);
const REVISION_KEYS = Object.freeze(['kind', 'identity'] as const);
const RECOVERY_KEYS = Object.freeze(['kind', 'identity'] as const);
const RESULT_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation', 'status'] as const);
const SUCCESS_STATUSES = Object.freeze(['ok', 'preview', 'applied', 'published', 'activated'] as const);

function validateOperation(value: unknown): ResourceOperation {
  if (typeof value !== 'string' || !RESOURCE_OPERATIONS.includes(value as ResourceOperation)) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return value as ResourceOperation;
}

export function validateResourceContext(value: unknown): ResourceContext {
  assertExactKeys(value, CONTEXT_KEYS, 'VALIDATION_INVALID');
  const source = value as Record<string, unknown>;
  return {
    canonicalSourceRoot: safePath(source.canonicalSourceRoot),
    targetManifestPath: safePath(source.targetManifestPath),
    generatedRoot: safePath(source.generatedRoot),
    homeRoot: safePath(source.homeRoot),
    stateRoot: safePath(source.stateRoot),
    projectId: validateProjectId(source.projectId),
    projectRoot: safePath(source.projectRoot),
    target: normalizeTarget(source.target)
  };
}
export function validateResourceRequest(value: unknown): ResourceRequest {
  assertExactKeys(value, REQUEST_KEYS, 'PROTOCOL_INVALID');
  assertResourceSize(value);
  const request = value as Record<string, unknown>;
  if (request.protocol !== RESOURCE_PROTOCOL || request.protocolVersion !== PROTOCOL_VERSION) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const operation = validateOperation(request.operation);
  assertSafeBoundedJson(request.payload);
  rejectCredentialKeys(request.payload, 'VALIDATION_INVALID', operation === 'imports.apply' ? ['previewToken'] : []);
  rejectCounselFields(request.context);
  rejectCounselFields(request.payload);
  return {
    protocol: RESOURCE_PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    requestId: validateRequestId(request.requestId),
    operation,
    context: validateResourceContext(request.context),
    payload: validateResourceRequestPayload(operation, request.payload)
  };
}

export function createResourceRequest(
  requestId: string,
  operation: ResourceOperation,
  context: Omit<ResourceContext, 'target'> & { target: string },
  payload: JsonValue = {}
): ResourceRequest {
  return validateResourceRequest({
    protocol: RESOURCE_PROTOCOL, protocolVersion: PROTOCOL_VERSION, requestId, operation,
    context, payload
  });
}

export function validateResourceRevision(value: unknown): ResourceRevision {
  assertExactKeys(value, REVISION_KEYS, 'VALIDATION_INVALID');
  const revision = value as Record<string, unknown>;
  if (revision.kind !== 'present' && revision.kind !== 'absent') throw new ControlPlaneError('VALIDATION_INVALID');
  const identity = validateOpaque(revision.identity, 256, 'revision identity');
  if (revision.kind === 'absent' && identity !== 'absent') throw new ControlPlaneError('VALIDATION_INVALID');
  return { kind: revision.kind, identity };
}

export function validateResourceRecovery(value: unknown): ResourceRecovery {
  assertExactKeys(value, RECOVERY_KEYS, 'VALIDATION_INVALID');
  const recovery = value as Record<string, unknown>;
  if (recovery.kind !== 'none' && recovery.kind !== 'required') throw new ControlPlaneError('VALIDATION_INVALID');
  const identity = validateOpaque(recovery.identity, 256, 'recovery identity');
  if ((recovery.kind === 'none' && identity !== 'none')
    || (recovery.kind === 'required' && identity === 'none')) throw new ControlPlaneError('VALIDATION_INVALID');
  return { kind: recovery.kind, identity };
}

function validateResultError(value: unknown): ResourceError {
  return validateSerializedControlPlaneError(value);
}

function assertResourceSize(value: unknown): void {
  try {
    if (canonicalBytes(value).byteLength > MAX_JSON_BYTES) throw new ControlPlaneError('PROTOCOL_INVALID');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

export function validateResourceResult(value: unknown): ResourceResult {
  if (!isPlainObject(value)) throw new ControlPlaneError('PROTOCOL_INVALID');
  assertResourceSize(value);
  const result = value as Record<string, unknown>;
  if (result.protocol !== RESOURCE_PROTOCOL || result.protocolVersion !== PROTOCOL_VERSION) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const operation = validateOperation(result.operation);
  const base = {
    protocol: RESOURCE_PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    requestId: validateRequestId(result.requestId),
    operation
  };
  if (SUCCESS_STATUSES.includes(result.status as ResourceSuccessStatus)) {
    assertExactKeys(result, [...RESULT_KEYS, 'payload'], 'PROTOCOL_INVALID');
    assertSafeBoundedJson(result.payload);
    rejectCredentialKeys(result.payload, 'VALIDATION_INVALID', operation === 'imports.preview' ? ['token'] : []);
    rejectCounselFields(result.payload);
    return { ...base, status: result.status as ResourceSuccessStatus, payload: validateResourceResultPayload(operation, result.payload) };
  }
  if (result.status === 'recovered') {
    assertExactKeys(result, [...RESULT_KEYS, 'payload', 'recovery'], 'PROTOCOL_INVALID');
    assertSafeBoundedJson(result.payload);
    rejectCounselFields(result.payload);
    rejectCredentialKeys(result.payload);
    return {
      ...base, status: 'recovered', payload: result.payload as JsonValue,
      recovery: validateResourceRecovery(result.recovery)
    };
  }
  if (result.status === 'error') {
    assertExactKeys(result, [...RESULT_KEYS, 'error'], 'PROTOCOL_INVALID');
    return { ...base, status: 'error', error: validateResultError(result.error) };
  }
  if (result.status === 'conflict') {
    assertExactKeys(result, [...RESULT_KEYS, 'error', 'conflict'], 'PROTOCOL_INVALID');
    assertExactKeys(result.conflict, ['expectedRevision', 'actualRevision', 'retryable'], 'PROTOCOL_INVALID');
    const conflict = result.conflict as Record<string, unknown>;
    if (typeof conflict.retryable !== 'boolean') throw new ControlPlaneError('PROTOCOL_INVALID');
    return {
      ...base, status: 'conflict', error: validateResultError(result.error),
      conflict: {
        expectedRevision: validateResourceRevision(conflict.expectedRevision),
        actualRevision: validateResourceRevision(conflict.actualRevision),
        retryable: conflict.retryable
      }
    };
  }
  throw new ControlPlaneError('PROTOCOL_INVALID');
}

export function createResourceResult(
  request: ResourceRequest, payload: JsonValue = {}, status: ResourceSuccessStatus = 'ok'
): ResourceSuccessResult {
  assertSafeBoundedJson(payload);
  rejectCounselFields(payload);
  return validateResourceResult({
    protocol: RESOURCE_PROTOCOL, protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, operation: request.operation, status, payload
  }) as ResourceSuccessResult;
}

export function createResourceRecoveryResult(
  request: ResourceRequest, payload: JsonValue, recovery: ResourceRecovery
): ResourceRecoveredResult {
  return validateResourceResult({
    protocol: RESOURCE_PROTOCOL, protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, operation: request.operation, status: 'recovered', payload, recovery
  }) as ResourceRecoveredResult;
}

export function createResourceErrorResult(request: ResourceRequest, error: unknown): ResourceErrorResult {
  return validateResourceResult({
    protocol: RESOURCE_PROTOCOL, protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, operation: request.operation, status: 'error',
    error: serializeControlPlaneError(error)
  }) as ResourceErrorResult;
}

export function createResourceConflictResult(
  request: ResourceRequest, expectedRevision: ResourceRevision, actualRevision: ResourceRevision
): ResourceConflictResult {
  return validateResourceResult({
    protocol: RESOURCE_PROTOCOL, protocolVersion: PROTOCOL_VERSION,
    requestId: request.requestId, operation: request.operation, status: 'conflict',
    error: serializeControlPlaneError(new ControlPlaneError('CAS_CONFLICT')),
    conflict: { expectedRevision, actualRevision, retryable: true }
  }) as ResourceConflictResult;
}

export const RESOURCE_REQUEST_KEYS = REQUEST_KEYS;
export const RESOURCE_CONTEXT_KEYS = CONTEXT_KEYS;
export const RESOURCE_RESULT_KEYS = RESULT_KEYS;
export const RESOURCE_PROTOCOL_NAME = RESOURCE_PROTOCOL;
export const RESOURCE_MAX_RESULT_BYTES = MAX_JSON_BYTES;
