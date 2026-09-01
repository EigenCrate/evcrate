import { createHash } from 'node:crypto';
import { lstatSync, renameSync, unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertExactKeys } from '../protocol/validation.js';
import { parseJsonDocument } from '../protocol/json.js';
import { assertNoSymlinkAncestors, assertOwnerOnlyDirectory } from '../filesystem/paths.js';
import { canonicalJsonBytes, readBoundedFile } from '../filesystem/hashing.js';
import { removePath, syncDirectory, writeAtomicFile } from '../filesystem/atomic.js';
import { withSettingsLock } from '../filesystem/locking.js';
export const ADVISOR_SETTINGS_JOURNAL_NAME = 'advisor-settings-journal.json';
export const ADVISOR_SETTINGS_BACKUP_PREFIX = '.advisor-settings-backup-';
export const ADVISOR_SETTINGS_STAGE_PREFIX = '.advisor-settings-stage-';
const MAX_SETTINGS_FILE_BYTES = 16 * 1024;
const STATUSES = ['prepared', 'backed_up', 'promoted'] as const;

export interface AdvisorPolicyJournalStage {
  readonly destination: string;
  readonly stagedPath: string;
  readonly bytes: Uint8Array;
  readonly mode: number;
  readonly journalRoot: string;
}
function fail(code: 'PATH_UNSAFE' | 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED'): never {
  throw new ControlPlaneError(code);
}
function file(path: string, code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' = 'PUBLICATION_FAILED') {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail(code);
  }
}
function transactionFile(path: string) {
  const stat = file(path, 'ROLLBACK_FAILED');
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile() || Number(stat.size) > MAX_SETTINGS_FILE_BYTES
    || (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid())
    || (process.platform !== 'win32' && (Number(stat.mode) & 0o077) !== 0)) fail('ROLLBACK_FAILED');
  return stat;
}
function journalPath(stateRoot: string): string { return resolve(stateRoot, ADVISOR_SETTINGS_JOURNAL_NAME); }
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

export function writeAdvisorPolicyJournal(stage: AdvisorPolicyJournalStage, backupPath: string | null, status: string): void {
  writeAtomicFile(journalPath(stage.journalRoot), canonicalJsonBytes({
    schema_version: 1, kind: 'advisor-settings', status, destination: stage.destination,
    staged_path: stage.stagedPath, backup_path: backupPath, originally_present: backupPath !== null,
    intended_digest: digest(stage.bytes), mode: stage.mode
  }), 0o600);
}
function journalValue(stateRoot: string): Record<string, unknown> | null {
  const path = journalPath(stateRoot);
  if (!transactionFile(path)) return null;
  try {
    const value = parseJsonDocument(readBoundedFile(path, MAX_SETTINGS_FILE_BYTES));
    if (value === null || Array.isArray(value) || typeof value !== 'object') fail('ROLLBACK_FAILED');
    const data = value as Record<string, unknown>;
    assertExactKeys(data, ['schema_version', 'kind', 'status', 'destination', 'staged_path', 'backup_path', 'originally_present', 'intended_digest', 'mode'], 'ROLLBACK_FAILED');
    return data;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('ROLLBACK_FAILED');
  }
}
function safeTransactionPath(destination: string, value: unknown, prefix: string): string {
  if (typeof value !== 'string') fail('ROLLBACK_FAILED');
  const path = resolve(value);
  if (path === resolve(destination) || dirname(path) !== dirname(destination) || !basename(path).startsWith(prefix)) fail('ROLLBACK_FAILED');
  try { assertNoSymlinkAncestors(path); } catch { fail('ROLLBACK_FAILED'); }
  return path;
}
function transactionBytes(path: string): Uint8Array {
  try { return readBoundedFile(path, MAX_SETTINGS_FILE_BYTES); }
  catch { fail('ROLLBACK_FAILED'); }
}

function secureDestinationParent(destination: string): void {
  try {
    assertNoSymlinkAncestors(dirname(destination));
    assertOwnerOnlyDirectory(dirname(destination));
  } catch { fail('ROLLBACK_FAILED'); }
}
export function recoverAdvisorPolicyUnlocked(stateRootValue: string): void {
  try {
    const stateRoot = resolve(stateRootValue);
    assertNoSymlinkAncestors(stateRoot);
    if (!file(stateRoot, 'ROLLBACK_FAILED')) return;
    assertOwnerOnlyDirectory(stateRoot);
    const data = journalValue(stateRoot);
    if (!data) return;
    if (data.schema_version !== 1 || data.kind !== 'advisor-settings' || !STATUSES.includes(data.status as typeof STATUSES[number])
      || typeof data.destination !== 'string' || typeof data.originally_present !== 'boolean'
      || typeof data.intended_digest !== 'string' || !/^[a-f0-9]{64}$/u.test(data.intended_digest)
      || !Number.isInteger(data.mode) || (data.mode as number) < 0 || (data.mode as number) > 0o777
      || ((data.mode as number) & 0o077) !== 0) fail('ROLLBACK_FAILED');
    const destination = resolve(data.destination);
    secureDestinationParent(destination);
    const stage = safeTransactionPath(destination, data.staged_path, ADVISOR_SETTINGS_STAGE_PREFIX);
    const backupValue = data.backup_path;
    if (backupValue !== null && typeof backupValue !== 'string') fail('ROLLBACK_FAILED');
    const backup = backupValue === null ? null : safeTransactionPath(destination, backupValue, ADVISOR_SETTINGS_BACKUP_PREFIX);
    if ((backup === null) !== (data.originally_present === false)) fail('ROLLBACK_FAILED');
    const destinationStat = transactionFile(destination);
    const backupStat = backup === null ? null : transactionFile(backup);
    const stageStat = transactionFile(stage);
    const status = data.status;
    const intended = data.intended_digest;
    if (stageStat && digest(transactionBytes(stage)) !== intended) fail('ROLLBACK_FAILED');
    if (status === 'promoted') {
      if (destinationStat && digest(transactionBytes(destination)) === intended) {
        if (backupStat && backup) removePath(backup);
      } else if (!destinationStat && backupStat && backup) {
        renameSync(backup, destination);
      } else {
        fail('ROLLBACK_FAILED');
      }
    } else if (backupStat && backup) {
      if (destinationStat) fail('ROLLBACK_FAILED');
      renameSync(backup, destination);
    } else if (data.originally_present && status !== 'prepared') {
      fail('ROLLBACK_FAILED');
    } else if (!data.originally_present && destinationStat) {
      fail('ROLLBACK_FAILED');
    }
    if (stageStat) removePath(stage);
    const journal = journalPath(stateRoot);
    if (transactionFile(journal)) unlinkSync(journal);
    syncDirectory(dirname(destination));
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'ROLLBACK_FAILED') throw error;
    fail('ROLLBACK_FAILED');
  }
}
export function recoverAdvisorPolicy(stateRootValue: string): void {
  withSettingsLock(stateRootValue, () => recoverAdvisorPolicyUnlocked(stateRootValue));
}

export function clearAdvisorPolicyJournal(stateRoot: string): void {
  const root = resolve(stateRoot);
  try {
    assertNoSymlinkAncestors(root);
    if (!file(root, 'ROLLBACK_FAILED')) return;
    assertOwnerOnlyDirectory(root);
    const path = journalPath(root);
    if (transactionFile(path)) unlinkSync(path);
    syncDirectory(root);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.code === 'ROLLBACK_FAILED') throw error;
    fail('ROLLBACK_FAILED');
  }
}
