import { randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { validateSettingsRevision, canonicalAdvisorPolicy, type AdvisorPolicy, type SettingsRevision } from '../protocol/advisor-settings.js';
import { assertNoSymlinkAncestors, assertOwnerOnlyDirectory } from '../filesystem/paths.js';
import { removePath, syncDirectory, writeAtomicFile } from '../filesystem/atomic.js';
import { withSettingsLock } from '../filesystem/locking.js';
import { ensureAdvisorPolicyParent, readAdvisorPolicy, revisionsEqual, type AdvisorPolicySnapshot } from './policy-files.js';
import {
  ADVISOR_SETTINGS_BACKUP_PREFIX, ADVISOR_SETTINGS_STAGE_PREFIX,
  clearAdvisorPolicyJournal, recoverAdvisorPolicyUnlocked, writeAdvisorPolicyJournal
} from './recovery.js';

export { ADVISOR_SETTINGS_JOURNAL_NAME, recoverAdvisorPolicy } from './recovery.js';

export interface AdvisorPolicyStage {
  readonly destination: string;
  readonly stagedPath: string;
  readonly bytes: Uint8Array;
  readonly expectedRevision: SettingsRevision;
  readonly mode: number;
  readonly journalRoot: string;
}
export interface AdvisorPolicyHooks {
  readonly beforeBackup?: () => void;
  readonly afterBackup?: () => void;
  readonly beforePromote?: () => void;
  readonly afterPromote?: () => void;
}
export interface AdvisorPolicyOptions {
  readonly stateRoot?: string;
  readonly hooks?: AdvisorPolicyHooks;
}

function fail(code: 'CAS_CONFLICT' | 'SETTINGS_INVALID' | 'PATH_UNSAFE' | 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED'): never {
  throw new ControlPlaneError(code);
}
function file(path: string, code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' = 'PUBLICATION_FAILED'): ReturnType<typeof lstatSync> | null {
  try { return lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail(code);
  }
}
function ownedTransactionFile(path: string): ReturnType<typeof lstatSync> | null {
  const stat = file(path, 'ROLLBACK_FAILED');
  if (stat && (stat.isSymbolicLink() || !stat.isFile()
    || (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid())
    || (process.platform !== 'win32' && (Number(stat.mode) & 0o077) !== 0))) fail('ROLLBACK_FAILED');
  return stat;
}
function stateRootFor(destination: string, configured?: string): string {
  return resolve(configured ?? join(dirname(destination), '.advisor-settings'));
}
function ensureStateRoot(value: string): string {
  const state = resolve(value);
  assertNoSymlinkAncestors(state);
  try { mkdirSync(state, { recursive: true, mode: 0o700 }); } catch { fail('PATH_UNSAFE'); }
  try { assertOwnerOnlyDirectory(state); } catch { fail('PATH_UNSAFE'); }
  if (process.platform !== 'win32') chmodSync(state, 0o700);
  return state;
}
function expected(snapshot: AdvisorPolicySnapshot, revision: SettingsRevision): void {
  const requested = validateSettingsRevision(revision);
  if (!revisionsEqual(snapshot.revision, requested)) fail('CAS_CONFLICT');
}
function stageBytes(policy: AdvisorPolicy): Uint8Array {
  return canonicalAdvisorPolicy(policy).bytes;
}
function stageUnlocked(destinationValue: string, policy: AdvisorPolicy, revision: SettingsRevision, stateRootValue: string): AdvisorPolicyStage {
  const destination = resolve(destinationValue);
  const state = ensureStateRoot(stateRootValue);
  const snapshot = readAdvisorPolicy(destination);
  expected(snapshot, revision);
  const parent = ensureAdvisorPolicyParent(destination);
  const stagedPath = resolve(parent, `${ADVISOR_SETTINGS_STAGE_PREFIX}${process.pid}-${randomBytes(8).toString('hex')}`);
  const bytes = stageBytes(policy);
  writeAtomicFile(stagedPath, bytes, snapshot.mode?.mode ?? 0o600);
  return Object.freeze({ destination, stagedPath, bytes: Uint8Array.from(bytes), expectedRevision: revision,
    mode: snapshot.mode?.mode ?? 0o600, journalRoot: state });
}

export function stageAdvisorPolicy(
  destination: string, policyValue: unknown, expectedRevision: SettingsRevision, options: AdvisorPolicyOptions = {}
): AdvisorPolicyStage {
  const revision = validateSettingsRevision(expectedRevision);
  let policy: AdvisorPolicy;
  try { policy = canonicalAdvisorPolicy(policyValue).policy; } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('SETTINGS_INVALID');
  }
  const destinationPath = resolve(destination);
  const stateRoot = stateRootFor(destinationPath, options.stateRoot);
  return withSettingsLock(stateRoot, () => {
    const state = ensureStateRoot(stateRoot);
    recoverAdvisorPolicyUnlocked(state);
    return stageUnlocked(destinationPath, policy, revision, state);
  });
}

function assertAbsent(destination: string): void {
  if (readAdvisorPolicy(destination).revision.kind !== 'absent') fail('CAS_CONFLICT');
}

function applyUnlocked(destination: string, policy: AdvisorPolicy, revision: SettingsRevision, options: AdvisorPolicyOptions): AdvisorPolicySnapshot {
  const stateRoot = ensureStateRoot(stateRootFor(destination, options.stateRoot));
  recoverAdvisorPolicyUnlocked(stateRoot);
  let stage: AdvisorPolicyStage | null = null;
  let backup: string | null = null;
  try {
    const currentStage = stageUnlocked(destination, policy, revision, stateRoot);
    stage = currentStage;
    expected(readAdvisorPolicy(destination), revision);
    const current = readAdvisorPolicy(destination);
    backup = current.bytes === null ? null : resolve(dirname(destination), `${ADVISOR_SETTINGS_BACKUP_PREFIX}${process.pid}-${randomBytes(8).toString('hex')}`);
    writeAdvisorPolicyJournal(currentStage, backup, 'prepared');
    options.hooks?.beforeBackup?.();
    expected(readAdvisorPolicy(destination), revision);
    if (backup !== null) renameSync(destination, backup);
    writeAdvisorPolicyJournal(currentStage, backup, 'backed_up');
    options.hooks?.afterBackup?.();
    options.hooks?.beforePromote?.();
    assertAbsent(destination);
    renameSync(currentStage.stagedPath, destination);
    writeAdvisorPolicyJournal(currentStage, backup, 'promoted');
    options.hooks?.afterPromote?.();
    const promoted = readAdvisorPolicy(destination);
    if (!promoted.bytes || !Buffer.from(promoted.bytes).equals(Buffer.from(currentStage.bytes))
      || promoted.mode?.mode !== currentStage.mode) fail('CAS_CONFLICT');
  } catch (error) {
    try {
      recoverAdvisorPolicyUnlocked(stateRoot);
      if (stage && ownedTransactionFile(stage.stagedPath)) unlinkSync(stage.stagedPath);
    } catch { fail('ROLLBACK_FAILED'); }
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
  if (backup && ownedTransactionFile(backup)) removePath(backup);
  clearAdvisorPolicyJournal(stateRoot);
  syncDirectory(dirname(destination));
  return readAdvisorPolicy(destination);
}

/** Internal transaction entry point for callers holding advisor-settings.lock. */
export function applyAdvisorPolicyUnlocked(
  destinationValue: string, policy: AdvisorPolicy, expectedRevision: SettingsRevision, options: AdvisorPolicyOptions = {}
): AdvisorPolicySnapshot {
  return applyUnlocked(resolve(destinationValue), policy, expectedRevision, options);
}

export function applyAdvisorPolicy(
  destinationValue: string, policyValue: unknown, expectedRevision: SettingsRevision, options: AdvisorPolicyOptions = {}
): AdvisorPolicySnapshot {
  const revision = validateSettingsRevision(expectedRevision);
  let policy: AdvisorPolicy;
  try { policy = canonicalAdvisorPolicy(policyValue).policy; } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('SETTINGS_INVALID');
  }
  const destination = resolve(destinationValue);
  const stateRoot = stateRootFor(destination, options.stateRoot);
  return withSettingsLock(stateRoot, () => applyUnlocked(destination, policy, revision, options));
}

export function discardAdvisorPolicyStage(stage: AdvisorPolicyStage): void {
  const destination = resolve(stage.destination);
  const path = resolve(stage.stagedPath);
  if (path === destination || dirname(path) !== dirname(destination)
    || !basename(path).startsWith(ADVISOR_SETTINGS_STAGE_PREFIX)) fail('PATH_UNSAFE');
  assertNoSymlinkAncestors(path);
  if (ownedTransactionFile(path)) removePath(path);
}
