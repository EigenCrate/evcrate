/**
 * @file bridge-contract.ts
 * Browser-side UI bridge envelope definitions and validators for DamHopper Advisor Plugin (Phase E03).
 *
 * Implements the client end of the D00 UI bridge protocol matching @dam-hopper/plugin-sdk/ui-bridge.
 * Validates message structure, frame sessions, single-use nonces, and bounded envelopes.
 */

export const UI_BRIDGE_VERSION = '1.0.0' as const;

export const BRIDGE_ENVELOPE_TYPES = Object.freeze({
  'host.bootstrap': true,
  'frame.ready': true,
  'frame.portAck': true,
  request: true,
  cancel: true,
  response: true,
  'context.revoked': true,
  'availability.changed': true
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
  readonly params?: unknown;
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
  readonly capabilities: readonly string[];
}

export type BridgeMessage =
  | HostBootstrapMessage
  | FramePortAckMessage
  | FrameReadyMessage
  | BridgeRequestMessage
  | BridgeResponseMessage
  | BridgeCancelMessage
  | ContextRevokedMessage
  | AvailabilityChangedMessage;

export class BridgeProtocolError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`Bridge protocol error [${code}]: ${message}`);
    this.name = 'BridgeProtocolError';
    this.code = code;
  }
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

  if (typeof obj.type !== 'string' || !(obj.type in BRIDGE_ENVELOPE_TYPES)) {
    throw new BridgeProtocolError('INVALID_INPUT', `Unknown bridge envelope type: ${String(obj.type)}`);
  }

  if (typeof obj.frameSession !== 'string' || obj.frameSession.trim().length === 0) {
    throw new BridgeProtocolError('INVALID_INPUT', 'Bridge message must include non-empty frameSession');
  }

  if (typeof obj.bridgeVersion !== 'string' || obj.bridgeVersion.trim().length === 0) {
    throw new BridgeProtocolError('INVALID_INPUT', 'Bridge message must include non-empty bridgeVersion');
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
    if (!Array.isArray(obj.capabilities)) {
      throw new BridgeProtocolError('INVALID_INPUT', 'availability.changed must include capabilities array');
    }
  }

  return data as unknown as BridgeMessage;
}
