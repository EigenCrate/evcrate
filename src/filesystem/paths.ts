import { lstatSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';

function unsafe(detail?: string): never {
  throw new ControlPlaneError('PATH_UNSAFE', detail);
}

function inspect(path: string): Stats | null {
  try {
    return lstatSync(path) as Stats;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    unsafe(`inspect failed on "${path}": ${(error as Error).message}`);
  }
  return null;
}

/** Reject symlinked components that already exist in an absolute path. */
export function assertNoSymlinkAncestors(value: string): void {
  const absolute = resolve(value);
  const root = parse(absolute).root;
  let current = root;
  const parts = absolute.slice(root.length).split(/[/\\]/u);
  for (const part of parts) {
    if (!part) continue;
    current = join(current, part);
    const stat = inspect(current);
    if (stat?.isSymbolicLink()) unsafe(`symlink or reparse point detected in ancestor: "${current}"`);
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
  const normalizedValue = typeof value === 'string' ? value.split('\\').join('/') : value;
  const normalized = normalizeRelativePath(normalizedValue);
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
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) unsafe(`not a regular file: "${path}"`);
  return stat;
}

export function assertRealDirectory(path: string): Stats {
  const stat = inspect(path);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) unsafe(`not a real directory: "${path}"`);
  return stat;
}

export function assertDirectoryPath(rootValue: string, candidateValue: string): void {
  const root = resolve(rootValue);
  const candidate = resolve(candidateValue);
  const suffix = relative(root, candidate);
  if (suffix === '..' || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) unsafe();
  assertRealDirectory(root);
  let current = root;
  for (const part of suffix ? suffix.split(/[/\\]/u) : []) {
    current = join(current, part);
    assertRealDirectory(current);
  }
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

export function pathOverlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
    || left.startsWith(`${right}${sep}`) || right.startsWith(`${left}${sep}`);
}

