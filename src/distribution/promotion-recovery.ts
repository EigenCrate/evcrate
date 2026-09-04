import { lstatSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject, parseJsonDocument } from '../protocol/json.js';
import { assertOwnerControlledDirectory, assertOwnerControlledPath, containedPath, assertNoSymlinkAncestors } from '../filesystem/paths.js';
import { canonicalJsonBytes, hashFile, readBoundedFile, treeHash } from '../filesystem/hashing.js';
import { removePath, syncDirectory } from '../filesystem/atomic.js';

export const PROMOTION_JOURNAL_NAME = '.evcrate-promotion-journal.json';
export const PROMOTION_BACKUP_PREFIX = '.evcrate-promotion-';
type FailureCode = 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'CAS_CONFLICT' | 'PATH_UNSAFE';
function fail(code: FailureCode): never { throw new ControlPlaneError(code); }
function stat(path: string, code: FailureCode = 'ROLLBACK_FAILED') {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail(code);
  }
}
function ownedNode(path: string, code: FailureCode = 'ROLLBACK_FAILED') {
  const value = stat(path, code);
  if (!value) return null;
  if (value.isSymbolicLink() || (!value.isFile() && !value.isDirectory())) fail(code);
  return value;
}
function journalPath(commonParent: string): string { return join(commonParent, PROMOTION_JOURNAL_NAME); }
function journalData(commonParent: string): Record<string, unknown> {
  try {
    const value = parseJsonDocument(readBoundedFile(journalPath(commonParent), 64 * 1024));
    if (!isPlainObject(value)) fail('ROLLBACK_FAILED');
    const data = value as Record<string, unknown>;
    const allowed = ['backup_dir', 'destinations', 'originally_present', 'intended_hashes', 'committed'];
    if (Object.keys(data).some((key) => !allowed.includes(key))
      || !['backup_dir', 'destinations', 'originally_present'].every((key) => Object.hasOwn(data, key))) fail('ROLLBACK_FAILED');
    return data;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'ROLLBACK_FAILED') throw error;
    fail('ROLLBACK_FAILED');
  }
}
function safeJournalPath(commonParent: string, value: unknown): string {
  if (typeof value !== 'string') fail('ROLLBACK_FAILED');
  try {
    const path = containedPath(commonParent, value);
    if (dirname(path) !== commonParent || !path.split('/').at(-1)?.startsWith(PROMOTION_BACKUP_PREFIX)) fail('ROLLBACK_FAILED');
    assertNoSymlinkAncestors(path);
    return path;
  } catch { fail('ROLLBACK_FAILED'); }
}
function digestPath(path: string): string {
  const value = ownedNode(path);
  if (!value) fail('ROLLBACK_FAILED');
  try { return value.isDirectory() ? treeHash(path) : hashFile(path); }
  catch { fail('ROLLBACK_FAILED'); }
}
function intendedHashes(data: Record<string, unknown>, length: number): Array<string | null> {
  if (data.intended_hashes === undefined) return Array.from({ length }, () => null);
  if (!Array.isArray(data.intended_hashes) || data.intended_hashes.length !== length) fail('ROLLBACK_FAILED');
  return data.intended_hashes.map((value) => value === null ? null
    : typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value) ? value : fail('ROLLBACK_FAILED'));
}
export type NodeSnapshot = { present: boolean; kind?: 'file' | 'directory'; dev?: number; ino?: number; size?: number; mode?: number; digest?: string };
export function snapshot(path: string, code: FailureCode): NodeSnapshot {
  const node = ownedNode(path, code);
  if (!node) return { present: false };
  try {
    return { present: true, kind: node.isDirectory() ? 'directory' : 'file', dev: Number(node.dev), ino: Number(node.ino),
      size: Number(node.size), mode: Number(node.mode) & 0o777, digest: node.isDirectory() ? treeHash(path) : hashFile(path) };
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === code) throw error;
    fail(code);
  }
}
export function assertSnapshot(path: string, expected: NodeSnapshot, code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'CAS_CONFLICT'): void {
  if (JSON.stringify(snapshot(path, code)) !== JSON.stringify(expected)) fail(code);
}
export function recoverPromotionJournal(commonParent: string): void {
  assertOwnerControlledDirectory(commonParent);
  const path = journalPath(commonParent);
  if (!ownedNode(path, 'ROLLBACK_FAILED')) return;
  const data = journalData(commonParent);
  if (typeof data.backup_dir !== 'string' || !Array.isArray(data.destinations)
    || !Array.isArray(data.originally_present) || data.destinations.length !== data.originally_present.length
    || !data.originally_present.every((entry) => typeof entry === 'boolean')
    || (data.committed !== undefined && typeof data.committed !== 'boolean')) fail('ROLLBACK_FAILED');
  const backupDir = safeJournalPath(commonParent, data.backup_dir);
  const backupValue = ownedNode(backupDir);
  if (backupValue && !backupValue.isDirectory()) fail('ROLLBACK_FAILED');
  const destinations = data.destinations.map((value) => {
    try { return containedPath(commonParent, value); } catch { fail('ROLLBACK_FAILED'); }
  });
  if (new Set(destinations).size !== destinations.length || destinations.some((value) => relative(commonParent, value) === '')) fail('ROLLBACK_FAILED');
  const originallyPresent = data.originally_present as boolean[];
  const intended = intendedHashes(data, destinations.length);
  const committed = data.committed === true;
  for (const destination of destinations) {
    try { assertNoSymlinkAncestors(dirname(destination)); assertOwnerControlledPath(commonParent, dirname(destination)); }
    catch { fail('ROLLBACK_FAILED'); }
  }
  for (let index = destinations.length - 1; index >= 0; index -= 1) {
    const destination = destinations[index];
    const backup = join(backupDir, relative(commonParent, destination));
    try { assertNoSymlinkAncestors(backup); } catch { fail('ROLLBACK_FAILED'); }
    const backupStat = ownedNode(backup);
    const destinationStat = ownedNode(destination);
    if (committed) {
      if (intended[index] === null ? destinationStat : !destinationStat || digestPath(destination) !== intended[index]) fail('ROLLBACK_FAILED');
      if (backupStat) removePath(backup);
    } else if (backupStat) {
      if (destinationStat) {
        if (intended[index] === null || digestPath(destination) !== intended[index]) fail('ROLLBACK_FAILED');
        removePath(destination);
      }
      renameSync(backup, destination);
    } else if (originallyPresent[index] || destinationStat) fail('ROLLBACK_FAILED');
  }
  unlinkSync(path);
  if (ownedNode(backupDir)) removePath(backupDir);
  syncDirectory(commonParent);
}
