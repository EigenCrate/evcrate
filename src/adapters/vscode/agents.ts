import { createHash } from 'node:crypto';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, decodeUtf8, copyText, writeJson } from './common.js';
import { parseFrontmatter, serializeFrontmatter, mapAgentTools } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry, VscodeAgentMapEntry } from './names.js';
import {
  resolveCanonicalModelIntent,
  validateAgentIntentManifest,
  validateAgentToolAuditV2,
  VSCODE_AGENT_INTENT_SCHEMA_V1,
  VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2,
  type CanonicalModelIntent,
  type VscodeAgentIntentManifestV1,
  type VscodeAgentIntentRecord,
  type VscodeAgentToolAuditV2,
  type VscodeAgentAuditEntryV2
} from './model-intent.js';


export function convertVscodeAgents(
  context: ProjectionBuildContext,
  agentMap: Record<string, VscodeAgentMapEntry>,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): Record<string, VscodeAgentAuditEntryV2> {
  const agentFiles = filesUnder(context, 'agents')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const audits: Record<string, VscodeAgentAuditEntryV2> = {};
  const intentRecords: Record<string, VscodeAgentIntentRecord> = {};

  for (const file of agentFiles) {
    const rel = sourcePath('agents', file);
    const sourceName = rel.slice(0, -3);
    const entry = agentMap[sourceName];
    if (!entry) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const parsed = parseFrontmatter(decodeUtf8(file.bytes));
    const description = typeof parsed.fields.description === 'string'
      ? transformVscodePrompt(parsed.fields.description.trim(), commandMap, skills)
      : '';

    if (!description) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const body = transformVscodePrompt(parsed.body, commandMap, skills);
    const sourceToolsField = parsed.fields.tools;
    const toolResult = mapAgentTools(sourceToolsField);

    const outFrontmatter: Record<string, unknown> = {
      name: entry.localName,
      description
    };

    const userInvocable = typeof parsed.fields['user-invocable'] === 'boolean'
      ? parsed.fields['user-invocable']
      : true;
    outFrontmatter['user-invocable'] = userInvocable;
    const disableModelInvocation = typeof parsed.fields['disable-model-invocation'] === 'boolean'
      ? parsed.fields['disable-model-invocation']
      : false;
    if (typeof parsed.fields['disable-model-invocation'] === 'boolean') {
      outFrontmatter['disable-model-invocation'] = parsed.fields['disable-model-invocation'];
    }

    // Tools and agents restriction
    if (toolResult.hasExplicitTools) {
      if (toolResult.isExplicitNone) {
        outFrontmatter.tools = [];
        outFrontmatter.agents = [];
      } else {
        outFrontmatter.tools = [...toolResult.mapped];
        if (!toolResult.canDelegate) {
          outFrontmatter.agents = [];
        }
      }
    }

    // Model intent resolution and strict validation - strip actionable model selector from template
    const rawModel = parsed.fields.model;
    if (rawModel !== undefined && rawModel !== null && typeof rawModel !== 'string') {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Agent model must be a string if defined');
    }
    const sourceModel = typeof rawModel === 'string' ? rawModel.trim() : undefined;
    let canonicalIntent: CanonicalModelIntent;
    try {
      canonicalIntent = resolveCanonicalModelIntent(sourceModel);
    } catch (err) {
      if (err instanceof ControlPlaneError) throw err;
      throw new ControlPlaneError('VALIDATION_INVALID', err instanceof Error ? err.message : String(err));
    }

    // Preserve skills array if present (e.g. snyk-expert)
    if (Array.isArray(parsed.fields.skills)) {
      outFrontmatter.skills = parsed.fields.skills;
    }

    // Preserve permissionMode if present and not a bypass mode (e.g. snyk-expert)
    if (
      typeof parsed.fields.permissionMode === 'string' &&
      parsed.fields.permissionMode !== 'bypass' &&
      parsed.fields.permissionMode !== 'accept-edits'
    ) {
      outFrontmatter.permissionMode = parsed.fields.permissionMode;
    }

    const rendered = serializeFrontmatter(outFrontmatter, body);
    copyText(context, file.path, entry.target, () => rendered);

    const templateSha256 = createHash('sha256').update(rendered, 'utf8').digest('hex');
    const sourcePathStr = `.claude/agents/${sourceName}.md`;
    const templatePathStr = entry.target;

    intentRecords[sourceName] = Object.freeze({
      actorId: sourceName,
      sourcePath: sourcePathStr,
      templatePath: templatePathStr,
      templateSha256,
      referenceBase: 'agents',
      intent: canonicalIntent,
      tools: Object.freeze({
        mapped: toolResult.mapped,
        dropped: toolResult.dropped,
        explicitNone: toolResult.isExplicitNone
      }),
      delegation: Object.freeze({
        allowed: toolResult.canDelegate,
        agents: toolResult.canDelegate ? Object.freeze(['*']) : Object.freeze([])
      }),
      visibility: Object.freeze({
        userInvocable,
        disableModelInvocation
      })
    });

    audits[sourceName] = Object.freeze({
      source: sourcePathStr,
      target: templatePathStr,
      templateSha256,
      modelIntent: Object.freeze({
        ...(sourceModel !== undefined ? { source: sourceModel } : {}),
        tier: canonicalIntent.tier,
        disposition: canonicalIntent.tier !== null ? 'tier-required' : 'inherit'
      }),
      tools: Object.freeze({
        mapped: toolResult.mapped,
        dropped: toolResult.dropped,
        explicitNone: toolResult.isExplicitNone
      }),
      delegation: Object.freeze({
        allowed: toolResult.canDelegate,
        agents: toolResult.canDelegate ? Object.freeze(['*']) : Object.freeze([])
      })
    });
  }

  const intentManifest: VscodeAgentIntentManifestV1 = {
    schema: VSCODE_AGENT_INTENT_SCHEMA_V1,
    pluginName: 'evc',
    actors: intentRecords
  };
  const validatedIntent = validateAgentIntentManifest(intentManifest);
  writeJson(context, 'evcrate/agent-intent.json', validatedIntent);

  const toolAudit: VscodeAgentToolAuditV2 = {
    schema: VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2,
    agents: audits
  };
  const validatedAudit = validateAgentToolAuditV2(toolAudit);
  writeJson(context, 'evcrate/agent-tool-audit.json', validatedAudit);

  return Object.freeze(audits);
}
