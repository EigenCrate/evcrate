import { lstatSync } from 'node:fs';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { ensureProjectionDirectory, siblingText, sourceSibling, validateProjection, writeProjectionFile, textBytes, isProductionControllerArtifact } from '../projection-utils.js';
import type { ResourceGraphFile } from '../resource-graph.js';
import { applyReplacements, addWorkflowFallback, canonicalCommandPath, isBinary, markdownFrontmatter, MODEL_MAP, normalizeDescription, parseFrontmatter, renderAdvisoryInterview, renderHarnessScriptReferences, renderInlineAdvise, rewriteCommandGuidance, SUBAGENT_WAIT_CONTRACT, tomlValue, transformResourceText } from './transforms.js';
import { contextBridge, hooksJson, permissionHook, pretoolBridge, runMcpPackage, runNodeHook } from './hooks.js';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { projectCatalogDataAndLayout } from '../catalog-data.js';
import { renderMentoringWorkflow } from '../advisory.js';

const SKILLS_TO_SKIP = new Set(['claude-code', 'skill-creator']);
const OMITTED_PARTS = new Set(['__tests__', 'tests', 'fixtures', 'helpers']);
const COMMAND_EVENT_NAMES = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse']);
const UNSUPPORTED_EVENTS: Readonly<Record<string, string>> = {
  SubagentStart: 'No Codex hook targets subagent startup; behavior is intentionally dropped.',
  PreCompact: 'No clean Codex analog for Claude PreCompact; behavior is intentionally dropped.',
  SessionEnd: 'Codex exposes no SessionEnd hook in the documented hook set; cleanup is intentionally omitted.',
};

function fail(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function source(context: ProjectionBuildContext, path: string): ResourceGraphFile | undefined { return context.resources.files.find((file) => file.path === path); }
function filesUnder(context: ProjectionBuildContext, prefix: string): readonly ResourceGraphFile[] {
  return context.resources.files.filter((file) => file.path.startsWith(`${prefix}/`)).sort((a, b) => a.path.localeCompare(b.path));
}
function writeText(context: ProjectionBuildContext, path: string, value: string, executable = false): void { writeProjectionFile(context, path, textBytes(value), executable); }
function knownCommands(context: ProjectionBuildContext): Set<string> {
  const known = new Set<string>();
  for (const file of filesUnder(context, 'commands')) if (file.path.endsWith('.md')) {
    const relative = file.path.slice('commands/'.length, -3);
    known.add(canonicalCommandPath(`/${relative}`));
    const explicit = parseFrontmatter(new TextDecoder().decode(file.bytes)).metadata.name;
    if (typeof explicit === 'string' && explicit.startsWith('/')) known.add(canonicalCommandPath(explicit));
  }
  return known;
}
function transformed(context: ProjectionBuildContext, file: ResourceGraphFile, _known: ReadonlySet<string>): Uint8Array {
  if (isBinary(file)) return file.bytes;
  return textBytes(applyReplacements(renderHarnessScriptReferences(new TextDecoder().decode(file.bytes))));
}
function copyScripts(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  for (const file of filesUnder(context, 'scripts')) {
    const relative = file.path.slice('scripts/'.length); const parts = relative.split('/');
    if (parts.some((part) => OMITTED_PARTS.has(part)) || isProductionControllerArtifact(relative) || relative.includes('advise-state') || relative === 'commands_data.yaml' || relative === 'skills_data.yaml') continue;
    const content = transformed(context, file, known);
    const final = relative === 'ev-help.py' ? new TextDecoder().decode(content).replace('("CODEX_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")', '("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")') : content;
    writeProjectionFile(context, `.codex/scripts/${relative}`, typeof final === 'string' ? textBytes(final) : final, file.executable ?? false);
  }
}
function copyHooks(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  for (const file of filesUnder(context, 'hooks')) {
    const relative = file.path.slice('hooks/'.length); const parts = relative.split('/');
    if (parts.some((part) => OMITTED_PARTS.has(part)) || isProductionControllerArtifact(relative)) continue;
    writeProjectionFile(context, `.codex/hooks/${relative}`, transformed(context, file, known), file.executable ?? false);
  }
}
function copySkills(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  const roots = new Set<string>();
  for (const file of filesUnder(context, 'skills')) {
    const relative = file.path.slice('skills/'.length); const first = relative.split('/')[0];
    if (!relative.includes('/') || SKILLS_TO_SKIP.has(first) || first === '') continue;
    roots.add(first);
    const mapped = first.replace(/claude/giu, 'codex');
    let target = relative.replace(first, mapped);
    if (target.endsWith('/skill.md')) target = `${target.slice(0, -9)}/SKILL.md`;
    let bytes = file.bytes;
    if (!isBinary(file)) {
      const content = addWorkflowFallback(rewriteCommandGuidance(applyReplacements(renderHarnessScriptReferences(new TextDecoder().decode(file.bytes))), known));
      if (target.endsWith('/SKILL.md')) {
        const parsed = parseFrontmatter(content);
        const metadata = { ...parsed.metadata, name: typeof parsed.metadata.name === 'string' ? parsed.metadata.name : mapped, description: normalizeDescription(typeof parsed.metadata.description === 'string' ? parsed.metadata.description : undefined, parsed.body, `Use the ${mapped} skill.`) };
        bytes = textBytes(`${markdownFrontmatter(metadata)}\n\n${parsed.body.trimStart()}`);
      } else bytes = textBytes(content);
    }
    writeProjectionFile(context, `.agents/skills/${target}`, bytes, file.executable ?? false);
  }
  for (const root of roots) ensureProjectionDirectory(context, `.agents/skills/${root.replace(/claude/giu, 'codex')}`);
}
function renderAgent(context: ProjectionBuildContext, file: ResourceGraphFile, known: ReadonlySet<string>): string {
  const parsed = parseFrontmatter(new TextDecoder().decode(file.bytes)); const stem = file.path.slice('agents/'.length, -3);
  let name = applyReplacements(typeof parsed.metadata.name === 'string' ? parsed.metadata.name : stem);
  let description = rewriteCommandGuidance(applyReplacements(typeof parsed.metadata.description === 'string' ? parsed.metadata.description : `Specialized Codex subagent for ${name}.`), known);
  if (stem === 'advisor') description = 'Use this high-tier mentor for fresh named checkpoints; Codex rejects interview relay.';
  let body = addWorkflowFallback(rewriteCommandGuidance(applyReplacements(parsed.body), known));
  if (stem === 'scout-external') body = body.replace(/<!-- EXTERNAL_SCOUT_STRATEGY_START -->[\s\S]*?<!-- EXTERNAL_SCOUT_STRATEGY_END -->/u, '<!-- EXTERNAL_SCOUT_STRATEGY_START -->\n## External command strategy\n\nFor each focused directory search, use the same read-only primary command. Prompts must request concise paths and supporting evidence, and must not ask for modifications or credentials.\n\n```bash\nagy -p "[prompt]" --model gemini-3.7-flash-high\n```\n\nRun focused searches in parallel when useful, with a three-minute timeout per command. Do not restart a timed-out command.\n<!-- EXTERNAL_SCOUT_STRATEGY_END -->');
  if (stem === 'advisor') body = `${body}`;
  body = `${body.trim()}\n\n${SUBAGENT_WAIT_CONTRACT}`;
  const lines = [tomlValue('name', name), tomlValue('description', description), tomlValue('developer_instructions', body)];
  const model = typeof parsed.metadata.model === 'string' ? MODEL_MAP[parsed.metadata.model.toLowerCase()] : undefined;
  if (model) lines.push(tomlValue('model', model[0]), tomlValue('model_reasoning_effort', model[1]));
  if (parsed.metadata.tools !== undefined) {
    const tools = Array.isArray(parsed.metadata.tools) ? `[${parsed.metadata.tools.map((item) => `'${item}'`).join(', ')}]` : String(parsed.metadata.tools);
    lines.push('', '# Claude Code tool allowlists do not map directly to Codex custom agents.', tomlValue('# migrated_claude_tools', tools));
  }
  return `${lines.join('\n')}\n`;
}
function copyAgents(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  for (const file of filesUnder(context, 'agents')) if (file.path.endsWith('.md') && !file.path.slice('agents/'.length).includes('/')) writeText(context, `.codex/agents/${file.path.slice('agents/'.length, -3)}.toml`, renderAgent(context, file, known));
}
function copyWorkflows(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  for (const file of filesUnder(context, 'workflows')) if (!file.path.slice('workflows/'.length).includes('/')) {
    let body = new TextDecoder().decode(file.bytes);
    if (file.path.endsWith('/advisory-interview.md')) body = renderAdvisoryInterview(body);
    else if (file.path.endsWith('/advisor-mentoring.md')) body = renderMentoringWorkflow(body, 'codex');
    writeText(context, `.codex/workflows/${file.path.slice('workflows/'.length)}`, addWorkflowFallback(rewriteCommandGuidance(applyReplacements(body), known)));
  }
}
function projectDocument(context: ProjectionBuildContext): void {
  if (!context.manifest.projectDocs.includes('AGENTS.md')) return;
  const candidate = sourceSibling(context, 'CLAUDE.md');
  try {
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new ControlPlaneError('PATH_UNSAFE');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  writeText(context, 'AGENTS.md', applyReplacements(siblingText(context, 'CLAUDE.md')));
}
function copyConfigInputs(context: ProjectionBuildContext): void {
  for (const name of ['.evcrate.json', '.evcrateignore']) { const file = source(context, name); if (file) writeProjectionFile(context, `.codex/${name}`, file.bytes, file.executable ?? false); }
}
function generatedHooks(context: ProjectionBuildContext): void {
  const generated: Readonly<Record<string, string>> = {
    'session-start.cjs': contextBridge('SessionStart', '.codex/hooks/session-init.cjs', '../global-guidance.md'),
    'user-prompt-submit.cjs': contextBridge('UserPromptSubmit', '.codex/hooks/dev-rules-reminder.cjs'),
    'pretool-scout-block.cjs': pretoolBridge('.codex/hooks/scout-block.cjs'),
    'pretool-privacy-block.cjs': pretoolBridge('.codex/hooks/privacy-block.cjs'),
    'permission-request.cjs': permissionHook(),
    'run-node-hook.sh': runNodeHook(),
  };
  for (const [name, body] of Object.entries(generated)) writeText(context, `.codex/hooks/${name}`, body, name.endsWith('.sh'));
  writeText(context, '.codex/bin/run-mcp-package.sh', runMcpPackage(), true);
  writeText(context, '.codex/hooks.json', hooksJson());
}
function globalGuidance(context: ProjectionBuildContext): void {
  writeText(context, '.codex/global-guidance.md', `## Podman Docker Guidance\n\n- On Fedora hosts, treat \`podman\` with \`podman-docker\` as sufficient for Docker-compatible checks. Do not require Docker Engine if \`docker info\`, \`docker build\`, and \`docker run\` work.\n- Before concluding Docker is unavailable, ensure \`XDG_RUNTIME_DIR=/run/user/$(id -u)\` is exported in the shell running Codex.\n- If needed, start the user socket with \`systemctl --user start podman.socket\` and prefer keeping it enabled for future sessions.\n- When validating container availability, run both \`docker info\` and a real smoke check such as \`docker run --rm hello-world\` or a minimal \`docker build\`.\n- If \`docker\` resolves to the Podman compatibility CLI, that is acceptable. The common failure mode is missing runtime environment, not missing Docker Engine.\n\n${SUBAGENT_WAIT_CONTRACT}`);
}
function config(context: ProjectionBuildContext): void {
  const value = `# Generated from ".claude" by migrate_claude_to_codex.py
# Parent/main session runs on the strongest model (gpt-5.6-sol) at medium
# reasoning effort; subagents are pinned to cheaper tiers via MODEL_MAP.
model = "gpt-5.6-sol"
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
personality = "pragmatic"
tool_output_token_limit = 8192

project_doc_fallback_filenames = ["CLAUDE.md", "GEMINI.md"]

[agents]
# Keep fan-out bounded; prompt contracts require terminal results before continuation.
enabled = true
max_concurrent_threads_per_session = 4
max_depth = 1
interrupt_message = true
[features]
hooks = true

[mcp_servers.evcrate]
command = ".codex/bin/run-mcp-package.sh"
`;
  writeText(context, '.codex/config.toml', value);
}
function parseSettings(context: ProjectionBuildContext): Record<string, unknown> {
  const file = source(context, 'settings.json'); if (!file) return {};
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('settings object required');
    return parsed as Record<string, unknown>;
  } catch { throw new ControlPlaneError('VALIDATION_INVALID'); }
}
function behaviorMatrix(context: ProjectionBuildContext): void {
  const settings = parseSettings(context);
  const hasProjectDoc = sourceSiblingExists(context, 'CLAUDE.md');
  const entries: Record<string, unknown>[] = [{ kind: 'memory-file', source: 'CLAUDE.md', classification: 'memory-file', status: hasProjectDoc ? 'materialized-copy' : 'not-present', target: hasProjectDoc ? 'AGENTS.md' : null }];
  for (const file of filesUnder(context, 'commands')) {
    if (!file.path.endsWith('.md')) continue;
    const relative = file.path.slice('commands/'.length, -3);
    entries.push({ kind: 'command-prose', source: relative + '.md', classification: 'command-prose', status: 'migrated', target: '.agents/skills/cmd_' + relative.replaceAll('/', '_') + '/SKILL.md' });
  }
  for (const file of filesUnder(context, 'skills')) {
    if (!file.path.endsWith('/SKILL.md')) continue;
    const rel = file.path.slice('skills/'.length);
    const first = rel.split('/')[0];
    if (SKILLS_TO_SKIP.has(first) || first === '' || first === 'template-skill') continue;
    const mapped = first.replace(/claude/giu, 'codex');
    const target = rel.replace(first, mapped);
    entries.push({ kind: 'skill-package', source: rel, classification: 'skill-package', status: 'migrated', target: `.agents/skills/${target}`, target_name: mapped });
  }
  entries.push({ kind: 'advisory-capability', classification: 'target-native', checkpoint: 'supported', inline: 'supported', relay: 'unsupported', relay_error: 'ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX' });
  const hooks = settings.hooks;
  if (hooks && typeof hooks === 'object' && !Array.isArray(hooks)) for (const [eventName, groups] of Object.entries(hooks as Record<string, unknown>)) if (Array.isArray(groups)) for (const group of groups) if (group && typeof group === 'object') for (const hook of Array.isArray((group as Record<string, unknown>).hooks) ? (group as Record<string, unknown>).hooks as unknown[] : []) if (hook && typeof hook === 'object') {
    const mapped = COMMAND_EVENT_NAMES.has(eventName); const entry: Record<string, unknown> = { kind: 'hook-driven', source_event: eventName, source_matcher: (group as Record<string, unknown>).matcher ?? '*', source_command: (hook as Record<string, unknown>).command ?? '' };
    if (mapped) Object.assign(entry, { classification: 'hook-driven', status: 'migrated', target_event: eventName, ...(eventName === 'PreToolUse' ? { target_followups: ['PermissionRequest'] } : {}) }); else Object.assign(entry, { classification: 'unsupported', status: 'dropped', reason: UNSUPPORTED_EVENTS[eventName] ?? 'No Codex hook mapping was defined for this Claude event.' }); entries.push(entry);
  }
  const payload = { target: 'codex', project_doc_fallback_filenames: ['CLAUDE.md', 'GEMINI.md'], unsupported_events: UNSUPPORTED_EVENTS, behaviors: entries };
  writeText(context, '.codex/migration-behavior-matrix.json', JSON.stringify(sortJson(payload), null, 2) + '\n');
}
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) output[key] = sortJson((value as Record<string, unknown>)[key]);
    return output;
  }
  return value;
}
function sourceSiblingExists(context: ProjectionBuildContext, name: string): boolean {
  try {
    const stat = lstatSync(sourceSibling(context, name));
    if (stat.isSymbolicLink() || !stat.isFile()) throw new ControlPlaneError('PATH_UNSAFE');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}
function commands(context: ProjectionBuildContext): void {
  const known = knownCommands(context);
  for (const file of filesUnder(context, 'commands')) if (file.path.endsWith('.md')) {
    const relative = file.path.slice('commands/'.length, -3);
    const parsed = parseFrontmatter(new TextDecoder().decode(file.bytes));
    const commandName = typeof parsed.metadata.name === 'string' && parsed.metadata.name.startsWith('/') ? parsed.metadata.name : '/' + relative;
    const commandPath = canonicalCommandPath(commandName);
    let body = relative === 'advise' ? renderInlineAdvise(parsed.body) : transformResourceText(parsed.body, known).trim();
    let description = normalizeDescription(typeof parsed.metadata.description === 'string' ? parsed.metadata.description : undefined, body, 'Run the /' + relative + ' command workflow.');
    if (relative === 'advise') description = 'Interview-first technical advice with native inline questioning and explicit relay rejection.';
    if (relative === 'coding-level') {
      const marker = '1. Set ' + String.fromCharCode(96) + 'codingLevel' + String.fromCharCode(96) + ' in .codex/.evcrate.json';
      body = body.replace(marker, marker + '.\n   This file is materialized from the canonical EVCrate source; update that source before regenerating to persist changes');
    }
    const skill = 'cmd_' + relative.replaceAll('/', '_');
    const skillName = 'cmd-' + relative.replaceAll('/', '-');
    const tick = String.fromCharCode(96);
    const note = 'Codex note: when this recipe says to run another ' + tick + '/...' + tick + ' command, invoke the matching ' + tick + 'cmd_*' + tick + ' skill for that path.';
    const advice = 'For high-impact architecture, security, debugging, or review decisions, consider explicit ' + tick + '$advisor-strategy' + tick + ' use for current-session guidance; this pointer does not activate it.';
    const text = [markdownFrontmatter({ name: skillName, description }), '# ' + skill, 'Command Path: ' + commandPath, 'Description: ' + description, note, advice, SUBAGENT_WAIT_CONTRACT + body].join('\n\n') + '\n';
    writeText(context, '.agents/skills/' + skill + '/SKILL.md', text);
}
}

function prepareRoots(context: ProjectionBuildContext): void {
  for (const root of ['.codex', '.codex/agents', '.codex/workflows', '.codex/scripts', '.codex/hooks', '.codex/bin', '.agents', '.agents/skills']) ensureProjectionDirectory(context, root);
}

function assertManifest(context: ProjectionBuildContext): void {
  if (context.manifest.id !== 'codex' || context.manifest.outputRoots.length !== 2
    || context.manifest.outputRoots[0] !== '.codex' || context.manifest.outputRoots[1] !== '.agents'
    || context.manifest.sharedJson !== null) fail();
}
export const codexAdapter: ProjectionAdapter = Object.freeze({
  id: 'codex',
  compatibility: {
    skill: { status: 'needsAdapter' },
    agent: { status: 'needsAdapter' },
    workflow: { status: 'needsAdapter' },
    command: { status: 'needsAdapter' },
    hook: { status: 'needsAdapter' }
  } as const,
  build(context: ProjectionBuildContext): void {
    assertManifest(context);
    prepareRoots(context);
    projectDocument(context);
    copyConfigInputs(context); copyWorkflows(context); copyAgents(context); copySkills(context); copyScripts(context); copyHooks(context); commands(context); globalGuidance(context); generatedHooks(context); config(context); behaviorMatrix(context);
    projectCatalogDataAndLayout(context, {
      target: 'codex',
      scriptDirectory: '.codex/scripts',
      commands: {
        format: 'command-skill',
        root: '../../.agents/skills',
        authorityPath: '../migration-behavior-matrix.json',
        mapRecord(cmd) {
          const relative = cmd.source.slice(0, -3);
          const skillDir = 'cmd_' + relative.replaceAll('/', '_');
          const skillName = 'cmd-' + relative.replaceAll('/', '-');
          return {
            name: '/' + skillName,
            path: `${skillDir}/SKILL.md`
          };
        }
      },
      skills: {
        root: '../../.agents/skills',
        authorityPath: '../migration-behavior-matrix.json',
        mapRecord(skill) {
          const first = skill.source.split('/')[0];
          if (SKILLS_TO_SKIP.has(first) || first === 'template-skill') return null;
          const mapped = first.replace(/claude/giu, 'codex');
          return {
            name: skill.name.replace(first, mapped),
            path: skill.path.replace(first, mapped)
          };
        }
      }
    });
  },
  validate(context: ProjectionBuildContext): ProjectionValidation { assertManifest(context); return validateProjection(context); },
});
