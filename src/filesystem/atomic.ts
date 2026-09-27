import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync, statSync, writeSync, type Stats } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors, assertRealDirectory, safeParent } from './paths.js';

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

function fail(code: 'PATH_UNSAFE' | 'PUBLICATION_FAILED'): never {
  throw new ControlPlaneError(code);
}

function ensureParent(path: string): string {
  const parent = safeParent(path);
  const missing: string[] = [];
  let current = parent;
  while (true) {
    let stat: Stats | null;
    try { stat = lstatSync(current); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('PATH_UNSAFE');
      stat = null;
    }
    if (stat) {
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
      break;
    }
    missing.push(current);
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  try {
    mkdirSync(parent, { recursive: true });
  } catch { fail('PATH_UNSAFE'); }
  for (const created of missing) {
    try {
      const stat = lstatSync(created);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_UNSAFE');
    } catch (error) {
      if (error instanceof ControlPlaneError) throw error;
      fail('PATH_UNSAFE');
    }
  }
  assertNoSymlinkAncestors(parent);
  return parent;
}

export function removePath(path: string): void {
  let stat: Stats;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    fail('PUBLICATION_FAILED');
  }
  if (stat.isSymbolicLink() || stat.isFile()) rmSync(path, { force: true });
  else if (stat.isDirectory()) rmSync(path, { recursive: true, force: true });
  else fail('PUBLICATION_FAILED');
}

export function shouldSync(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.EVCRATE_DISABLE_FSYNC === '1') return false;
  if (process.env.NODE_TEST_CONTEXT !== undefined) return false;
  return true;
}

export function syncDirectory(path: string): void {
  if (process.platform === 'win32' || !shouldSync()) return;
  const descriptor = openSync(path, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function writeAtomicFileInternal(path: string, bytes: Uint8Array, executable = false): void {
  const destination = resolve(path);
  const parent = ensureParent(destination);
  assertNoSymlinkAncestors(parent);
  try {
    const existing = lstatSync(destination);
    if (existing.isSymbolicLink() || !existing.isFile()) fail('PATH_UNSAFE');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail('PATH_UNSAFE');
  }
  const temporary = join(parent, `.${basename(destination)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW);
    const buffer = Buffer.from(bytes);
    let offset = 0;
    while (offset < buffer.byteLength) offset += writeSync(descriptor, buffer, offset, buffer.byteLength - offset);
    if (shouldSync()) fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (executable && process.platform !== 'win32') {
      const current = lstatSync(temporary);
      chmodSync(temporary, current.mode | 0o111);
    }
    assertNoSymlinkAncestors(parent);
    try {
      const current = lstatSync(destination);
      if (current.isSymbolicLink() || !current.isFile()) fail('PATH_UNSAFE');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    renameSync(temporary, destination);
    syncDirectory(parent);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { removePath(temporary); } catch { /* preserve original failure */ }
    if (error instanceof ControlPlaneError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('PUBLICATION_FAILED');
    fail('PUBLICATION_FAILED');
  }
}

export function writeAtomicFile(path: string, bytes: Uint8Array): void {
  writeAtomicFileInternal(path, bytes, false);
}

/** Atomic writer for staged projections; supports optional additive executable bit. */
export function writeAtomicProjectionFile(path: string, bytes: Uint8Array, executable = false): void {
  writeAtomicFileInternal(path, bytes, executable);
}

export function sameVolume(source: string, destinationParent: string): boolean {
  if (process.platform === 'win32') {
    const srcRoot = parse(resolve(source)).root.toUpperCase();
    const dstRoot = parse(resolve(destinationParent)).root.toUpperCase();
    if (srcRoot && dstRoot) return srcRoot === dstRoot;
  }
  try { return statSync(source).dev === statSync(destinationParent).dev; } catch { return false; }
}

export interface StagedRoot { readonly path: string; readonly cleanup: () => void; }
type StagedIdentity = { readonly dev: number; readonly ino: number };
const STAGED_ROOTS = new WeakSet<object>();
const STAGED_ROOT_IDENTITIES = new WeakMap<object, StagedIdentity>();
export function assertStagedRoot(value: unknown): asserts value is StagedRoot {
  if (value === null || typeof value !== 'object' || !STAGED_ROOTS.has(value)) fail('PATH_UNSAFE');
  const stage = value as StagedRoot;
  const identity = STAGED_ROOT_IDENTITIES.get(value);
  if (!identity) fail('PATH_UNSAFE');
  assertNoSymlinkAncestors(stage.path);
  assertRealDirectory(stage.path);
  try {
    const current = lstatSync(stage.path);
    if (Number(current.dev) !== identity.dev || Number(current.ino) !== identity.ino) fail('PATH_UNSAFE');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PATH_UNSAFE');
  }
}
function cleanupStagedRoot(path: string, identity: StagedIdentity): void {
  const quarantine = join(dirname(path), `.${basename(path)}.cleanup-${randomBytes(16).toString('hex')}`);
  try {
    const current = lstatSync(path);
    if (!current.isDirectory() || current.isSymbolicLink()
      || Number(current.dev) !== identity.dev || Number(current.ino) !== identity.ino) fail('PATH_UNSAFE');
    assertRealDirectory(path);
    renameSync(path, quarantine);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
  try {
    const moved = lstatSync(quarantine);
    if (!moved.isDirectory() || moved.isSymbolicLink()
      || Number(moved.dev) !== identity.dev || Number(moved.ino) !== identity.ino) fail('PATH_UNSAFE');
    assertRealDirectory(quarantine);
    removePath(quarantine);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
}
function validatePrefix(prefix: string): void {
  if (!prefix || !/^[A-Za-z0-9._-]+$/u.test(prefix)) fail('PATH_UNSAFE');
}
export function createStagedRoot(repository: string, prefix = '.evcrate-build-'): StagedRoot {
  validatePrefix(prefix);
  const root = resolve(repository);
  assertRealDirectory(root);
  assertNoSymlinkAncestors(root);
  const parent = dirname(root);
  assertNoSymlinkAncestors(parent);
  let temporary: string;
  try { temporary = mkdtempSync(join(parent, prefix)); } catch { fail('PATH_UNSAFE'); }
  let identity: StagedIdentity | undefined;
  try {
    const current = lstatSync(temporary);
    if (!current.isDirectory() || current.isSymbolicLink()) fail('PATH_UNSAFE');
    identity = { dev: Number(current.dev), ino: Number(current.ino) };
    assertNoSymlinkAncestors(temporary);
  } catch {
    if (identity) {
      try { cleanupStagedRoot(temporary, identity); } catch { /* preserve original failure */ }
    }
    fail('PATH_UNSAFE');
  }
  if (!identity) fail('PATH_UNSAFE');
  const staged = Object.freeze({ path: temporary, cleanup: () => cleanupStagedRoot(temporary, identity) });
  STAGED_ROOTS.add(staged);
  STAGED_ROOT_IDENTITIES.set(staged, identity);
  return staged;
}
export function withStagedRoot<T>(repository: string, callback: (stage: string) => T, prefix = '.evcrate-build-'): T {
  const stage = createStagedRoot(repository, prefix);
  try { return callback(stage.path); } finally { stage.cleanup(); }
}

