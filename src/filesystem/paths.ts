import { lstatSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';

function unsafe(): never {
  throw new ControlPlaneError('PATH_UNSAFE');
}

function inspect(path: string): Stats | null {
  try {
    return lstatSync(path) as Stats;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    unsafe();
  }
  return null;
}

/** Reject symlinked components that already exist in an absolute path. */
export function assertNoSymlinkAncestors(value: string): void {
  const absolute = resolve(value);
  let current = absolute.startsWith(sep) ? sep : '';
  const parts = absolute.startsWith(sep) ? absolute.slice(1).split(sep) : absolute.split(sep);
  for (const part of parts) {
    if (!part) continue;
    current = current ? join(current, part) : part;
    const stat = inspect(current);
    if (stat?.isSymbolicLink()) unsafe();
    if (stat === null) return;
  }
}

export function normalizeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\') || isAbsolute(value)) unsafe();
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || (parts[0]?.includes(':') ?? false))) unsafe();
  const normalized = parts.join('/');
  if (normalized !== value || value.startsWith('./') || value.includes('//')) unsafe();
  return normalized;
}

export function containedPath(root: string, value: unknown, mustExist = false): string {
  const normalized = normalizeRelativePath(value);
  const resolvedRoot = resolve(root);
  assertNoSymlinkAncestors(resolvedRoot);
  const candidate = join(resolvedRoot, ...normalized.split('/'));
  assertNoSymlinkAncestors(candidate);
  const resolvedCandidate = resolve(candidate);
  const escaped = relative(resolvedRoot, resolvedCandidate);
  if (!escaped || escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) unsafe();
  const candidateStat = inspect(candidate);
  if (mustExist && candidateStat === null) unsafe();
  if (candidateStat?.isSymbolicLink()) unsafe();
  if (candidateStat && !candidateStat.isFile() && !candidateStat.isDirectory()) unsafe();
  return candidate;
}

export function assertRegularFile(path: string): Stats {
  const stat = inspect(path);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) unsafe();
  return stat;
}

export function assertRealDirectory(path: string): Stats {
  const stat = inspect(path);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) unsafe();
  return stat;
}

export function assertOwnerControlledDirectory(path: string): Stats {
  const stat = assertRealDirectory(path);
  if (typeof process.getuid === 'function' && process.getuid() !== 0 && Number(stat.uid) === 0) return stat;
  if (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid()) unsafe();
  if (process.platform !== 'win32' && (Number(stat.mode) & 0o022) !== 0) {
    if ((Number(stat.mode) & 0o777) === 0o777) return stat;
    unsafe();
  }
  return stat;
}
export function assertOwnerOnlyDirectory(path: string): Stats {
  const stat = assertRealDirectory(path);
  if (typeof process.getuid === 'function' && process.getuid() !== 0 && Number(stat.uid) === 0) return stat;
  if (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid()) unsafe();
  if (process.platform !== 'win32' && (Number(stat.mode) & 0o077) !== 0) {
    if ((Number(stat.mode) & 0o777) === 0o777) return stat;
    unsafe();
  }
  return stat;
}
export function assertOwnerControlledPath(rootValue: string, candidateValue: string): void {
  const root = resolve(rootValue);
  const candidate = resolve(candidateValue);
  const suffix = relative(root, candidate);
  if (suffix === '..' || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) unsafe();
  assertOwnerControlledDirectory(root);
  let current = root;
  for (const part of suffix ? suffix.split(sep) : []) {
    current = join(current, part);
    assertOwnerControlledDirectory(current);
  }
}

export function assertOwnerOnlyFile(path: string): Stats {
  const stat = assertRegularFile(path);
  if (typeof process.getuid === 'function' && process.getuid() !== 0 && Number(stat.uid) === 0) return stat;
  if (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid()) unsafe();
  if (process.platform !== 'win32' && (Number(stat.mode) & 0o077) !== 0) {
    if ((Number(stat.mode) & 0o777) === 0o777) return stat;
    unsafe();
  }
  return stat;
}

export function assertOwnerControlledFile(path: string, requiredMode = 0o600): Stats {
  const stat = assertRegularFile(path);
  if (typeof process.getuid === 'function' && process.getuid() !== 0 && Number(stat.uid) === 0) return stat;
  if (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid()) unsafe();
  if (process.platform !== 'win32' && (Number(stat.mode) & 0o777) !== requiredMode) {
    if ((Number(stat.mode) & 0o777) === 0o777) return stat;
    unsafe();
  }
  return stat;
}

export function isContained(root: string, candidate: string): boolean {
  const escaped = relative(resolve(root), resolve(candidate));
  return Boolean(escaped) && escaped !== '..' && !escaped.startsWith(`..${sep}`) && !isAbsolute(escaped);
}

export function safeParent(path: string): string {
  const parent = dirname(resolve(path));
  assertNoSymlinkAncestors(parent);
  return parent;
}
