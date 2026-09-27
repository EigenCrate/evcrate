import { mkdirSync, mkdtempSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertDirectoryPath, assertNoSymlinkAncestors, assertRealDirectory, isContained } from '../filesystem/paths.js';
import { canonicalJsonBytes } from '../filesystem/hashing.js';
import { assertStagedRoot, removePath, sameVolume, syncDirectory, writeAtomicFile, type StagedRoot } from '../filesystem/atomic.js';
import { withPublishLock } from '../filesystem/locking.js';
import {
  assertSnapshot, PROMOTION_BACKUP_PREFIX, PROMOTION_JOURNAL_NAME, recoverPromotionJournal, snapshot, type NodeSnapshot
} from './promotion-recovery.js';
export { PROMOTION_BACKUP_PREFIX, PROMOTION_JOURNAL_NAME } from './promotion-recovery.js';
export interface PromotionPair { readonly source: string | null; readonly destination: string; }
export interface PromotionHooks {
  readonly beforeBackup?: (pair: PromotionPair, index: number) => void;
  readonly afterBackup?: (pair: PromotionPair, index: number) => void;
  readonly beforePromote?: (pair: PromotionPair, index: number) => void;
  readonly afterPromote?: (pair: PromotionPair, index: number) => void;
}
export type PromotionConflictCode = 'PUBLICATION_FAILED' | 'CAS_CONFLICT';
function fail(code: 'PUBLICATION_FAILED' | 'ROLLBACK_FAILED' | 'PATH_UNSAFE'): never { throw new ControlPlaneError(code); }
export interface PromotionOptions {
  readonly stageRoot?: StagedRoot;
  readonly hooks?: PromotionHooks;
  readonly lockRoot?: string;
  readonly conflictCode?: PromotionConflictCode;
}
function commonAncestor(paths: readonly string[]): string {
  const split = paths.map((path) => resolve(path).split(sep));
  const count = Math.min(...split.map((parts) => parts.length));
  let index = 0;
  while (index < count && split.every((parts) => parts[index] === split[0][index])) index += 1;
  const candidate = split[0].slice(0, Math.max(index, 1)).join(sep) || sep;
  assertRealDirectory(candidate);
  return candidate;
}
function promoteUnlocked(pairs: readonly PromotionPair[], options: PromotionOptions, commonParent: string): void {
  const destinations = pairs.map((pair) => resolve(pair.destination));
  const sources = pairs.map((pair) => pair.source === null ? null : resolve(pair.source));
  const stageRoot = options.stageRoot ?? null;
  const conflictCode = options.conflictCode ?? 'PUBLICATION_FAILED';
  const sourcePaths = sources.filter((source): source is string => source !== null);
  if (new Set(destinations).size !== destinations.length || new Set(sourcePaths).size !== sourcePaths.length) fail('PUBLICATION_FAILED');
  recoverPromotionJournal(commonParent);
  if (sourcePaths.length) {
    if (!stageRoot) fail('PATH_UNSAFE');
    assertStagedRoot(stageRoot);
  }
  for (const [index, pair] of pairs.entries()) {
    const destination = destinations[index];
    assertNoSymlinkAncestors(dirname(destination));
    assertDirectoryPath(commonParent, dirname(destination));
    if (!relative(commonParent, destination) || (stageRoot && (isContained(stageRoot.path, destination) || isContained(destination, stageRoot.path)))) fail('PATH_UNSAFE');
    if (pair.source !== null) {
      const source = sources[index] as string;
      if (!stageRoot || !isContained(stageRoot.path, source) || source === destination || !sameVolume(source, dirname(destination))) fail('PATH_UNSAFE');
      if (!stageRoot) fail('PATH_UNSAFE');
      assertDirectoryPath(stageRoot.path, dirname(source));
    }
  }
  const sourceSnapshots = sources.map((source) => source === null ? null : snapshot(source, 'PATH_UNSAFE'));
  const destinationSnapshots = destinations.map((destination) => snapshot(destination, 'PATH_UNSAFE'));
  const backupDir = mkdtempSync(join(commonParent, PROMOTION_BACKUP_PREFIX));
  const journal = {
    backup_dir: relative(commonParent, backupDir).split(sep).join('/'),
    destinations: destinations.map((destination) => relative(commonParent, destination).split(sep).join('/')),
    originally_present: destinationSnapshots.map((destination) => destination.present),
    intended_hashes: sourceSnapshots.map((source) => source?.digest ?? null), committed: false
  };
  writeAtomicFile(join(commonParent, PROMOTION_JOURNAL_NAME), canonicalJsonBytes(journal));
  try {
    for (const [index, pair] of pairs.entries()) {
      const destination = destinations[index];
      assertSnapshot(destination, destinationSnapshots[index], conflictCode);
      options.hooks?.beforeBackup?.(pair, index);
      assertSnapshot(destination, destinationSnapshots[index], conflictCode);
      if (destinationSnapshots[index].present) {
        const backup = join(backupDir, relative(commonParent, destination));
        mkdirSync(dirname(backup), { recursive: true });
        assertNoSymlinkAncestors(dirname(backup));
        renameSync(destination, backup);
      }
      options.hooks?.afterBackup?.(pair, index);
      options.hooks?.beforePromote?.(pair, index);
      assertSnapshot(destination, { present: false }, conflictCode);
      if (pair.source !== null) {
        assertSnapshot(sources[index] as string, sourceSnapshots[index] as NodeSnapshot, conflictCode);
        renameSync(sources[index] as string, destination);
      }
      options.hooks?.afterPromote?.(pair, index);
    }
    writeAtomicFile(join(commonParent, PROMOTION_JOURNAL_NAME), canonicalJsonBytes({ ...journal, committed: true }));
    unlinkSync(join(commonParent, PROMOTION_JOURNAL_NAME));
    syncDirectory(commonParent);
    removePath(backupDir);
  } catch (error) {
    try { recoverPromotionJournal(commonParent); } catch { fail('ROLLBACK_FAILED'); }
    if (error instanceof ControlPlaneError) throw error;
    fail('PUBLICATION_FAILED');
  }
}
export function recoverInterruptedPromotion(commonParentValue: string, lockRoot?: string): void {
  const commonParent = resolve(commonParentValue);
  const stateRoot = resolve(lockRoot ?? join(commonParent, '.evcrate-publish-state'));
  withPublishLock(stateRoot, () => recoverPromotionJournal(commonParent));
}
export function promoteTransaction(pairs: readonly PromotionPair[], options: PromotionOptions = {}): void {
  if (!pairs.length) return;
  const commonParent = commonAncestor(pairs.map((pair) => dirname(resolve(pair.destination))));
  const stateRoot = resolve(options.lockRoot ?? join(commonParent, '.evcrate-publish-state'));
  withPublishLock(stateRoot, () => promoteUnlocked(pairs, options, commonParent));
}
export { withStagedRoot, createStagedRoot } from '../filesystem/atomic.js';
