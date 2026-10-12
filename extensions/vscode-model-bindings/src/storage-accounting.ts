import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  UUID_V4
} from './runtime-contracts.js';

const MAX_INSTANCE_MIB = Math.round(STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceBytes / (1024 * 1024));
const MAX_AUTHORITY_MIB = Math.round(STORAGE_AND_SOURCE_BOUNDS.maxPersistentAuthorityBytes / (1024 * 1024));

export const CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE =
  `Storage budget exhausted (max ${STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceGenerations} active generations / ${MAX_INSTANCE_MIB} MiB per window instance, ${MAX_AUTHORITY_MIB} MiB persistent authority store). Close all VS Code windows/processes and retire referencing chat sessions before manually removing resolved/ generation directories; window reload does not clean storage. User bindings and published .evcrate-vscode roots are preserved.`;

export const MAX_STORAGE_SCAN_ENTRIES = 65_536;

export interface StorageBudgetUsage {
  readonly activeInstanceGenerations: number;
  readonly activeInstanceBytes: number;
  readonly persistentAuthorityBytes: number;
}

export function formatStorageCleanupGuidance(baseStorageFsPath?: string | null): string {
  if (!baseStorageFsPath || baseStorageFsPath.trim() === '') {
    return CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE;
  }
  return `${CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE} Target storage path: ${join(baseStorageFsPath, 'resolved')}`;
}

export function cleanStaleStagingDirectories(baseStorageFsPath: string, staleAfterMs = 30_000): number {
  if (!baseStorageFsPath || !existsSync(baseStorageFsPath)) return 0;
  let removed = 0;
  const now = Date.now();
  for (const name of readdirSync(baseStorageFsPath)) {
    if (!name.startsWith('.staging-') && !name.startsWith('.stale-lock-')) continue;
    const full = join(baseStorageFsPath, name);
    try {
      const st = lstatSync(full);
      if (st.isSymbolicLink()) {
        throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in base storage: "${full}"`);
      }
      if (st.isDirectory() && now - st.mtimeMs >= staleAfterMs) {
        rmSync(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch (err) {
      if (err instanceof CompanionContractError) throw err;
    }
  }
  return removed;
}

export function inspectAuthorityStorageUsage(
  baseStorageFsPath: string,
  instanceUuid: string,
  options?: { readonly maxScanEntries?: number }
): StorageBudgetUsage {
  if (!baseStorageFsPath || baseStorageFsPath.trim() === '') {
    throw new CompanionContractError('PATH_UNSAFE', 'Invalid baseStorageFsPath');
  }
  if (!UUID_V4.test(instanceUuid)) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Invalid instanceUuid');
  }
  if (!existsSync(baseStorageFsPath)) {
    return Object.freeze({ activeInstanceGenerations: 0, activeInstanceBytes: 0, persistentAuthorityBytes: 0 });
  }
  const maxEntries = options?.maxScanEntries ?? MAX_STORAGE_SCAN_ENTRIES;
  const normalizedInstance = instanceUuid.toLowerCase();
  let scannedEntries = 0;
  let activeInstanceGenerations = 0;
  let activeInstanceBytes = 0;
  let persistentAuthorityBytes = 0;

  const bumpEntry = (): void => {
    scannedEntries += 1;
    if (scannedEntries > maxEntries) {
      throw new CompanionContractError('BOUNDS_EXCEEDED', `Storage scan exceeded ${maxEntries} entry bound`);
    }
  };

  const sumDirectoryBytes = (dirPath: string): number => {
    let bytes = 0;
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch (err) {
      throw new CompanionContractError('PATH_UNSAFE', `Unreadable storage directory "${dirPath}": ${String(err)}`);
    }
    for (const name of entries) {
      bumpEntry();
      const full = join(dirPath, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) {
        throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in derived storage: "${full}"`);
      }
      if (st.isDirectory()) {
        bytes += sumDirectoryBytes(full);
      } else if (st.isFile()) {
        bytes += st.size;
      }
    }
    return bytes;
  };

  const baseStat = lstatSync(baseStorageFsPath);
  if (baseStat.isSymbolicLink() || !baseStat.isDirectory()) {
    throw new CompanionContractError('PATH_UNSAFE', 'baseStorageFsPath must be a real directory');
  }
  for (const topName of readdirSync(baseStorageFsPath)) {
    if (topName === '.authority-stage.lock' || topName.startsWith('.stale-lock-')) continue;
    bumpEntry();
    const topFull = join(baseStorageFsPath, topName);
    const topStat = lstatSync(topFull);
    if (topStat.isSymbolicLink()) {
      throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in base storage: "${topFull}"`);
    }
    if (topName.startsWith('.staging-') && topStat.isDirectory()) {
      const stagingBytes = sumDirectoryBytes(topFull);
      persistentAuthorityBytes += stagingBytes;
      if (topName.startsWith(`.staging-${normalizedInstance}-`)) {
        activeInstanceBytes += stagingBytes;
      }
    }
  }

  const resolvedDir = join(baseStorageFsPath, 'resolved');
  if (existsSync(resolvedDir)) {
    const resStat = lstatSync(resolvedDir);
    if (resStat.isSymbolicLink() || !resStat.isDirectory()) {
      throw new CompanionContractError('PATH_UNSAFE', 'resolved storage path must be a non-symlink directory');
    }
    for (const rootHash of readdirSync(resolvedDir)) {
      bumpEntry();
      const rootPath = join(resolvedDir, rootHash);
      const rootStat = lstatSync(rootPath);
      if (rootStat.isSymbolicLink()) {
        throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in resolved storage: "${rootPath}"`);
      }
      if (!rootStat.isDirectory()) {
        if (rootStat.isFile()) persistentAuthorityBytes += rootStat.size;
        continue;
      }
      for (const ownerUuid of readdirSync(rootPath)) {
        bumpEntry();
        const ownerPath = join(rootPath, ownerUuid);
        const ownerStat = lstatSync(ownerPath);
        if (ownerStat.isSymbolicLink()) {
          throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in instance directory: "${ownerPath}"`);
        }
        if (!ownerStat.isDirectory()) {
          if (ownerStat.isFile()) persistentAuthorityBytes += ownerStat.size;
          continue;
        }
        const isCurrentOwner = ownerUuid.toLowerCase() === normalizedInstance;
        for (const genName of readdirSync(ownerPath)) {
          bumpEntry();
          const genPath = join(ownerPath, genName);
          const genStat = lstatSync(genPath);
          if (genStat.isSymbolicLink()) {
            throw new CompanionContractError('PATH_UNSAFE', `Symlink forbidden in generation entry: "${genPath}"`);
          }
          if (!genStat.isDirectory()) {
            if (genStat.isFile()) persistentAuthorityBytes += genStat.size;
            continue;
          }
          const genBytes = sumDirectoryBytes(genPath);
          persistentAuthorityBytes += genBytes;
          if (isCurrentOwner && genName.startsWith('gen-')) {
            activeInstanceGenerations += 1;
            activeInstanceBytes += genBytes;
          }
        }
      }
    }
  }

  return Object.freeze({ activeInstanceGenerations, activeInstanceBytes, persistentAuthorityBytes });
}
