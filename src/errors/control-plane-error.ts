export type ControlPlaneErrorCategory =
  | 'success' | 'usage' | 'protocol' | 'validation' | 'path' | 'capability'
  | 'conflict' | 'publication' | 'rollback' | 'recovery' | 'internal';

export type ControlPlaneErrorCode =
  | 'OK' | 'USAGE_INVALID' | 'PROTOCOL_INVALID' | 'VALIDATION_INVALID'
  | 'PATH_UNSAFE' | 'CAPABILITY_UNSUPPORTED' | 'CAS_CONFLICT'
  | 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'RECOVERY_FAILED'
  | 'INTERNAL_ERROR' | 'SETTINGS_INVALID' | 'DIAGNOSTIC_INVALID';

interface ErrorDefinition { category: ControlPlaneErrorCategory; action: string; message: string; }

export interface SerializedControlPlaneError {
  code: ControlPlaneErrorCode;
  category: ControlPlaneErrorCategory;
  action: string;
  message: string;
}
const DEFINITIONS: Record<ControlPlaneErrorCode, ErrorDefinition> = {
  OK: { category: 'success', action: 'No action required.', message: 'Success' },
  USAGE_INVALID: { category: 'usage', action: 'Use the documented command syntax.', message: 'Usage is invalid' },
  PROTOCOL_INVALID: { category: 'protocol', action: 'Provide one valid versioned protocol request.', message: 'Protocol is invalid' },
  VALIDATION_INVALID: { category: 'validation', action: 'Correct the invalid value and retry.', message: 'Validation failed' },
  PATH_UNSAFE: { category: 'path', action: 'Use a safe path within the selected context.', message: 'Path is unsafe' },
  CAPABILITY_UNSUPPORTED: { category: 'capability', action: 'Select a supported target or capability.', message: 'Capability is unsupported' },
  CAS_CONFLICT: { category: 'conflict', action: 'Refresh the current revision and preview again.', message: 'Revision conflict' },
  PUBLICATION_FAILED: { category: 'publication', action: 'Repair the publication state before retrying.', message: 'Publication failed' },
  ROLLBACK_FAILED: { category: 'rollback', action: 'Run recovery for the incomplete publication.', message: 'Rollback failed' },
  RECOVERY_FAILED: { category: 'recovery', action: 'Resolve the recovery marker before retrying.', message: 'Recovery failed' },
  INTERNAL_ERROR: { category: 'internal', action: 'Retry or inspect the bounded diagnostic.', message: 'Internal error' },
  SETTINGS_INVALID: { category: 'validation', action: 'Provide one complete version 1 advisor policy.', message: 'Advisor settings are invalid' },
  DIAGNOSTIC_INVALID: { category: 'protocol', action: 'Return one valid qualification diagnostic result.', message: 'Qualification diagnostic is invalid' }
};

const EXIT_CODES: Record<ControlPlaneErrorCategory, number> = {
  success: 0, usage: 2, protocol: 2, validation: 3, path: 3, capability: 3,
  conflict: 4, publication: 5, rollback: 5, recovery: 5, internal: 6
};
export const CONTROL_PLANE_ERROR_CATEGORIES = Object.freeze([
  'success', 'usage', 'protocol', 'validation', 'path', 'capability',
  'conflict', 'publication', 'rollback', 'recovery', 'internal'
] as const);

export class ControlPlaneError extends Error {
  readonly code: ControlPlaneErrorCode;
  readonly category: ControlPlaneErrorCategory;
  readonly action: string;
  readonly exitCode: number;
  readonly detail?: string;

  constructor(code: ControlPlaneErrorCode, detailOrOptions?: string | { readonly detail?: string; readonly cause?: unknown }) {
    const known = Object.hasOwn(DEFINITIONS, code);
    const definition = known ? DEFINITIONS[code] : DEFINITIONS.INTERNAL_ERROR;
    const detail = typeof detailOrOptions === 'string' ? detailOrOptions : detailOrOptions?.detail;
    const cause = typeof detailOrOptions === 'object' && detailOrOptions !== null ? detailOrOptions.cause : undefined;
    super(definition.message, cause !== undefined ? { cause } : undefined);
    this.name = 'ControlPlaneError';
    this.code = known ? code : 'INTERNAL_ERROR';
    this.category = definition.category;
    this.action = definition.action;
    this.exitCode = EXIT_CODES[this.category];
    if (detail !== undefined) {
      this.detail = detail;
    }
    Object.freeze(this);
  }
}

export function createControlPlaneError(
  code: ControlPlaneErrorCode,
  detailOrOptions?: string | { readonly detail?: string; readonly cause?: unknown }
): ControlPlaneError {
  return new ControlPlaneError(code, detailOrOptions);
}

export function isControlPlaneError(value: unknown): value is ControlPlaneError {
  return value instanceof ControlPlaneError;
}
export const CONTROL_PLANE_ERROR_DETAILS = new WeakMap<object, string>();
const LOGGED_DEBUG_ERRORS = new WeakSet<object>();


export function serializeControlPlaneError(value: unknown): SerializedControlPlaneError {
  const isDebug = process.argv.includes('--debug')
    || process.env.EVCRATE_DEBUG === '1' || process.env.EVCRATE_DEBUG === 'true';
  if (isDebug && typeof value === 'object' && value !== null) {
    if (!LOGGED_DEBUG_ERRORS.has(value)) {
      LOGGED_DEBUG_ERRORS.add(value);
      const err = value instanceof Error ? value : new Error(String(value));
      const detailMsg = value instanceof ControlPlaneError && value.detail ? `\n[DEBUG] Detail: ${value.detail}` : '';
      process.stderr.write(`[DEBUG] ${err.stack ?? err.message}${detailMsg}\n`);
    }
  }
  const error = isControlPlaneError(value) ? value : new ControlPlaneError('INTERNAL_ERROR');
  const serialized = { code: error.code, category: error.category, action: error.action, message: error.message };
  if (error.detail !== undefined) {
    CONTROL_PLANE_ERROR_DETAILS.set(serialized, error.detail);
  }
  return serialized;
}

export function validateSerializedControlPlaneError(value: unknown): SerializedControlPlaneError {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const error = value as Record<string, unknown>;
  if (Object.keys(error).length !== 4
    || !['code', 'category', 'action', 'message'].every((key) => Object.hasOwn(error, key))) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const code = error.code;
  if (typeof code !== 'string' || code === 'OK' || !Object.hasOwn(DEFINITIONS, code)) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  const definition = DEFINITIONS[code as ControlPlaneErrorCode];
  if (error.category !== definition.category || error.action !== definition.action
    || error.message !== definition.message) throw new ControlPlaneError('PROTOCOL_INVALID');
  return {
    code: code as ControlPlaneErrorCode,
    category: definition.category,
    action: definition.action,
    message: definition.message
  };
}

export function exitCodeForError(value: unknown): number {
  return isControlPlaneError(value) ? value.exitCode : 6;
}

export const CONTROL_PLANE_ERROR_CODES = Object.freeze(Object.keys(DEFINITIONS) as ControlPlaneErrorCode[]);
export const CONTROL_PLANE_EXIT_CODES = Object.freeze({ ...EXIT_CODES });
