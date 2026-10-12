import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  SHA256_HEX,
  STORAGE_AND_SOURCE_BOUNDS,
  isPlainObject
} from './runtime-contracts.js';
import { renderAgentTemplate, type RenderedAgentResult } from './agent-renderer.js';
import { stageAgentGeneration, type StagedGenerationResult } from './resource-storage.js';

export interface GenerationLoadResult {
  readonly staged: StagedGenerationResult | null;
  readonly contributedCount: number;
  readonly inventoryKey: string | null;
  readonly withheldReasons: Readonly<Record<string, string>>;
}

export function validateSafeTemplatePath(baseDir: string, relativePath: string): string {
  if (
    typeof relativePath !== 'string'
    || relativePath.includes('\0')
    || relativePath.includes('..')
    || !relativePath.startsWith('evcrate/agent-templates/')
  ) {
    throw new CompanionContractError('PATH_UNSAFE', `Template path "${relativePath}" must be inside evcrate/agent-templates/`);
  }
  const resolvedPath = resolve(baseDir, relativePath);
  const templatesBase = resolve(baseDir, 'evcrate', 'agent-templates');
  if (!resolvedPath.startsWith(templatesBase + '/')) {
    throw new CompanionContractError('PATH_UNSAFE', `Template path "${relativePath}" escapes agent-templates directory`);
  }
  return resolvedPath;
}

export function loadAndStageGeneration(input: {
  readonly pluginFsPath: string;
  readonly baseStorageFsPath: string;
  readonly rootIdentity: string;
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly activeInventoryKey?: string | null;
  readonly currentUsage: { activeInstanceGenerations: number; activeInstanceBytes: number; persistentAuthorityBytes: number };
}): GenerationLoadResult {
  const manifestPath = join(input.pluginFsPath, 'evcrate', 'agent-intent.json');
  const manifestRaw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isPlainObject(manifestRaw) || manifestRaw.schema !== 'evcrate-vscode-agent-intent-v1' || !isPlainObject(manifestRaw.actors)) {
    throw new CompanionContractError('SCHEMA_UNSUPPORTED', 'Invalid agent intent manifest schema');
  }
  const renderedList: RenderedAgentResult[] = [];
  const withheldReasons: Record<string, string> = {};
  for (const [actorId, rawEntry] of Object.entries(manifestRaw.actors)) {
    if (typeof actorId !== 'string' || !ACTOR_ID_PATTERN.test(actorId)) {
      withheldReasons[actorId] = 'INVALID_ACTOR_ID';
      continue;
    }
    if (!isPlainObject(rawEntry)) {
      withheldReasons[actorId] = 'INVALID_MANIFEST_ENTRY';
      continue;
    }
    const tplPath = rawEntry.templatePath;
    const tplSha = rawEntry.templateSha256;
    if (typeof tplPath !== 'string' || typeof tplSha !== 'string' || !SHA256_HEX.test(tplSha)) {
      withheldReasons[actorId] = 'INVALID_MANIFEST_ENTRY';
      continue;
    }
    try {
      const safePath = validateSafeTemplatePath(input.pluginFsPath, tplPath);
      const st = lstatSync(safePath);
      if (!st.isFile() || st.isSymbolicLink() || st.size > STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes) {
        withheldReasons[actorId] = 'UNSAFE_TEMPLATE_FILE';
        continue;
      }
      const real = realpathSync(safePath);
      const realTemplatesDir = realpathSync(resolve(input.pluginFsPath, 'evcrate', 'agent-templates'));
      if (!real.startsWith(realTemplatesDir + '/')) {
        withheldReasons[actorId] = 'SYMLINK_ESCAPE';
        continue;
      }
      const tplContent = readFileSync(real, 'utf8');
      const digest = createHash('sha256').update(tplContent, 'utf8').digest('hex');
      if (digest !== tplSha) {
        withheldReasons[actorId] = 'HASH_MISMATCH';
        continue;
      }
      const rendered = renderAgentTemplate({
        actorId, templateContent: tplContent, modelSelector: null, pluginFsPath: input.pluginFsPath
      });
      renderedList.push(rendered);
    } catch (err: unknown) {
      withheldReasons[actorId] = err instanceof CompanionContractError ? err.code : 'RENDER_ERROR';
    }
  }
  if (renderedList.length === 0) {
    return Object.freeze({ staged: null, contributedCount: 0, inventoryKey: null, withheldReasons: Object.freeze(withheldReasons) });
  }
  const sortedActorIds = [...renderedList.map((a) => a.actorId)].sort();
  const hashStream = createHash('sha256');
  for (const id of sortedActorIds) {
    const agent = renderedList.find((a) => a.actorId === id);
    if (agent) hashStream.update(`${agent.actorId}:${agent.sha256}\n`, 'utf8');
  }
  const inventorySha = hashStream.digest('hex');
  const inventoryKey = `${input.rootIdentity}:${inventorySha}`;
  if (input.activeInventoryKey && inventoryKey === input.activeInventoryKey) {
    return Object.freeze({ staged: null, contributedCount: renderedList.length, inventoryKey, withheldReasons: Object.freeze(withheldReasons) });
  }
  const staged = stageAgentGeneration({
    baseStorageFsPath: input.baseStorageFsPath,
    rootIdentity: input.rootIdentity,
    instanceUuid: input.instanceUuid,
    generationId: input.generationId,
    renderedAgents: renderedList,
    currentUsage: input.currentUsage
  });
  return Object.freeze({ staged, contributedCount: renderedList.length, inventoryKey, withheldReasons: Object.freeze(withheldReasons) });
}
