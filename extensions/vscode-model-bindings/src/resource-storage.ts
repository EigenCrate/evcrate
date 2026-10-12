import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  buildGenerationStoragePath,
  evaluateStorageBudget
} from './runtime-contracts.js';
import type { RenderedAgentResult } from './agent-renderer.js';

export interface StorageBudgetUsage {
  readonly activeInstanceGenerations: number;
  readonly activeInstanceBytes: number;
  readonly persistentAuthorityBytes: number;
}

export interface StageGenerationInput {
  readonly baseStorageFsPath: string;
  readonly rootIdentity: string;
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly renderedAgents: readonly RenderedAgentResult[];
  readonly currentUsage: StorageBudgetUsage;
}

export interface StagedGenerationResult {
  readonly generationFsPath: string;
  readonly publishedActorFiles: Readonly<Record<string, string>>;
  readonly totalBytes: number;
  readonly templateInventorySha256: string;
}

export function stageAgentGeneration(input: StageGenerationInput): StagedGenerationResult {
  const { baseStorageFsPath, rootIdentity, instanceUuid, generationId, renderedAgents, currentUsage } = input;
  if (!baseStorageFsPath || baseStorageFsPath.trim() === '') {
    throw new CompanionContractError('PATH_UNSAFE', 'Invalid baseStorageFsPath');
  }
  if (renderedAgents.length > STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', `Agent count ${renderedAgents.length} exceeds 512 bound`);
  }
  const seenIds = new Set<string>();
  let totalBytes = 0;
  for (const agent of renderedAgents) {
    if (!agent.actorId || agent.actorId.length > 64 || !ACTOR_ID_PATTERN.test(agent.actorId)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Invalid actorId "${agent.actorId}" in staging`);
    }
    if (seenIds.has(agent.actorId)) {
      throw new CompanionContractError('CONTRACT_INVALID', `Duplicate actorId "${agent.actorId}" in staging`);
    }
    seenIds.add(agent.actorId);
    totalBytes += agent.byteLength;
  }
  const budget = evaluateStorageBudget({
    activeInstanceGenerations: currentUsage.activeInstanceGenerations,
    activeInstanceBytes: currentUsage.activeInstanceBytes,
    persistentAuthorityBytes: currentUsage.persistentAuthorityBytes,
    newGenerationBytes: Math.max(1, totalBytes)
  });
  if (!budget.allowed) {
    throw new CompanionContractError('STORAGE_BUDGET_EXCEEDED', 'Generation exceeds storage budget bounds; manual closed-editor cleanup required');
  }
  const rootHash = createHash('sha256').update(rootIdentity, 'utf8').digest('hex');
  const targetGenPath = join(baseStorageFsPath, buildGenerationStoragePath(rootHash, instanceUuid, generationId));
  mkdirSync(baseStorageFsPath, { recursive: true });
  const stagingGenPath = mkdtempSync(join(baseStorageFsPath, '.staging-'));
  try {
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
    const sortedActorIds = [...renderedAgents.map((a) => a.actorId)].sort();
    const hashStream = createHash('sha256');
    for (const id of sortedActorIds) {
      const agent = renderedAgents.find((a) => a.actorId === id);
      if (agent) hashStream.update(`${agent.actorId}:${agent.sha256}\n`, 'utf8');
    }
    const templateInventorySha256 = hashStream.digest('hex');
    return Object.freeze({
      generationFsPath: targetGenPath,
      publishedActorFiles: Object.freeze(publishedFiles),
      totalBytes,
      templateInventorySha256
    });
  } catch (err) {
    if (existsSync(stagingGenPath)) rmSync(stagingGenPath, { recursive: true, force: true });
    throw err;
  }
}
