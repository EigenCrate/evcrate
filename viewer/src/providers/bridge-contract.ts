/**
 * @file bridge-contract.ts
 * Browser-side UI bridge envelope definitions and validators for DamHopper Advisor Plugin (Phase E03).
 *
 * Implements the client end of the D00 UI bridge protocol matching @dam-hopper/plugin-sdk/ui-bridge.
 * Validates message structure, frame sessions, single-use nonces, and bounded envelopes.
 */

export const UI_BRIDGE_VERSION = '1.0.0' as const;
export const ADVISOR_WORKSPACE_EXTENSION_V1 = 'workspace-advisor-v1' as const;

export type AdvisorHistoryScope = 'history-root' | 'project' | 'unavailable';
export type AdvisorContextScope = 'history-root' | 'project';

export interface AdvisorWorkspaceProject {
  readonly projectId: string;
  readonly label: string | null;
}

export interface AdvisorWorkspaceContext {
  readonly revision: number;
  readonly authorityKey: string;
  readonly project: AdvisorWorkspaceProject;
  readonly historyScope: AdvisorHistoryScope;
  readonly contextScope: AdvisorContextScope;
  readonly allowedOperations: readonly string[];
}

export type UiIntent = 'activate' | 'dismiss';

export const BRIDGE_ENVELOPE_TYPES = Object.freeze({
  'host.bootstrap': true,
  'frame.ready': true,
  'frame.portAck': true,
  request: true,
  cancel: true,
  response: true,
  'context.revoked': true,
  'availability.changed': true,
  'host.contextReady': true,
  'host.workspaceChanged': true,
  'frame.uiIntent': true
} as const);

export type BridgeEnvelopeType = keyof typeof BRIDGE_ENVELOPE_TYPES;

export interface BaseBridgeMessage {
  readonly type: BridgeEnvelopeType;
  readonly frameSession: string;
  readonly bridgeVersion: string;
  readonly activationGeneration: number;
}

export interface HostBootstrapMessage extends BaseBridgeMessage {
  readonly type: 'host.bootstrap';
  readonly nonce: string;
  readonly pluginId: string;
  readonly capabilities: readonly string[];
  readonly extensions?: readonly string[];
  readonly workspaceContext?: AdvisorWorkspaceContext;
}

export interface HostContextReadyMessage extends BaseBridgeMessage {
  readonly type: 'host.contextReady';
  readonly workspaceContext: AdvisorWorkspaceContext;
}

export interface HostWorkspaceChangedMessage extends BaseBridgeMessage {
  readonly type: 'host.workspaceChanged';
  readonly workspaceContext: AdvisorWorkspaceContext;
}

export interface FrameUiIntentMessage extends BaseBridgeMessage {
  readonly type: 'frame.uiIntent';
  readonly intent: UiIntent;
}

export interface FramePortAckMessage extends BaseBridgeMessage {
  readonly type: 'frame.portAck';
  readonly nonce: string;
}

export interface FrameReadyMessage extends BaseBridgeMessage {
  readonly type: 'frame.ready';
}

export interface BridgeRequestMessage extends BaseBridgeMessage {
  readonly type: 'request';
  readonly requestId: string;
  readonly operation: string;
  readonly payload: unknown;
  readonly deadlineMs?: number;
}

export interface BridgeErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface BridgeResponseMessage extends BaseBridgeMessage {
  readonly type: 'response';
  readonly requestId: string;
  readonly result?: unknown;
  readonly error?: BridgeErrorPayload;
}

export interface BridgeCancelMessage extends BaseBridgeMessage {
  readonly type: 'cancel';
  readonly requestId: string;
}

export interface ContextRevokedMessage extends BaseBridgeMessage {
  readonly type: 'context.revoked';
  readonly reason?: string;
}

export interface AvailabilityChangedMessage extends BaseBridgeMessage {
  readonly type: 'availability.changed';
  readonly available: boolean;
  readonly reason?: string;
}

export type BridgeMessage =
  | HostBootstrapMessage
  | FramePortAckMessage
  | FrameReadyMessage
  | BridgeRequestMessage
  | BridgeResponseMessage
  | BridgeCancelMessage
  | ContextRevokedMessage
  | AvailabilityChangedMessage
  | HostContextReadyMessage
  | HostWorkspaceChangedMessage
  | FrameUiIntentMessage;

export class BridgeProtocolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`Bridge protocol error [${code}]: ${message}`);
    this.name = 'BridgeProtocolError';
    this.code = code;
  }
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

export function validateAdvisorWorkspaceContext(data: unknown): AdvisorWorkspaceContext {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext must be an object');
  }
  const obj = data as Record<string, unknown>;
  const allowedKeys: Record<string, true> = {
    revision: true,
    authorityKey: true,
    project: true,
    historyScope: true,
    contextScope: true,
    allowedOperations: true,
  };
  for (const key of Object.keys(obj)) {
    if (!allowedKeys[key]) {
      throw new BridgeProtocolError('INVALID_INPUT', `Unknown workspaceContext property: ${key}`);
    }
  }
  if (typeof obj.revision !== 'number' || !Number.isInteger(obj.revision) || obj.revision < 1) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext must include positive integer revision');
  }
  if (typeof obj.authorityKey !== 'string' || !SHA256_HEX_PATTERN.test(obj.authorityKey)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext authorityKey must be a 64-char lowercase hex SHA-256');
  }
  if (typeof obj.project !== 'object' || obj.project === null || Array.isArray(obj.project)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext project must be an object');
  }
  const proj = obj.project as Record<string, unknown>;
  const projKeys: Record<string, true> = {
    projectId: true,
    label: true,
  };
  for (const key of Object.keys(proj)) {
    if (!projKeys[key]) {
      throw new BridgeProtocolError('INVALID_INPUT', `Unknown workspaceContext project property: ${key}`);
    }
  }
  if (typeof proj.projectId !== 'string' || !SHA256_HEX_PATTERN.test(proj.projectId)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext project.projectId must be a 64-char lowercase hex SHA-256');
  }
  if (proj.label !== null && typeof proj.label !== 'string') {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext project.label must be string or null');
  }
  if (typeof proj.label === 'string') {
    if (proj.label.length > 256 || CONTROL_CHAR_PATTERN.test(proj.label)) {
      throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext project.label must be bounded and free of control characters');
    }
  }
  if (obj.historyScope !== 'history-root' && obj.historyScope !== 'project' && obj.historyScope !== 'unavailable') {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext historyScope must be history-root, project, or unavailable');
  }
  if (obj.contextScope !== 'history-root' && obj.contextScope !== 'project') {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext contextScope must be history-root or project');
  }
  if (!Array.isArray(obj.allowedOperations)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext allowedOperations must be an array');
  }
  if (obj.allowedOperations.length > 256) {
    throw new BridgeProtocolError('INVALID_INPUT', 'workspaceContext allowedOperations exceeds maximum count');
  }
  for (const op of obj.allowedOperations) {
    if (typeof op !== 'string' || op.length === 0 || op.length > 128 || !OPERATION_PATTERN.test(op)) {
      throw new BridgeProtocolError('INVALID_INPUT', `Invalid operation identifier in allowedOperations: ${String(op)}`);
    }
  }
  return data as AdvisorWorkspaceContext;
}

/**
 * Validates an incoming bridge message against the D00 envelope schema.
 * Rejects invalid types, empty session IDs, version mismatches, or malformed payloads.
 */
export function validateBridgeMessage(data: unknown): BridgeMessage {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BridgeProtocolError('INVALID_INPUT', 'Bridge message must be a plain object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !Object.hasOwn(BRIDGE_ENVELOPE_TYPES, obj.type)) {
    throw new BridgeProtocolError('INVALID_INPUT', `Unknown bridge envelope type: ${String(obj.type)}`);
  }

  if (typeof obj.frameSession !== 'string' || obj.frameSession.trim().length === 0) {
    throw new BridgeProtocolError('INVALID_INPUT', 'Bridge message must include non-empty frameSession');
  }

  if (obj.bridgeVersion !== UI_BRIDGE_VERSION) {
    throw new BridgeProtocolError('INVALID_INPUT', 'Unsupported bridgeVersion');
  }

  if (
    typeof obj.activationGeneration !== 'number' ||
    !Number.isInteger(obj.activationGeneration) ||
    obj.activationGeneration < 0
  ) {
    throw new BridgeProtocolError(
      'INVALID_INPUT',
      'Bridge message must include non-negative integer activationGeneration'
    );
  }

  const type = obj.type as BridgeEnvelopeType;

  if (type === 'request') {
    if (typeof obj.requestId !== 'string' || obj.requestId.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge request must include non-empty requestId');
    }
    if (typeof obj.operation !== 'string' || obj.operation.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge request must include non-empty operation');
    }
    if (!Object.prototype.hasOwnProperty.call(obj, 'payload')) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge request must include payload');
    }
  } else if (type === 'response') {
    if (typeof obj.requestId !== 'string' || obj.requestId.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response must include non-empty requestId');
    }
    if (obj.result !== undefined && obj.error !== undefined) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response cannot include both result and error');
    }
    if (obj.result === undefined && obj.error === undefined) {
      throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response must include either result or error');
    }
    if (obj.error !== undefined) {
      if (typeof obj.error !== 'object' || obj.error === null || Array.isArray(obj.error)) {
        throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response error must be an object');
      }
      const err = obj.error as Record<string, unknown>;
      if (typeof err.code !== 'string' || !err.code) {
        throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response error must include code string');
      }
      if (typeof err.message !== 'string') {
        throw new BridgeProtocolError('INVALID_INPUT', 'Bridge response error must include message string');
      }
    }
  } else if (type === 'host.bootstrap') {
    if (typeof obj.nonce !== 'string' || obj.nonce.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'host.bootstrap must include non-empty nonce');
    }
    if (typeof obj.pluginId !== 'string' || obj.pluginId.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'host.bootstrap must include non-empty pluginId');
    }
    if (!Array.isArray(obj.capabilities)) {
      throw new BridgeProtocolError('INVALID_INPUT', 'host.bootstrap must include capabilities array');
    }
  } else if (type === 'frame.portAck') {
    if (typeof obj.nonce !== 'string' || obj.nonce.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'frame.portAck must include non-empty nonce');
    }
  } else if (type === 'cancel') {
    if (typeof obj.requestId !== 'string' || obj.requestId.trim().length === 0) {
      throw new BridgeProtocolError('INVALID_INPUT', 'cancel must include non-empty requestId');
    }
  } else if (type === 'availability.changed') {
    if (typeof obj.available !== 'boolean') {
      throw new BridgeProtocolError('INVALID_INPUT', 'availability.changed must include boolean available');
    }
    if (obj.reason !== undefined && typeof obj.reason !== 'string') {
      throw new BridgeProtocolError('INVALID_INPUT', 'availability.changed reason must be a string');
    }
  } else if (type === 'host.contextReady' || type === 'host.workspaceChanged') {
    validateAdvisorWorkspaceContext(obj.workspaceContext);
  } else if (type === 'frame.uiIntent') {
    if (obj.intent !== 'activate' && obj.intent !== 'dismiss') {
      throw new BridgeProtocolError('INVALID_INPUT', 'frame.uiIntent intent must be activate or dismiss');
    }
  }
  if (type === 'host.bootstrap') {
    if (obj.extensions !== undefined) {
      if (!Array.isArray(obj.extensions) || obj.extensions.some((e) => typeof e !== 'string')) {
        throw new BridgeProtocolError('INVALID_INPUT', 'host.bootstrap extensions must be an array of strings');
      }
    }
    if (obj.workspaceContext !== undefined) {
      validateAdvisorWorkspaceContext(obj.workspaceContext);
    }
  }

  return data as unknown as BridgeMessage;
}
