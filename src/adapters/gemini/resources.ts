import { lstatSync } from 'node:fs';
import { basename } from 'node:path';
import type { ProjectionBuildContext } from '../types.js';
import {
  copyGraphFile, ensureProjectionDirectory, graphFile, graphText, siblingBytes, sourceSibling,
  writeProjectionFile, textBytes, isProductionControllerArtifact,
} from '../projection-utils.js';
import { applyTargetReplacements, renderExternalScoutStrategy, TOOL_MAPPING, VALID_GEMINI_TOOLS } from './replacements.js';
import { parseMarkdownFrontmatter, writeMarkdownFrontmatter, writeToml, type Frontmatter, type FrontmatterValue } from './frontmatter.js';
import { renderAdvisoryInterviewWorkflow, renderInlineAdviseCommand, renderMentoringWorkflow } from '../advisory.js';
import { assertAgentName, assertUniqueNames, commandNameFromSourcePath } from '../resource-naming.js';

const SKIP_SKILLS = new Set(['claude-code', 'skill-creator']);
const EVENTS: Record<string, string> = { SessionStart: 'SessionStart', UserPromptSubmit: 'BeforeAgent', PreToolUse: 'BeforeTool', SessionEnd: 'SessionEnd' };
const UNSUPPORTED_EVENTS: Record<string, string> = {
  SubagentStart: 'No Gemini CLI hook directly targets subagent startup; behavior is intentionally dropped.',
  PreCompact: 'No clean Gemini CLI equivalent for Claude PreCompact; behavior is intentionally dropped.',
};
const CONTEXT_NAMES = ['GEMINI.md', 'AGENTS.md', 'CLAUDE.md'];

function filesUnder(context: ProjectionBuildContext, prefix: string) {
  return context.resources.files.filter((file) => file.path === prefix || file.path.startsWith(`${prefix}/`));
}
function textFile(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, 1024).includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
}
function transformed(context: ProjectionBuildContext, source: string, bytes: Uint8Array): Uint8Array {
  if (!textFile(bytes)) return bytes;
  let value = applyTargetReplacements(new TextDecoder().decode(bytes));
  if (source === 'scripts/ev-help.py') {
    value = value.replace('("GEMINI_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")',
      '("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR")');
  }
  return textBytes(value);
}
function optionalDocument(context: ProjectionBuildContext, name: string): boolean {
  const path = sourceSibling(context, name);
  try { const stat = lstatSync(path); if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe'); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function nestedValue(value: FrontmatterValue): FrontmatterValue {
  if (typeof value === 'string') return applyTargetReplacements(value);
  if (Array.isArray(value)) return value.map(nestedValue);
  return value;
}

export function projectAgents(context: ProjectionBuildContext): void {
  ensureProjectionDirectory(context, '.gemini/agents');
  const agents = filesUnder(context, 'agents').filter((file) => file.path.endsWith('.md') && !file.path.slice('agents/'.length).includes('/'));
  assertUniqueNames(agents.map((file) => assertAgentName(basename(file.path, '.md'), basename(file.path, '.md'))));
  for (const file of agents) {
    const name = basename(file.path);
    const agentName = assertAgentName(name.slice(0, -3), name.slice(0, -3));
    const parsed = parseMarkdownFrontmatter(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    const frontmatter: Frontmatter = { ...parsed.data, name: agentName };
    let body = applyTargetReplacements(parsed.body);
    if (name === 'evc-scout-external.md') body = renderExternalScoutStrategy(body);
    if (name === 'evc-advisor.md') {
      if (!body.includes('## Required checkpoint method') || !body.includes('## Checkpoint terminal report')) throw new Error('Canonical advisor is missing its checkpoint contract');
    }
    if (frontmatter.description === undefined) {
      const match = /^description:\s*(.*)$/imu.exec(body);
      frontmatter.description = match ? match[1].trim() : `Subagent ${String(frontmatter.name)}`;
      if (match) body = body.replace(/^description:\s*.*$\n?/imu, '');
    }
    if (frontmatter.tools !== undefined) {
      const raw = Array.isArray(frontmatter.tools) ? frontmatter.tools : [frontmatter.tools];
      const mapped = [...new Set(raw.flatMap((item) => String(item).split(',').map((tool) => TOOL_MAPPING[String(tool).trim()] ?? String(tool).trim())))]
        .filter((tool) => VALID_GEMINI_TOOLS.has(tool) || tool.startsWith('mcp_')).sort();
      frontmatter.tools = mapped.length ? mapped : ['read_file', 'glob', 'grep_search'];
    }
    for (const key of ['Examples', 'Context', 'user', 'assistant']) delete frontmatter[key];
    for (const [key, value] of Object.entries(frontmatter)) frontmatter[key] = nestedValue(value);
    if (name === 'evc-advisor.md') frontmatter.description = 'Use this high-tier mentor for fresh named checkpoints; Gemini rejects interview relay.';
    writeProjectionFile(context, `.gemini/agents/${name}`, textBytes(writeMarkdownFrontmatter(frontmatter, body)), file.executable ?? false);
  }
}

export function projectCommands(context: ProjectionBuildContext): void {
  ensureProjectionDirectory(context, '.gemini/commands'); ensureProjectionDirectory(context, '.gemini/skills');
  const files = filesUnder(context, 'commands').filter((file) => file.path.endsWith('.md'));
  assertUniqueNames(files.map((file) => commandNameFromSourcePath(file.path).name));
  for (const file of files) {
    const command = commandNameFromSourcePath(file.path);
    const parsed = parseMarkdownFrontmatter(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    let body = parsed.body;
    let description = applyTargetReplacements(String(parsed.data.description ?? ''));
    if (command.semanticId === 'advise') {
      body = renderInlineAdviseCommand(body, 'gemini', 'ask_user'); description = 'Interview-first technical advice with native inline questioning and explicit relay rejection.';
    } else body = applyTargetReplacements(body);
    writeProjectionFile(context, `.gemini/commands/${command.name}.toml`, textBytes(writeToml({ description, prompt: body.trim() })), file.executable ?? false);
    const skillBody = `---\nname: ${command.name}\ndescription: ${description}\n---\n# ${command.name}\n\nCommand Path: /${command.name}\n\nDescription: ${description}\n\n${body.trim()}\n`;
    writeProjectionFile(context, `.gemini/skills/${command.name}/SKILL.md`, textBytes(skillBody), false);
  }
}


export function projectSkills(context: ProjectionBuildContext): void {
  ensureProjectionDirectory(context, '.gemini/skills');
  for (const file of filesUnder(context, 'skills')) {
    const relative = file.path.slice('skills/'.length); const segments = relative.split('/');
    const top = segments[0];
    if (!relative.includes('/') || SKIP_SKILLS.has(top)) continue;
    segments[0] = top.replace(/claude/giu, 'gemini');
    let destination = segments.join('/');
    if (basename(destination).toLowerCase() === 'skill.md') destination = destination.slice(0, -basename(destination).length) + 'SKILL.md';
    writeProjectionFile(context, `.gemini/skills/${destination}`, transformed(context, file.path, file.bytes), file.executable ?? false);
  }
}

export function projectWorkflows(context: ProjectionBuildContext): void {
  ensureProjectionDirectory(context, '.gemini/workflows');
  for (const file of filesUnder(context, 'workflows')) {
    if (!file.path.endsWith('.md') || file.path.slice('workflows/'.length).includes('/')) continue;
    let content = graphText(context, file.path);
    if (basename(file.path) === 'advisory-interview.md') content = renderAdvisoryInterviewWorkflow(content, 'gemini');
    else if (basename(file.path) === 'advisor-mentoring.md') content = applyTargetReplacements(renderMentoringWorkflow(content, 'gemini'));
    else content = applyTargetReplacements(content);
    writeProjectionFile(context, `.gemini/workflows/${basename(file.path)}`, textBytes(content), graphFile(context, file.path).executable ?? false);
  }
}
