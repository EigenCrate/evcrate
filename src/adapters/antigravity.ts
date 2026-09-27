import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument, type JsonValue } from '../protocol/json.js';
import { readBoundedFile } from '../filesystem/hashing.js';
import {
  ensureProjectionDirectory,
  textBytes,
  writeProjectionFile,
  validateProjection
} from './projection-utils.js';
import { escapeYamlString, projectCatalogDataAndLayout } from './catalog-data.js';
import { renderMentoringWorkflow } from './advisory.js';
import type { ResourceGraphFile } from './resource-graph.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from './types.js';

const PRETOOL_MATCHER = 'run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file';
const FILTERED_PARTS: Record<string, true> = Object.freeze({
  __tests__: true,
  tests: true,
  fixtures: true,
  helpers: true
});
const RESOURCE_SUFFIXES = ['output-styles', 'workflows', 'scripts', 'hooks', 'skills', '.evcrate.json', '.mcp.json', '.env'];
const HOOK_FILES = ['scout-block.cjs', 'privacy-block.cjs', 'pretool-scout-block.cjs', 'pretool-privacy-block.cjs'];
const URI = /(?<![A-Za-z0-9./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/giu;

function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function unsafe(): never { throw new ControlPlaneError('PATH_UNSAFE'); }
function record(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, JsonValue>;
}
function sourceFiles(context: ProjectionBuildContext, prefix: string): readonly ResourceGraphFile[] {
  return context.resources.files.filter((file) => file.path === prefix || file.path.startsWith(`${prefix}/`));
}
function productionPath(path: string): boolean {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  return parts.some((part) => FILTERED_PARTS[part] === true) || name.startsWith('fake-')
    || /(?:\.test\.(?:cjs|js|mjs|py)|\.spec\.(?:cjs|js))$/u.test(name);
}
function shouldCopy(path: string): boolean {
  if (path === 'settings.json' || path === 'settings.local.json' || path === '.mcp.json.example') return false;
  if (path === 'scripts/commands_data.yaml' || path === 'scripts/skills_data.yaml') return false;
  if (/^(?:agents|commands)(?:\/|$)/u.test(path)) return false;
  if (/^(?:statusline\.cjs|statusline\.ps1|statusline\.sh)$/u.test(path)) return false;
  return !path.split('/').some((part) => part.includes('advise-state')) && !productionPath(path);
}
function pythonJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) return invalid();
  let escaped = '';
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    escaped += code > 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : json[index];
  }
  return escaped;
}
function decode(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return invalid(); }
}
function parseText(bytes: Uint8Array): unknown {
  try { return parseJsonDocument(bytes); } catch { return invalid(); }
}
function commandPath(content: string, fallback: string): string {
  for (const line of content.split('\n')) {
    const match = /^name\s*:\s*(.*)$/iu.exec(line.trim());
    const value = match?.[1]?.trim().replace(/^['"]+|['"]+$/gu, '');
    if (value?.startsWith('/')) return value;
  }
  return `/${fallback}`;
}
function description(content: string): string {
  for (const line of content.split('\n')) {
    const match = /^description\s*:\s*(.*)$/iu.exec(line.trim());
    if (match) return match[1].trim().replace(/^['"]+|['"]+$/gu, '').replaceAll('\\"', '"');
  }
  return 'Migrated command from .claude';
}
function workflowFallback(text: string): string {
  for (const name of ['advisor-mentoring.md', 'advisory-interview.md']) {
    text = text.replaceAll(`\`.antigravity/workflows/${name}\``, `\`.antigravity/workflows/${name}\` if present; otherwise read \`~/.gemini/config/workflows/${name}\` (the published install)`);
  }
  return text;
}
function advisoryCapabilities(text: string): string {
  const start = '<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->';
  const end = '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';
  if (text.split(start).length !== 2 || text.split(end).length !== 2) return invalid();
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (to < from) return invalid();
  const body = text.slice(from + start.length, to).trim();
  if (body !== '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->') return invalid();
  const replacement = [
    start,
    '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->',
    '<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/antigravity/v1 -->',
    '<!-- EVCRATE_CAPABILITY_ERROR: ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY -->',
    end
  ].join('\n');
  return text.slice(0, from) + replacement + text.slice(to + end.length)
    .replaceAll('advise-agent-relay/claude/v1', 'advise-agent-relay/unsupported/antigravity/v1');
}
function inlineAdviseCommand(canonical: string): string {
  const projected = advisoryCapabilities(canonical);
  const start = projected.indexOf('<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->');
  const end = projected.indexOf('<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->')
    + '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->'.length;
  const capabilities = projected.slice(start, end);
  return `<!-- generated target: antigravity -->
${capabilities}

Use this command for candid technical or architectural advice. \`/advise\` is
separate from \`--advice\` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone \`--agent\` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; quoted, embedded, suffixed, non-final, and differently
cased text remains ordinary input. If a final token requests relay, return
\`ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY\` and say: \`Run /advise <prompt> without --agent for inline
advice.\` Do not invoke an advisor, create relay
state, or silently continue in inline mode.

## Inline interview

Run in the main session. Do not invoke a subagent or create persistent state.

1. Analyze only bounded local context relevant to the prompt or URL.
2. Ask exactly one concise substantive question per turn using \`ask_user\`.
   Never batch questions or infer an answer. Stop after eight discovery questions.
3. Present one \`reframe\` and require explicit \`confirm\` or \`correct\`. Permit
   at most two confirmation/correction cycles. On exhaustion, return
   \`INTERVIEW_NOT_CONVERGED\` and write no report.
4. After confirmation, write a concise Markdown report with exactly these
   headings: \`## Reframed problem\`, \`## Recommendation\`,
   \`## Alternatives/tradeoffs\`, \`## Risks\`, \`## Assumptions/evidence gaps\`,
   \`## Success checks\`, \`## Next actions\`, and \`## Unresolved questions\`.
5. Write the sanitized report to the active \`<plan>/reports\` directory, or
   \`plans/reports\` when there is no active plan. Never include credentials,
   environment values, tool traces, fetched page bodies, or model reasoning.
`;
}
function advisoryWorkflow(text: string): string {
  let projected = advisoryCapabilities(text).replace(
    'The second marker is a Claude-only capability claim. Generated targets must\nreplace it with their tested capability or an explicit unsupported result;\npresence of a generated file is never runtime proof.',
    "The second marker records this target's explicit `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` relay rejection.\nGenerated-file presence is never runtime proof."
  );
  projected = projected.replace('`design a cache --agent` | Claude relay | `design a cache`', '`design a cache --agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` | no inline interview');
  projected = projected.replace('`design a cache --agent ` | Claude relay | `design a cache`', '`design a cache --agent ` | `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` | no inline interview');
  projected = projected.replace('`--agent` | Claude relay, empty prompt | empty; normal empty-input handling', '`--agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` | no inline interview');
  projected = projected.replace(
    'Inline mode keeps the active conversation in the main session. Relay mode\npersists only the bounded, sanitized invocation state through\n`scripts/advise-state.cjs`. Both modes ask exactly one question per turn.\n\nThe helper exposes the executable `parse`, `validate-envelope`, `write-report`,\nand `validate-report` operations in addition to state lifecycle operations.\nCommands must call those operations; prose is not a substitute for validation.\n\n',
    'Inline mode keeps the active conversation in the main session and asks exactly\none question per turn. No relay state is created on this target.\n\n'
  );
  const relay = projected.indexOf('## Relay turn envelope');
  if (relay < 0) return invalid();
  return workflowFallback(projected.slice(0, relay) + '## Unsupported relay\n\nA final standalone `--agent` returns `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` before advisor delegation, state creation, or inline-interview work. Users can run `/advise <prompt>` for inline advice.\n');
}
function projectAdvisor(content: string): string {
  const match = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/u.exec(content);
  if (!match) return invalid();
  const frontmatter = match[1]
    .replace(/^model:\s*opus$/mu, 'model: pro')
    .replace(/^description:.*$/mu, 'description: Use this high-tier mentor for fresh named checkpoints; Antigravity uses the central controller.');
  if (!match[2].includes('## Required checkpoint method') || !match[2].includes('## Checkpoint terminal report')) return invalid();
  return frontmatter + workflowFallback(match[2]);
}
function renderResourcePath(scope: 'global' | 'local', suffix: string): string {
  return scope === 'global' ? `.gemini/config/${suffix}` : `.antigravity/${suffix}`;
}
function renderHarness(text: string): string {
  const protectedUrls: string[] = [];
  let rendered = text.replace(URI, (url) => {
    const token = `__EVCRATE_HARNESS_URL_${protectedUrls.length}__`;
    protectedUrls.push(url);
    return token;
  });
  const suffixes = [...RESOURCE_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const prefix of ['~', '$HOME', '${HOME}']) {
    for (const suffix of suffixes) {
      rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, `${prefix}/${renderResourcePath('global', suffix)}`);
    }
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.gemini/config`);
  }
  for (const suffix of suffixes) {
    rendered = rendered.replaceAll(`.claude/${suffix}`, renderResourcePath('local', suffix));
  }
  const suffixPattern = suffixes.map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
  const joinPattern = new RegExp(`path\\.join\\(\\s*(os\\.homedir\\(\\)|process\\.cwd\\(\\))\\s*,\\s*(['"])\\.claude\\2\\s*,\\s*\\2(${suffixPattern})\\2`, 'gu');
  rendered = rendered.replace(joinPattern, (_match, base: string, quote: string, suffix: string) => {
    const scope = base === 'os.homedir()' ? 'global' : 'local';
    return `path.join(${base}, ${quote}${renderResourcePath(scope, suffix).split('/').join(`${quote}, ${quote}`)}${quote}`;
  });
  const componentPattern = new RegExp(`(home|Path\\.home\\(\\)|os\\.homedir\\(\\)|process\\.cwd\\(\\)|project_root|directory|current|[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)\\s*/\\s*(['"])\\.claude\\2\\s*/\\s*\\2(${suffixPattern})\\2`, 'gu');
  rendered = rendered.replace(componentPattern, (_match, base: string, quote: string, suffix: string) => {
    const global = base === 'home' || base === 'Path.home()' || base === 'os.homedir()';
    return `${base} / ${quote}${renderResourcePath(global ? 'global' : 'local', suffix).split('/').join(`${quote} / ${quote}`)}${quote}`;
  });
  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\'"`()\]\}]|\s|$))/gu, '.antigravity');
  return protectedUrls.reduce((result, url, index) => result.replaceAll(`__EVCRATE_HARNESS_URL_${index}__`, url), rendered);
}
function wrapper(hookFile: string): string {
  return String.raw`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const input = fs.readFileSync(0, 'utf-8');

const sourceHook = path.join(__dirname, "${hookFile}.original.cjs");

const hasSymlinkedPathComponent = (candidate) => {
  let current = path.resolve(candidate);
  while (true) {
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return true;
    }
    if (stat.isSymbolicLink()) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
};

const isUsableHook = (candidate) => {
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && !hasSymlinkedPathComponent(candidate);
  } catch {
    return false;
  }
};

// Format Antigravity payload for Claude hook
let claudePayload = input;
let projectRoot = process.cwd();
const isWorkspaceDirectory = (candidate) => {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
};
try {
  const data = JSON.parse(input);
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const workspaceCandidates = [
      ...(Array.isArray(data.workspacePaths) ? data.workspacePaths : []),
      data.cwd,
      process.env.AGY_PROJECT_DIR,
      process.env.GEMINI_PROJECT_DIR,
      process.env.CLAUDE_PROJECT_DIR,
      process.cwd(),
    ];
    projectRoot = workspaceCandidates.find(isWorkspaceDirectory) || process.cwd();
  }
  if (data && !data.tool_input && data.toolCall && data.toolCall.args) {
    const args = data.toolCall.args;
    let toolName = "unknown";
    if (args.CommandLine) toolName = "run_command";
    else if (args.TargetFile) toolName = "replace_file_content";
    else if (args.Query) toolName = "grep_search";
    else if (args.DirectoryPath) toolName = "list_dir";
    else if (args.AbsolutePath) toolName = "view_file";

    const mapKeys = (obj) => {
      if (typeof obj === "string") {
        const normalized = obj.replace(/\\/g, '/');
        const projectNormalized = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normalized === projectNormalized) return '';
        if (normalized.startsWith(projectNormalized + '/')) return normalized.slice(projectNormalized.length + 1);
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(mapKeys);
      if (typeof obj === "object" && obj !== null) {
        const newObj = {};
        for (const key of Object.keys(obj)) {
          let mappedKey = key;
          if (key === 'AbsolutePath') mappedKey = 'path';
          else if (key === 'TargetFile') mappedKey = 'path';
          else if (key === 'SearchPath') mappedKey = 'path';
          else if (key === 'DirectoryPath') mappedKey = 'path';
          else if (key === 'CommandLine') mappedKey = 'command';
          newObj[mappedKey] = mapKeys(obj[key]);
        }
        return newObj;
      }
      return obj;
    };

    claudePayload = JSON.stringify({
      tool_name: toolName,
      tool_input: mapKeys(args)
    });
  }
} catch(e) {}
if (!isUsableHook(sourceHook)) {
  process.stdout.write(JSON.stringify({
    decision: "deny",
    reason: "EVCREATE_HOOK_UNAVAILABLE",
  }) + '\n');
  process.exit(0);
}

const result = spawnSync(process.execPath, [sourceHook], {
  cwd: projectRoot,
  input: claudePayload,
  encoding: 'utf-8',
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: projectRoot,
    GEMINI_PROJECT_DIR: projectRoot,
    AGY_PROJECT_DIR: projectRoot,
  },
});

const reason = (result.stderr || result.stdout || '').trim();
if (result.status === 0 && !result.error) {
  // Allow
  process.stdout.write(JSON.stringify({ decision: "allow" }) + '\n');
  process.exit(0);
} else {
  // Deny
  process.stdout.write(JSON.stringify({
    decision: "deny",
    reason: reason || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.'
  }) + '\n');
  process.exit(0);
}
`;
}
function neutralHookCommand(command: string): string {
  const prefixes: readonly [string, string][] = [
    ['"$CLAUDE_PROJECT_DIR"/.claude/hooks', '"$AGY_PROJECT_DIR"/.antigravity/hooks'],
    ["'$CLAUDE_PROJECT_DIR'/.claude/hooks", "'$AGY_PROJECT_DIR'/.antigravity/hooks"],
    ['$CLAUDE_PROJECT_DIR/.claude/hooks', '$AGY_PROJECT_DIR/.antigravity/hooks'],
    ['${CLAUDE_PROJECT_DIR}/.claude/hooks', '${AGY_PROJECT_DIR}/.antigravity/hooks']
  ];
  return prefixes.reduce((value, [source, target]) => value.replaceAll(source, target), command);
}
function extractHooks(context: ProjectionBuildContext): void {
  const settings = context.resources.files.find((file) => file.path === 'settings.json');
  if (!settings) return;
  const data = record(parseText(settings.bytes));
  let hooks: Record<string, JsonValue> = {};
  if ('hooks' in data) {
    if (data.hooks === null || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) invalid();
    hooks = data.hooks as Record<string, JsonValue>;
  }
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) invalid();
    for (const group of groups) {
      if (group === null || typeof group !== 'object' || Array.isArray(group)) invalid();
      const entries = (group as Record<string, JsonValue>).hooks;
      if (entries === undefined) continue;
      if (!Array.isArray(entries)) invalid();
      for (const hook of entries) {
        if (hook === null || typeof hook !== 'object' || Array.isArray(hook)) invalid();
        const object = hook as Record<string, JsonValue>;
        if (object.command !== undefined && typeof object.command !== 'string') invalid();
        if (typeof object.command === 'string') object.command = neutralHookCommand(object.command);
      }
    }
  }
  if ('PreToolUse' in hooks) {
    const pretool = hooks.PreToolUse;
    if (!Array.isArray(pretool)) invalid();
    for (const group of pretool) {
      if (group === null || typeof group !== 'object' || Array.isArray(group)) invalid();
      if ('matcher' in group) (group as Record<string, JsonValue>).matcher = PRETOOL_MATCHER;
    }
  }
  writeProjectionFile(context, '.antigravity/hooks.json', textBytes(pythonJson({ hooks })));
}
function wrapHooks(context: ProjectionBuildContext): void {
  for (const hookFile of HOOK_FILES) {
    const path = `.antigravity/hooks/${hookFile}`;
    let stat;
    try {
      stat = lstatSync(context.stagePath(path));
      if (stat.isSymbolicLink() || !stat.isFile()) unsafe();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const source = readBoundedFile(context.stagePath(path), 16 * 1024 * 1024);
    writeProjectionFile(context, `${path}.original.cjs`, source);
    writeProjectionFile(context, path, textBytes(wrapper(hookFile)), true);
  }
}
function rewriteAll(context: ProjectionBuildContext): void {
  const root = context.stagePath('.antigravity');
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const current = join(directory, entry.name);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) unsafe();
      if (stat.isDirectory()) { visit(current); continue; }
      if (!stat.isFile()) unsafe();
      const bytes = readBoundedFile(current, 16 * 1024 * 1024);
      if (bytes.subarray(0, 1024).includes(0)) continue;
      let content: string;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { continue; }
      const rendered = renderHarness(content);
      const finalText = current.toLowerCase().endsWith('.sh') ? rendered.replace(/\r\n?/gu, '\n') : rendered;
      const relativePath = relative(context.stage.path, current).split('\\').join('/');
      if (rendered !== content || current.toLowerCase().endsWith('.sh')) writeProjectionFile(context, relativePath, textBytes(finalText), current.toLowerCase().endsWith('.sh') || (stat.mode & 0o111) !== 0);
    }
  };
  visit(root);
}
function assertManifest(context: ProjectionBuildContext): void {
  if (context.manifest.id !== 'antigravity' || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.antigravity' || context.manifest.sharedJson !== null) invalid();
}
function build(context: ProjectionBuildContext): void {
  assertManifest(context);
  ensureProjectionDirectory(context, '.antigravity');
  for (const file of context.resources.files) if (shouldCopy(file.path)) writeProjectionFile(context, `.antigravity/${file.path}`, file.bytes, file.executable ?? false);
  extractHooks(context);
  const advisor = context.resources.files.find((file) => file.path === 'agents/advisor.md');
  if (advisor) writeProjectionFile(context, '.antigravity/agents/advisor.md', textBytes(projectAdvisor(decode(advisor.bytes))));
  const workflow = context.resources.files.find((file) => file.path === 'workflows/advisory-interview.md');
  if (workflow) {
    const content = decode(workflow.bytes);
    writeProjectionFile(context, '.antigravity/workflows/advisory-interview.md', textBytes(advisoryWorkflow(content)));
  }
  const mentoring = context.resources.files.find((file) => file.path === 'workflows/advisor-mentoring.md');
  if (mentoring) {
    const content = decode(mentoring.bytes);
    writeProjectionFile(context, '.antigravity/workflows/advisor-mentoring.md', textBytes(renderMentoringWorkflow(content, 'antigravity')));
  }
  for (const file of sourceFiles(context, 'commands')) {
    if (!file.path.endsWith('.md')) continue;
    const suffix = file.path.slice('commands/'.length, -3);
    const content = decode(file.bytes);
    const name = `cmd_${suffix.replaceAll('/', '_')}`;
    const command = commandPath(content, suffix);
    let body = content.replaceAll('python .claude/scripts/ev-help.py', 'python .antigravity/scripts/ev-help.py')
      .replaceAll('.claude/workflows/', '.antigravity/workflows/');
    body = workflowFallback(body);
    const commandDescription = suffix === 'advise'
      ? 'Interview-first technical advice with native inline questioning and explicit relay rejection'
      : description(body);
    if (suffix === 'advise') body = inlineAdviseCommand(body);
    const text = `---
name: ${name}
description: ${escapeYamlString(commandDescription)}
---
# ${name}

Command Path: ${command}

Description: ${commandDescription}

${body}`;
    writeProjectionFile(context, `.antigravity/skills/${name}/SKILL.md`, textBytes(text));
  }
  wrapHooks(context);
  rewriteAll(context);
  const behaviors: Record<string, unknown>[] = [];
  for (const file of sourceFiles(context, 'commands')) {
    if (!file.path.endsWith('.md')) continue;
    const suffix = file.path.slice('commands/'.length, -3);
    const name = `cmd_${suffix.replaceAll('/', '_')}`;
    behaviors.push({ kind: 'command-prose', source: `${suffix}.md`, classification: 'command-prose', status: 'migrated', target: `${name}/SKILL.md`, target_name: name });
  }
  for (const file of sourceFiles(context, 'skills')) {
    if (!file.path.endsWith('/SKILL.md') || file.path.includes('template-skill')) continue;
    const rel = file.path.slice('skills/'.length);
    behaviors.push({ kind: 'skill-package', source: rel, classification: 'skill-package', status: 'migrated', target: rel, target_name: rel.slice(0, -'/SKILL.md'.length) });
  }
  writeProjectionFile(context, '.antigravity/migration-behavior-matrix.json', textBytes(JSON.stringify({ target: 'antigravity', behaviors }, null, 2) + '\n'));
  projectCatalogDataAndLayout(context, {
    target: 'antigravity',
    scriptDirectory: '.antigravity/scripts',
    commands: {
      format: 'command-skill',
      root: '../skills',
      authorityPath: '../migration-behavior-matrix.json',
      mapRecord(cmd) {
        const suffix = cmd.source.slice(0, -3);
        const name = `cmd_${suffix.replaceAll('/', '_')}`;
        return {
          name: '/' + name,
          path: `${name}/SKILL.md`
        };
      }
    },
    skills: {
      root: '../skills',
      authorityPath: '../migration-behavior-matrix.json',
      mapRecord(skill) {
        return {
          name: skill.name,
          path: skill.path
        };
      }
    }
  });
}
export const antigravityAdapter: ProjectionAdapter = Object.freeze({
  id: 'antigravity',
  compatibility: {
    skill: { status: 'needsAdapter' },
    agent: { status: 'needsAdapter' },
    workflow: { status: 'needsAdapter' },
    command: { status: 'needsAdapter' },
    hook: { status: 'needsAdapter' }
  } as const,
  build,
  validate(context: ProjectionBuildContext): ProjectionValidation { assertManifest(context); return validateProjection(context); }
});
