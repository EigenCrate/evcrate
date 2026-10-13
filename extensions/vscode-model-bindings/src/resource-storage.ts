import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  buildGenerationStoragePath,
  evaluateStorageBudget,
  isPlainObject
} from './runtime-contracts.js';
import type { RenderedAgentResult } from './agent-renderer.js';
import {
  CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE,
   cleanStaleStagingDirectories,
  formatStorageCleanupGuidance,
  inspectAuthorityStorageUsage,
  type StorageBudgetUsage
} from './storage-accounting.js';

export type { StorageBudgetUsage };

export interface StageGenerationInput {
  readonly baseStorageFsPath: string;
  readonly rootIdentity: string;
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly renderedAgents: readonly RenderedAgentResult[];
  readonly currentUsage?: StorageBudgetUsage;
  readonly maxScanEntries?: number;
  readonly lockStaleAfterMs?: number;
  readonly lockRetryAttempts?: number;
  readonly lockRetryDelayMs?: number;
}

export interface StagedGenerationResult {
  readonly generationFsPath: string;
  readonly publishedActorFiles: Readonly<Record<string, string>>;
  readonly totalBytes: number;
  readonly templateInventorySha256: string;
}

const SLEEP_ARRAY = new Int32Array(new SharedArrayBuffer(4));

function acquireAuthorityStageLock(
  baseStorageFsPath: string,
  instanceUuid: string,
  staleAfterMs = 30_000,
  retryAttempts = 5,
  retryDelayMs = 15
): { readonly lockDir: string; readonly token: string } {
  const lockDir = join(baseStorageFsPath, '.authority-stage.lock');
  const token = randomUUID();
  const writeOwner = (): void => {
    writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ instanceUuid, pid: process.pid, token }), 'utf8');
  };

  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    try {
      mkdirSync(lockDir);
      writeOwner();
      return { lockDir, token };
    } catch {
      if (existsSync(lockDir)) {
        const st = lstatSync(lockDir);
        if (st.isSymbolicLink()) {
          throw new CompanionContractError('PATH_UNSAFE', 'Authority stage lock must not be a symlink');
        }
        if (Date.now() - st.mtimeMs >= staleAfterMs) {
          const trashDir = join(baseStorageFsPath, `.stale-lock-${randomUUID()}`);
          try {
            renameSync(lockDir, trashDir);
            rmSync(trashDir, { recursive: true, force: true });
            mkdirSync(lockDir);
            writeOwner();
            return { lockDir, token };
          } catch {
            if (existsSync(trashDir)) rmSync(trashDir, { recursive: true, force: true });
          }
        }
      }
      if (attempt < retryAttempts && retryDelayMs > 0) {
        Atomics.wait(SLEEP_ARRAY, 0, 0, retryDelayMs);
      }
    }
  }
  throw new CompanionContractError('STORAGE_LOCK_CONTENTION', 'Concurrent authority storage staging lock active');
}

function releaseAuthorityStageLock(lockDir: string, expectedToken: string): void {
  if (!existsSync(lockDir)) return;
  try {
    const ownerPath = join(lockDir, 'owner.json');
    if (existsSync(ownerPath)) {
      const parsed: unknown = JSON.parse(readFileSync(ownerPath, 'utf8'));
      if (isPlainObject(parsed) && parsed.token !== expectedToken) {
        return;
      }
    }
    rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup race if lock was already removed
  }
}

export function stageAgentGeneration(input: StageGenerationInput): StagedGenerationResult {
  const { baseStorageFsPath, rootIdentity, instanceUuid, generationId, renderedAgents, currentUsage } = input;
  if (!baseStorageFsPath || baseStorageFsPath.trim() === '') {
    throw new CompanionContractError('PATH_UNSAFE', 'Invalid baseStorageFsPath');
  }
  if (renderedAgents.length > STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', `Agent count ${renderedAgents.length} exceeds 512 bound`);
  }
  const agentById = new Map<string, RenderedAgentResult>();
  let totalBytes = 0;
  for (const agent of renderedAgents) {
    if (!agent.actorId || agent.actorId.length > 64 || !ACTOR_ID_PATTERN.test(agent.actorId)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid actorId "${agent.actorId}" in staging`);
    }
    if (agentById.has(agent.actorId)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Duplicate actorId "${agent.actorId}" in staging`);
    }
    agentById.set(agent.actorId, agent);
    totalBytes += agent.byteLength;
  }
  mkdirSync(baseStorageFsPath, { recursive: true });
  const staleAfterMs = input.lockStaleAfterMs ?? 30_000;
  const { lockDir, token } = acquireAuthorityStageLock(
    baseStorageFsPath, instanceUuid, staleAfterMs, input.lockRetryAttempts ?? 5, input.lockRetryDelayMs ?? 15
  );
  let stagingGenPath: string | null = null;
  try {
    cleanStaleStagingDirectories(baseStorageFsPath, staleAfterMs);
    const diskUsage = inspectAuthorityStorageUsage(baseStorageFsPath, instanceUuid, { maxScanEntries: input.maxScanEntries });
    const budget = evaluateStorageBudget({
      activeInstanceGenerations: Math.max(currentUsage?.activeInstanceGenerations ?? 0, diskUsage.activeInstanceGenerations),
      activeInstanceBytes: Math.max(currentUsage?.activeInstanceBytes ?? 0, diskUsage.activeInstanceBytes),
      persistentAuthorityBytes: Math.max(currentUsage?.persistentAuthorityBytes ?? 0, diskUsage.persistentAuthorityBytes),
      newGenerationBytes: Math.max(1, totalBytes)
    });
    if (!budget.allowed) {
      throw new CompanionContractError('STORAGE_BUDGET_EXCEEDED', formatStorageCleanupGuidance(baseStorageFsPath));
    }
    const rootHash = createHash('sha256').update(rootIdentity, 'utf8').digest('hex');
    const targetGenPath = join(baseStorageFsPath, buildGenerationStoragePath(rootHash, instanceUuid, generationId));
    stagingGenPath = mkdtempSync(join(baseStorageFsPath, `.staging-${instanceUuid.toLowerCase()}-`));
    const publishedFiles: Record<string, string> = {};
    for (const agent of renderedAgents) {
      const filePath = join(stagingGenPath, `${agent.actorId}.agent.md`);
      writeFileSync(filePath, agent.content, 'utf8');
      const st = statSync(filePath);
      if (st.size !== agent.byteLength) {
        throw new CompanionContractError('CONTRACT_INVALID', `Post-write size mismatch for "${agent.actorId}"`);
      }
      publishedFiles[agent.actorId] = join(targetGenPath, `${agent.actorId}.agent.md`);
    }
    mkdirSync(dirname(targetGenPath), { recursive: true });
    if (existsSync(targetGenPath)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Generation path "${targetGenPath}" already exists`);
    }
    renameSync(stagingGenPath, targetGenPath);
    stagingGenPath = null;
    const hashStream = createHash('sha256');
    for (const id of [...agentById.keys()].sort()) {
      const agent = agentById.get(id);
      if (agent) hashStream.update(`${agent.actorId}:${agent.sha256}\n`, 'utf8');
    }
    return Object.freeze({
      generationFsPath: targetGenPath,
      publishedActorFiles: Object.freeze(publishedFiles),
      totalBytes,
      templateInventorySha256: hashStream.digest('hex')
    });
  } finally {
    if (stagingGenPath && existsSync(stagingGenPath)) {
      rmSync(stagingGenPath, { recursive: true, force: true });
    }
    releaseAuthorityStageLock(lockDir, token);
  }
}

export { CLOSED_EDITOR_STORAGE_CLEANUP_GUIDANCE };
