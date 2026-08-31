import { constants, chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument } from '../protocol/json.js';
import { assertNoSymlinkAncestors, assertOwnerControlledDirectory, assertOwnerOnlyFile, assertRealDirectory } from './paths.js';
import { canonicalJsonBytes, readBoundedFile } from './hashing.js';
import { writeAtomicFile } from './atomic.js';

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
export const PUBLISH_LOCK_NAME = 'publish.lock';
export const SETTINGS_LOCK_NAME = 'advisor-settings.lock';
export const RELEASE_MARKER_NAME = 'release-marker.json';
const MAX_MARKER_BYTES = 4 * 1024 * 1024;

type LockMetadata = { pid: number; startedAt: number; token: string; processStart: string | null };
type LockState = LockMetadata & { dev: number; ino: number };

function fail(code: 'PATH_UNSAFE' | 'PUBLICATION_FAILED'): never {
  throw new ControlPlaneError(code);
}

function secureStateDirectory(path: string): string {
  const root = resolve(path);
  assertNoSymlinkAncestors(root);
  try { assertOwnerControlledDirectory(root); } catch (error) {
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
      chmodSync(root, 0o700);
    } else throw error;
  }
  assertRealDirectory(root);
  if (process.platform !== 'win32') chmodSync(root, 0o700);
  return root;
}

function processStartToken(pid: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = stat.lastIndexOf(')');
    return end < 0 ? null : (stat.slice(end + 2).trim().split(/\s+/u)[19] ?? null);
  } catch { return null; }
}

function processAlive(metadata: LockMetadata): boolean {
  if (!Number.isSafeInteger(metadata.pid) || metadata.pid <= 0) return true;
  try { process.kill(metadata.pid, 0); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    return true;
  }
  if (process.platform === 'linux' && metadata.processStart === null) return true;
  const current = processStartToken(metadata.pid);
  return current === null || current === metadata.processStart;
}

function readLockMetadata(path: string): LockState | false {
  try {
    const initial = assertOwnerOnlyFile(path);
    const value = parseJsonDocument(readBoundedFile(path, 4096));
    if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (!Number.isSafeInteger(record.pid) || !Number.isSafeInteger(record.startedAt) || typeof record.token !== 'string'
      || !/^[a-f0-9]{32}$/u.test(record.token)
      || (record.processStart !== undefined && record.processStart !== null && typeof record.processStart !== 'string')) return false;
    const final = assertOwnerOnlyFile(path);
    if (Number(initial.dev) !== Number(final.dev) || Number(initial.ino) !== Number(final.ino)
      || Number(initial.size) !== Number(final.size)) return false;
    return {
      pid: record.pid as number, startedAt: record.startedAt as number, token: record.token,
      processStart: record.processStart === undefined ? null : record.processStart as string | null,
      dev: Number(final.dev), ino: Number(final.ino)
    };
  } catch { return false; }
}

function quarantineStaleLock(path: string, current: LockState): boolean {
  const quarantine = join(dirname(path), `.${basename(path)}.stale-${randomBytes(16).toString('hex')}`);
  try { renameSync(path, quarantine); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    fail('PUBLICATION_FAILED');
  }
  const moved = readLockMetadata(quarantine);
  if (moved === false || moved.token !== current.token || moved.dev !== current.dev || moved.ino !== current.ino) {
    fail('PUBLICATION_FAILED');
  }
  try { unlinkSync(quarantine); } catch { fail('PUBLICATION_FAILED'); }
  return true;
}
function acquireLock(stateRoot: string, name: string): () => void {
  const root = secureStateDirectory(stateRoot);
  const path = join(root, name);
  assertNoSymlinkAncestors(path);
  let descriptor: number | undefined;
  const token = randomBytes(16).toString('hex');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW, 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') fail('PUBLICATION_FAILED');
      const current = readLockMetadata(path);
      if (current === false || processAlive(current)) fail('PUBLICATION_FAILED');
      quarantineStaleLock(path, current);
    }
  }
  if (descriptor === undefined) fail('PUBLICATION_FAILED');
  const metadata = canonicalJsonBytes({
    pid: process.pid, startedAt: Date.now(), token, processStart: processStartToken(process.pid)
  });
  try {
    writeSync(descriptor, metadata);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  const acquired = readLockMetadata(path);
  if (acquired === false || acquired.token !== token) fail('PUBLICATION_FAILED');
  const identity = { dev: acquired.dev, ino: acquired.ino };
  return () => {
    try {
      const current = readLockMetadata(path);
      if (current !== false && current.token === token && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(path);
    } catch { /* preserve an uncertain lock for manual recovery */ }
  };
}

export function withLock<T>(stateRoot: string, name: string, callback: () => T): T {
  const release = acquireLock(stateRoot, name);
  try { return callback(); } finally { release(); }
}

export function withPublishLock<T>(stateRoot: string, callback: () => T): T {
  return withLock(stateRoot, PUBLISH_LOCK_NAME, callback);
}

export function withSettingsLock<T>(stateRoot: string, callback: () => T): T {
  return withLock(stateRoot, SETTINGS_LOCK_NAME, callback);
}

function markerPath(stateRoot: string): string {
  const root = secureStateDirectory(stateRoot);
  return join(root, RELEASE_MARKER_NAME);
}

export function readReleaseMarker(stateRoot: string): Record<string, unknown> {
  const path = markerPath(stateRoot);
  try {
    const value = parseJsonDocument(readBoundedFile(path, MAX_MARKER_BYTES));
    if (value === null || Array.isArray(value) || typeof value !== 'object') fail('PUBLICATION_FAILED');
    const marker = value as Record<string, unknown>;
    if (marker.schema_version !== 1) fail('PUBLICATION_FAILED');
    return marker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schema_version: 1, status: 'none', roots: {}, managed_paths: {} };
    }
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
}

export function writeReleaseMarker(stateRoot: string, marker: Record<string, unknown>): void {
  if (marker.schema_version !== 1) fail('PUBLICATION_FAILED');
  const path = markerPath(stateRoot);
  writeAtomicFile(path, canonicalJsonBytes(marker), 0o600);
}
