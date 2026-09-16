import { ControlPlaneError, ControlPlaneErrorCode } from '../errors/control-plane-error.js';
import { canonicalBytes, isPlainObject, JsonValue, MAX_JSON_DEPTH } from './json.js';

export const RESOURCE_PROTOCOL = 'evcrate-resource-control' as const;
export const SETTINGS_PROTOCOL = 'evcrate-advisor-settings' as const;
export const DIAGNOSTIC_PROTOCOL = 'evcrate-advisor-diagnostic' as const;
export const PROTOCOL_VERSION = 1 as const;
export const PERSISTED_TARGETS = Object.freeze(['claude', 'codex', 'gemini', 'antigravity', 'pi', 'omp', 'copilot'] as const);
export const INPUT_TARGETS = Object.freeze([...PERSISTED_TARGETS, 'agy'] as const);
export type PersistedTarget = typeof PERSISTED_TARGETS[number];
export type InputTarget = typeof INPUT_TARGETS[number];

const CONTROL = /[\u0000-\u001f\u007f]/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CREDENTIAL_KEY = /(?:api[_ -]?key|token|secret|password|passwd|authorization|cookie|credential)/iu;
const COUNSEL_KEY = /^(?:checkpoint|question|evidence|prior_counsel|owner_disposition|recommendation|result|hosts|backend)$/u;
export const METADATA_SEGMENTS: Record<string, true> = {
  '.git': true, '.gitignore': true, '.gitmodules': true, '.gitattributes': true,
  '.github': true, '.gitlab': true, '.hg': true, '.svn': true
};
export const SENSITIVE_PATH_SEGMENT = /^(?:\.env(?:\..*)?$|.*(?:secret|credential|password|token|private[-_]?key).*)$/iu;
export const WINDOWS_DOS_DEVICE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$|CLOCK\$)(?:\.|$)/iu;
export const WINDOWS_INVALID_CHARS = /[<>"|?*]/u;
export const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:[/\\]/u;
function fail(code: ControlPlaneErrorCode, detail?: string): never {
  throw new ControlPlaneError(code, detail);
}

export function utf8Length(value: string): number { return new TextEncoder().encode(value).byteLength; }

export function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  errorCode: ControlPlaneErrorCode = 'VALIDATION_INVALID'
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail(errorCode);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail(errorCode);
}

export function boundedText(
  value: unknown,
  maxBytes: number,
  field = 'text',
  errorCode: ControlPlaneErrorCode = 'VALIDATION_INVALID'
): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || CONTROL.test(value)
    || utf8Length(value) > maxBytes) {
    fail(errorCode);
  }
  return value;
}

export function validateWindowsPath(path: string): string {
  if (!WINDOWS_DRIVE_ROOT.test(path)) fail('PATH_UNSAFE', `Path missing drive root: "${path}"`);
  if (path.slice(2).includes(':')) fail('PATH_UNSAFE', `Path contains extra colon: "${path}"`);
  if (WINDOWS_INVALID_CHARS.test(path)) fail('PATH_UNSAFE', `Path contains invalid characters: "${path}"`);
  if (/[/\\]{2,}/u.test(path)) fail('PATH_UNSAFE', `Path contains consecutive slashes: "${path}"`);
  const drive = path.slice(0, 2);
  if (path.length === 3) return `${drive}\\`;
  if (path.endsWith('/') || path.endsWith('\\')) fail('PATH_UNSAFE', `Path has trailing slash: "${path}"`);
  const components = path.slice(3).split(/[/\\]/u);
  for (const component of components) {
    if (!component) fail('PATH_UNSAFE', `Empty component in path: "${path}"`);
    if (component === '.' || component === '..') fail('PATH_UNSAFE', `Relative component "${component}" in path: "${path}"`);
    if (component.endsWith('.') || component.endsWith(' ')) fail('PATH_UNSAFE', `Component ends with dot or space: "${component}" in "${path}"`);
    if (WINDOWS_DOS_DEVICE.test(component)) fail('PATH_UNSAFE', `Component matches DOS device name: "${component}" in "${path}"`);
    if (METADATA_SEGMENTS[component.toLowerCase()] === true) fail('PATH_UNSAFE', `Component is VCS metadata: "${component}" in "${path}"`);
    if (SENSITIVE_PATH_SEGMENT.test(component)) fail('PATH_UNSAFE', `Component matched sensitive path pattern: "${component}" in "${path}"`);
  }
  return `${drive}\\${components.join('\\')}`;
}

export function safePath(value: unknown, maxBytes = 4096): string {
  const path = boundedText(value, maxBytes, 'path');
  if (process.platform === 'win32') {
    if (WINDOWS_DRIVE_ROOT.test(path) || !path.startsWith('/')) {
      return validateWindowsPath(path);
    }
  }
  if (path.includes('\\') || /^[A-Za-z]:/u.test(path)) fail('PATH_UNSAFE');
  if (path !== '/') {
    const segments = path.split('/');
    if (!path.startsWith('/') || path.endsWith('/') || path.includes('//')
      || segments.slice(1).some((segment) => !segment || segment === '.' || segment === '..'
        || METADATA_SEGMENTS[segment] === true || SENSITIVE_PATH_SEGMENT.test(segment))) {
      fail('PATH_UNSAFE');
    }
  }
  return path;
}

export function validateRequestId(
  value: unknown, errorCode: ControlPlaneErrorCode = 'PROTOCOL_INVALID'
): string {
  const requestId = boundedText(value, 128, 'requestId', errorCode);
  if (!REQUEST_ID.test(requestId)) fail(errorCode);
  return requestId;

}
export function validateProjectId(value: unknown): string {
  const projectId = boundedText(value, 128, 'projectId');
  if (!PROJECT_ID.test(projectId)) fail('VALIDATION_INVALID');
  return projectId;
}

export function normalizeTarget(value: unknown): PersistedTarget {
  if (typeof value !== 'string' || !INPUT_TARGETS.includes(value as InputTarget)) fail('CAPABILITY_UNSUPPORTED');
  return (value === 'agy' ? 'antigravity' : value) as PersistedTarget;
}

export function assertSafeBoundedJson(value: unknown, maxBytes = 64 * 1024): asserts value is JsonValue {
  const visit = (current: unknown, depth: number): void => {
    if (depth > MAX_JSON_DEPTH) throw new ControlPlaneError('VALIDATION_INVALID');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      if (typeof current === 'string' && (CONTROL.test(current) || utf8Length(current) > maxBytes)) {
        throw new ControlPlaneError('VALIDATION_INVALID');
      }
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new ControlPlaneError('VALIDATION_INVALID');
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (!isPlainObject(current)) throw new ControlPlaneError('VALIDATION_INVALID');
    for (const [key, child] of Object.entries(current)) {
      if (CONTROL.test(key) || utf8Length(key) > 256) throw new ControlPlaneError('VALIDATION_INVALID');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  if (canonicalBytes(value).byteLength > maxBytes) throw new ControlPlaneError('VALIDATION_INVALID');
}

export function rejectCredentialKeys(
  value: unknown, errorCode: ControlPlaneErrorCode = 'VALIDATION_INVALID', allowedTopLevelKeys: readonly string[] = []
): void {
  if (Array.isArray(value)) {
    value.forEach((child) => rejectCredentialKeys(child, errorCode));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key) && !allowedTopLevelKeys.includes(key)) fail(errorCode);
    rejectCredentialKeys(child, errorCode);
  }
}

export function rejectCounselFields(
  value: unknown,
  allowedKeys: readonly string[] = [],
  errorCode: ControlPlaneErrorCode = 'PROTOCOL_INVALID'
): void {
  if (Array.isArray(value)) {
    value.forEach((child) => rejectCounselFields(child, allowedKeys, errorCode));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (COUNSEL_KEY.test(key) && !allowedKeys.includes(key)) fail(errorCode);
    rejectCounselFields(child, allowedKeys, errorCode);
  }
}

export function validateOpaque(
  value: unknown,
  maxBytes = 256,
  field = 'opaque value',
  errorCode: ControlPlaneErrorCode = 'VALIDATION_INVALID'
): string {
  return boundedText(value, maxBytes, field, errorCode);
}

