import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ACTOR_ID_PATTERN, CompanionContractError, SHA256_HEX, STORAGE_AND_SOURCE_BOUNDS, isPlainObject } from './runtime-contracts.js';
import { resolveEffectiveActorBinding, type CatalogModelDescriptor, type VscodeModelBindingsV1 } from './binding-contracts.js';
import { parseActorCanonicalTier } from './binding-resolver.js';
import { renderAgentTemplate, type RenderedAgentResult } from './agent-renderer.js';
import { stageAgentGeneration, type StagedGenerationResult, type StorageBudgetUsage } from './resource-storage.js';

export interface GenerationLoadResult {
  readonly staged: StagedGenerationResult | null;
  readonly reusedExistingGeneration?: boolean;
  readonly contributedCount: number;
  readonly inventoryKey: string | null;
  readonly templateInventorySha256: string | null;
  readonly manifestActors: Readonly<Record<string, { intent?: unknown }>>;
  readonly withheldReasons: Readonly<Record<string, string>>;
}

function isStrictSubpath(childPath: string, parentDir: string): boolean {
  const rel = relative(parentDir, childPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function validateSafeTemplatePath(baseDir: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.includes('\0') || relativePath.includes('\\') || relativePath.includes('..') || !relativePath.startsWith('evcrate/agent-templates/')) {
    throw new CompanionContractError('PATH_UNSAFE', `Template path "${relativePath}" must be inside evcrate/agent-templates/`);
  }
  const resolvedPath = resolve(baseDir, relativePath);
  const templatesBase = resolve(baseDir, 'evcrate', 'agent-templates');
  if (!isStrictSubpath(resolvedPath, templatesBase)) {
    throw new CompanionContractError('PATH_UNSAFE', `Template path "${relativePath}" escapes agent-templates directory`);
  }
  return resolvedPath;
}

export function readManifestActorsSafe(
  pluginFsPath: string | null
): Record<string, { intent?: unknown }> {
  if (!pluginFsPath) return {};
  try {
    const manifestPath = join(pluginFsPath, 'evcrate', 'agent-intent.json');
    const st = lstatSync(manifestPath);
    if (!st.isFile() || st.isSymbolicLink() || st.size > STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes) {
      return {};
    }
    const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (isPlainObject(raw) && raw.schema === 'evcrate-vscode-agent-intent-v1' && isPlainObject(raw.actors)) {
      return raw.actors as Record<string, { intent?: unknown }>;
    }
  } catch {
    // Ignore unreadable or missing manifest during fallback diagnostic inspection
  }
  return {};
}

export function loadAndStageGeneration(input: {
  readonly pluginFsPath: string;
  readonly baseStorageFsPath: string;
  readonly rootIdentity: string;
  readonly instanceUuid: string;
  readonly generationId: number;
  readonly activeInventoryKey?: string | null;
  readonly knownStagedGenerations?: ReadonlyMap<string, StagedGenerationResult> | null;
  readonly currentUsage?: StorageBudgetUsage;
  readonly rootBindings?: VscodeModelBindingsV1 | null;
  readonly userBindings?: VscodeModelBindingsV1 | null;
  readonly catalog?: readonly CatalogModelDescriptor[] | null;
}): GenerationLoadResult {
  const manifestPath = join(input.pluginFsPath, 'evcrate', 'agent-intent.json');
  const manifestStat = lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new CompanionContractError('PATH_UNSAFE', 'agent-intent.json must be a regular non-symlink file');
  }
  if (manifestStat.size > STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'agent-intent.json exceeds 1 MiB size bound');
  }
  const manifestRaw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isPlainObject(manifestRaw) || manifestRaw.schema !== 'evcrate-vscode-agent-intent-v1' || !isPlainObject(manifestRaw.actors)) {
    throw new CompanionContractError('SCHEMA_UNSUPPORTED', 'Invalid agent intent manifest schema');
  }
  const rawEntries = Object.entries(manifestRaw.actors);
  if (rawEntries.length > STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', `Manifest actor count ${rawEntries.length} exceeds 512 bound`);
  }
  const renderedById = new Map<string, RenderedAgentResult>();
  const withheldReasons: Record<string, string> = {};
  const validTemplateHashes: Record<string, string> = {};
  const manifestActors: Record<string, { intent?: unknown }> = {};
  for (const [actorId, rawEntry] of rawEntries) {
    if (typeof actorId !== 'string' || !ACTOR_ID_PATTERN.test(actorId)) {
      withheldReasons[actorId] = 'INVALID_ACTOR_ID';
      continue;
    }
    if (!isPlainObject(rawEntry)) {
      withheldReasons[actorId] = 'INVALID_MANIFEST_ENTRY';
      continue;
    }
    manifestActors[actorId] = { intent: rawEntry.intent };
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
      if (!isStrictSubpath(real, realTemplatesDir)) {
        withheldReasons[actorId] = 'SYMLINK_ESCAPE';
        continue;
      }
      const tplContent = readFileSync(real, 'utf8');
      const digest = createHash('sha256').update(tplContent, 'utf8').digest('hex');
      if (digest !== tplSha) {
        withheldReasons[actorId] = 'HASH_MISMATCH';
        continue;
      }
      validTemplateHashes[actorId] = digest;
      const tierResult = parseActorCanonicalTier(rawEntry.intent);
      if (!tierResult.ok) {
        withheldReasons[actorId] = tierResult.reason;
        continue;
      }
      const effective = resolveEffectiveActorBinding({
        actorId, canonicalTier: tierResult.tier,
        rootBindings: input.rootBindings ?? null, userBindings: input.userBindings ?? null, catalog: input.catalog ?? []
      });
      if (effective.status === 'withheld') {
        withheldReasons[actorId] = effective.reason ?? 'WITHHELD';
        continue;
      }
      renderedById.set(actorId, renderAgentTemplate({
        actorId, templateContent: tplContent, modelSelector: effective.renderedSelector, pluginFsPath: input.pluginFsPath
      }));
    } catch (err: unknown) {
      withheldReasons[actorId] = err instanceof CompanionContractError ? err.code : 'RENDER_ERROR';
    }
  }
  const sortedTemplateIds = Object.keys(validTemplateHashes).sort();
  const tplHashStream = createHash('sha256');
  for (const id of sortedTemplateIds) tplHashStream.update(`${id}:${validTemplateHashes[id]}\n`, 'utf8');
  const templateInventorySha256 = sortedTemplateIds.length > 0 ? tplHashStream.digest('hex') : null;
  const frozenManifest = Object.freeze(manifestActors);
  const frozenWithheld = Object.freeze(withheldReasons);
  if (renderedById.size === 0) {
    return Object.freeze({
      staged: null, reusedExistingGeneration: false, contributedCount: 0,
      inventoryKey: null, templateInventorySha256, manifestActors: frozenManifest, withheldReasons: frozenWithheld
    });
  }
  const hashStream = createHash('sha256');
  for (const id of [...renderedById.keys()].sort()) {
    const agent = renderedById.get(id);
    if (agent) hashStream.update(`${agent.actorId}:${agent.sha256}\n`, 'utf8');
  }
  const inventoryKey = `${input.rootIdentity}:${hashStream.digest('hex')}`;
  const cachedStaged = input.knownStagedGenerations?.get(inventoryKey);
  if (cachedStaged && Object.values(cachedStaged.publishedActorFiles).every((p) => existsSync(p))) {
    return Object.freeze({
      staged: cachedStaged, reusedExistingGeneration: true, contributedCount: renderedById.size,
      inventoryKey, templateInventorySha256, manifestActors: frozenManifest, withheldReasons: frozenWithheld
    });
  }
  if (input.activeInventoryKey && inventoryKey === input.activeInventoryKey) {
    return Object.freeze({
      staged: null, reusedExistingGeneration: true, contributedCount: renderedById.size,
      inventoryKey, templateInventorySha256, manifestActors: frozenManifest, withheldReasons: frozenWithheld
    });
  }
  const staged = stageAgentGeneration({
    baseStorageFsPath: input.baseStorageFsPath, rootIdentity: input.rootIdentity,
    instanceUuid: input.instanceUuid, generationId: input.generationId,
    renderedAgents: [...renderedById.values()], currentUsage: input.currentUsage
  });
  return Object.freeze({
    staged, reusedExistingGeneration: false, contributedCount: renderedById.size,
    inventoryKey, templateInventorySha256, manifestActors: frozenManifest, withheldReasons: frozenWithheld
  });
}
