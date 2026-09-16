import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';
import {
  safePath, validateProjectId,
  WINDOWS_DOS_DEVICE, WINDOWS_INVALID_CHARS, WINDOWS_DRIVE_ROOT,
  METADATA_SEGMENTS, SENSITIVE_PATH_SEGMENT
} from '../protocol/validation.js';

type Environment = Readonly<Record<string, string | undefined>>;

export interface PathEnvironmentOptions {
  readonly env?: Environment;
  readonly cwd?: string;
  readonly platformHome?: string;
}

export interface HomePathOptions extends PathEnvironmentOptions {
  readonly home?: string;
}

export interface StatePathOptions extends HomePathOptions {
  readonly stateHome?: string;
}


export function lexicalAbsoluteWindows(value: string, base: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.includes('\0')) {
    throw new ControlPlaneError('PATH_UNSAFE', `Invalid path string: "${value}"`);
  }
  if (/^\/[A-Za-z]:[/\\]/u.test(value)) {
    value = value.slice(1);
  }
  if (value.startsWith('\\\\') || value.startsWith('//') || /^[/\\][/\\]/u.test(value)) {
    throw new ControlPlaneError('PATH_UNSAFE', `UNC path not allowed: "${value}"`);
  }
  if (/^[A-Za-z]:(?![/\\])/u.test(value)) {
    throw new ControlPlaneError('PATH_UNSAFE', `Drive-relative path not allowed: "${value}"`);
  }
  if (value.includes(':')) {
    if (!WINDOWS_DRIVE_ROOT.test(value) || value.slice(2).includes(':')) {
      throw new ControlPlaneError('PATH_UNSAFE', `Invalid colon in path: "${value}"`);
    }
  }
  if (WINDOWS_INVALID_CHARS.test(value) || /[/\\]{2,}/u.test(value)) {
    throw new ControlPlaneError('PATH_UNSAFE', `Invalid characters or consecutive slashes in path: "${value}"`);
  }
  const isDriveRoot = /^[A-Za-z]:[/\\]$/u.test(value);
  if (!isDriveRoot && (value.endsWith('/') || value.endsWith('\\'))) {
    throw new ControlPlaneError('PATH_UNSAFE', `Trailing slash not allowed: "${value}"`);
  }
  let components: string[];
  if (WINDOWS_DRIVE_ROOT.test(value)) {
    components = value.length === 3 ? [] : value.slice(3).split(/[/\\]/u);
  } else {
    if (value.startsWith('/') || value.startsWith('\\')) {
      throw new ControlPlaneError('PATH_UNSAFE', `Root-relative path not allowed: "${value}"`);
    }
    components = value.split(/[/\\]/u);
  }
  for (const comp of components) {
    if (!comp) throw new ControlPlaneError('PATH_UNSAFE', `Empty component in path: "${value}"`);
    if (comp === '.' || comp === '..') throw new ControlPlaneError('PATH_UNSAFE', `Relative component "${comp}" in path: "${value}"`);
    if (comp.endsWith('.') || comp.endsWith(' ')) throw new ControlPlaneError('PATH_UNSAFE', `Component ends with dot or space: "${comp}" in "${value}"`);
    if (WINDOWS_DOS_DEVICE.test(comp)) throw new ControlPlaneError('PATH_UNSAFE', `Component matches DOS device: "${comp}" in "${value}"`);
    if (METADATA_SEGMENTS[comp.toLowerCase()] === true) throw new ControlPlaneError('PATH_UNSAFE', `Component is VCS metadata: "${comp}" in "${value}"`);
    if (SENSITIVE_PATH_SEGMENT.test(comp)) throw new ControlPlaneError('PATH_UNSAFE', `Component matches sensitive pattern: "${comp}" in "${value}"`);
  }
  const absolute = WINDOWS_DRIVE_ROOT.test(value) ? value : resolve(base, value);
  try {
    return safePath(absolute);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE', `safePath failed on "${absolute}": ${(error as Error).message}`);
  }
}

function lexicalAbsolute(value: string, base: string): string {
  if (process.platform === 'win32') {
    return lexicalAbsoluteWindows(value, base);
  }
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value
    || value.includes('\\') || value.includes('\0')) {
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  const segments = isAbsolute(value) ? value.slice(1).split('/') : value.split('/');
  if (value !== '/' && segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  const absolute = isAbsolute(value) ? value : resolve(base, value);
  try {
    return safePath(absolute);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
}

export function resolveSafePath(value: string, base = process.cwd()): string {
  const result = lexicalAbsolute(value, base);
  assertNoSymlinkAncestors(result);
  return result;
}

function optionValue(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value;
}

export function resolveHomeRoot(options: HomePathOptions = {}): string {
  const env = options.env ?? process.env;
  const base = options.cwd ?? process.cwd();
  const selected = optionValue(options.home, optionValue(env.EVCRATE_HOME, options.platformHome ?? homedir()));
  return resolveSafePath(selected, base);
}

export function resolveStateRoot(options: StatePathOptions = {}): string {
  const env = options.env ?? process.env;
  const base = options.cwd ?? process.cwd();
  const home = resolveHomeRoot(options);
  if (options.stateHome !== undefined) return resolveSafePath(options.stateHome, base);
  if (env.EVCRATE_STATE_HOME !== undefined) {
    return resolveSafePath(join(resolveSafePath(env.EVCRATE_STATE_HOME, base), 'evcrate'));
  }
  if (env.XDG_STATE_HOME !== undefined) {
    return resolveSafePath(join(resolveSafePath(env.XDG_STATE_HOME, base), 'evcrate'));
  }
  return resolveSafePath(join(home, '.local', 'state', 'evcrate'));
}

export function resolveProjectRoot(
  valueOrOptions: string | { readonly projectRoot?: string; readonly cwd?: string } = process.cwd(),
  cwd = process.cwd()
): string {
  const value = typeof valueOrOptions === 'string' ? valueOrOptions : valueOrOptions.projectRoot;
  const base = typeof valueOrOptions === 'string' ? cwd : (valueOrOptions.cwd ?? cwd);
  return resolveSafePath(value ?? base, base);
}

export function validateProjectIdentifier(value: string): string {
  return validateProjectId(value);
}

export function parentRoot(value: string): string {
  return dirname(value);
}
