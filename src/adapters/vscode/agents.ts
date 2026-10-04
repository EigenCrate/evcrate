import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, decodeUtf8, copyText, writeJson } from './common.js';
import { parseFrontmatter, serializeFrontmatter, mapAgentTools, resolveLocalModel } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry, VscodeAgentMapEntry } from './names.js';

export interface VscodeAgentAudit {
  readonly source: string;
  readonly target: string;
  readonly model: {
    readonly source?: string;
    readonly target: string | null;
    readonly disposition: string;
  };
  readonly tools: {
    readonly mapped: readonly string[];
    readonly dropped: readonly string[];
    readonly explicitNone: boolean;
  };
  readonly delegation: {
    readonly allowed: boolean;
    readonly agents: readonly string[];
  };
}

export function convertVscodeAgents(
  context: ProjectionBuildContext,
  agentMap: Record<string, VscodeAgentMapEntry>,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): Record<string, VscodeAgentAudit> {
  const agentFiles = filesUnder(context, 'agents')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const audits: Record<string, VscodeAgentAudit> = {};

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

    if (sourceName === 'advisor') {
      if (!body.includes('## Required checkpoint method') || !body.includes('## Checkpoint terminal report')) {
        throw new ControlPlaneError('VALIDATION_INVALID');
      }
    }

    const sourceToolsField = parsed.fields.tools;
    const toolResult = mapAgentTools(sourceToolsField);

    const outFrontmatter: Record<string, unknown> = {
      name: entry.localName,
      description
    };

    if (typeof parsed.fields['user-invocable'] === 'boolean') {
      outFrontmatter['user-invocable'] = parsed.fields['user-invocable'];
    } else {
      outFrontmatter['user-invocable'] = true;
    }

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

    // Model resolution and validation
    const sourceModel = typeof parsed.fields.model === 'string' ? parsed.fields.model.trim() : undefined;
    const modelResolution = resolveLocalModel(sourceModel);
    if (modelResolution.mode === 'unavailable') {
      throw new ControlPlaneError('CAPABILITY_UNSUPPORTED', 'LOCAL_MODEL_UNAVAILABLE');
    }
    if (modelResolution.mode === 'pin' && sourceModel) {
      outFrontmatter.model = sourceModel;
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

    audits[sourceName] = Object.freeze({
      source: rel,
      target: entry.target,
      model: Object.freeze({
        source: sourceModel,
        target: modelResolution.mode === 'pin' ? modelResolution.nativeModel : null,
        disposition: modelResolution.mode === 'pin' ? 'pinned' : 'inherited'
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

  writeJson(context, 'evcrate/agent-tool-audit.json', {
    schema: 'evcrate-vscode-agent-tool-audit-v1',
    agents: audits
  });

  return Object.freeze(audits);
}
