import { lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { safePath, validateProjectId } from '../protocol/validation.js';

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

function rejectSymlinkAncestors(value: string): void {
  const root = parse(value).root;
  let current = root;
  for (const segment of value.slice(root.length).split('/')) {
    if (!segment) continue;
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw new ControlPlaneError('PATH_UNSAFE');
    }
  }
}

function lexicalAbsolute(value: string, base: string): string {
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
  rejectSymlinkAncestors(result);
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
