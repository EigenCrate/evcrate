import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument, type JsonValue } from '../protocol/json.js';
import { readBoundedFile } from '../filesystem/hashing.js';
import {
  ensureProjectionDirectory,
  graphText,
  textBytes,
  writeProjectionFile,
  validateProjection
} from './projection-utils.js';
import { escapeYamlString, projectCatalogDataAndLayout } from './catalog-data.js';
import { renderMentoringWorkflow } from './advisory.js';
import type { ResourceGraphFile } from './resource-graph.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from './types.js';
import { assertAgentName, assertUniqueNames, commandNameFromSourcePath } from './resource-naming.js';
import { parseMarkdownFrontmatter } from './markdown-frontmatter.js';

const PRETOOL_MATCHER = 'run_command|grep_search|find_by_name|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file';
const FILTERED_PARTS: Record<string, true> = Object.freeze({
  __tests__: true,
  tests: true,
  fixtures: true,
  helpers: true
});
const RESOURCE_SUFFIXES = ['output-styles', 'workflows', 'scripts', 'hooks', 'skills', '.evcrate.json', '.mcp.json', '.env'];
const HOOK_FILES = ['scout-block.cjs', 'privacy-block.cjs', 'pretool-scout-block.cjs', 'pretool-privacy-block.cjs'];
const CONTEXT_HOOKS = ['session-init.cjs', 'dev-rules-reminder.cjs'];
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
function assertResourceNames(context: ProjectionBuildContext): void {
  const names = sourceFiles(context, 'commands')
    .filter((file) => file.path.endsWith('.md'))
    .map((file) => commandNameFromSourcePath(file.path).name);
  for (const file of sourceFiles(context, 'agents')) {
    const stem = file.path.slice('agents/'.length, -3);
    if (file.path.endsWith('.md') && !stem.includes('/')) names.push(assertAgentName(stem, stem));
  }
  assertUniqueNames(names);
}
function productionPath(path: string): boolean {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  return parts.some((part) => FILTERED_PARTS[part] === true) || name.startsWith('fake-')
    || /(?:\.test\.(?:cjs|js|mjs|py)|\.spec\.(?:cjs|js))$/u.test(name);
}
function shouldCopy(path: string): boolean {
  if (path === 'AGENTS.md') return false;
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
function description(content: string): string {
  for (const line of content.split('\n')) {
    const match = /^description\s*:\s*(.*)$/iu.exec(line.trim());
    if (match) return match[1].trim().replace(/^['"]+|['"]+$/gu, '').replaceAll('\\"', '"');
  }
  return 'Migrated command from .claude';
}
function workflowFallback(text: string): string {
  for (const name of ['advice-activation.md', 'plan-progress.md', 'advisor-mentoring.md', 'advisory-interview.md']) {
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

Use this command for candid technical or architectural advice. \`/evc-cmd-advise\` is
separate from \`--advice\` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone \`--agent\` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; quoted, embedded, suffixed, non-final, and differently
cased text remains ordinary input. If a final token requests relay, return
\`ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY\` and say: \`Run /evc-cmd-advise <prompt> without --agent for inline
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
  return workflowFallback(projected.slice(0, relay) + '## Unsupported relay\n\nA final standalone `--agent` returns `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` before advisor delegation, state creation, or inline-interview work. Users can run `/evc-cmd-advise <prompt>` for inline advice.\n');
}
function projectAdvisor(content: string): string {
  const match = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/u.exec(content);
  if (!match) return invalid();
  const { data } = parseMarkdownFrontmatter(content);
  if (Object.hasOwn(data, 'name')) {
    if (typeof data.name !== 'string') return invalid();
    assertAgentName(data.name, 'evc-advisor');
  }
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
  rendered = rendered.replaceAll('.claude/rules/AGENTS.md', '.claude/AGENTS.md');
  for (const prefix of ['~', '$HOME', '${HOME}']) {
    rendered = rendered.replaceAll(`${prefix}/.claude/AGENTS.md`, `${prefix}/.gemini/config/AGENTS.md`);
  }
  rendered = rendered.replaceAll('.claude/AGENTS.md', '.antigravity/AGENTS.md')
    .replace(/(?<![A-Za-z0-9_./-])AGENTS\.md\b/gu, '.antigravity/AGENTS.md');
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
  rendered = rendered.replace(
    /`(?:\.\/)?\.antigravity\/AGENTS\.md`(?! if present; otherwise read)/gu,
    '`.antigravity/AGENTS.md` if present; otherwise read `~/.gemini/config/AGENTS.md` (the published install)'
  );
  return rendered.replace(/__EVCRATE_HARNESS_URL_(\d+)__/gu, (token, index: string) => protectedUrls[Number(index)] ?? token);
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
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !data.toolCall || typeof data.toolCall.name !== 'string'
      || !data.toolCall.args || typeof data.toolCall.args !== 'object' || Array.isArray(data.toolCall.args)) {
    throw new Error('Invalid native tool call');
  }
  {
    const args = data.toolCall.args;
    const toolNames = {
      run_command: 'Bash', grep_search: 'Grep', find_by_name: 'Glob', list_dir: 'Glob',
      view_file: 'Read', replace_file_content: 'Edit', multi_replace_file_content: 'Edit', write_to_file: 'Write',
    };
    const toolName = toolNames[data.toolCall.name];
    if (!toolName) throw new Error('Unsupported native tool call');
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
          if (key === 'AbsolutePath' || key === 'TargetFile') mappedKey = 'file_path';
          else if (key === 'SearchPath' || key === 'SearchDirectory' || key === 'DirectoryPath') mappedKey = 'path';
          else if (key === 'CommandLine') mappedKey = 'command';
          else if (key === 'Pattern') mappedKey = 'pattern';
          newObj[mappedKey] = mapKeys(obj[key]);
        }
        return newObj;
      }
      return obj;
    };

    claudePayload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: data.conversationId,
      transcript_path: data.transcriptPath,
      cwd: projectRoot,
      tool_name: toolName,
      tool_input: mapKeys(args)
    });
  }
} catch {
  process.stdout.write(JSON.stringify({ decision: 'deny', reason: 'EVCREATE_INVALID_TOOL_CALL' }) + '\n');
  process.exit(0);
}
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
function contextWrapper(): string {
  return String.raw`#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const maxBytes = 256 * 1024;
const contextHookTimeoutMs = 25_000;
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = (reason) => {
  process.stderr.write('EVCREATE_CONTEXT_REJECTED: ' + reason + '\n');
  process.exit(2);
};
const assertSafePath = (candidate) => {
  let current = path.resolve(candidate);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Unsafe installed context path');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
};
const readBounded = (fd) => {
  const bytes = Buffer.alloc(maxBytes + 1);
  let size = 0;
  while (size < bytes.length) {
    const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
    if (count === 0) break;
    size += count;
  }
  if (size > maxBytes) throw new Error('Context exceeds byte limit');
  return decoder.decode(bytes.subarray(0, size));
};
const installedInstructions = () => {
  const filename = path.join(__dirname, '..', 'AGENTS.md');
  assertSafePath(filename);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) throw new Error('Invalid installed instructions');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('Installed instructions changed');
    const text = readBounded(fd);
    assertSafePath(filename);
    if (!text.trim() || text.includes('\0')) throw new Error('Empty or invalid installed instructions');
    return text;
  } finally {
    fs.closeSync(fd);
  }
};
const isDirectory = (candidate) => {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
};
const canonicalContext = (hookFile, event, payload, projectRoot) => {
  const sourceHook = path.join(__dirname, hookFile + '.original.cjs');
  assertSafePath(sourceHook);
  if (!fs.lstatSync(sourceHook).isFile()) throw new Error('Context hook unavailable');
  const result = spawnSync(process.execPath, [sourceHook], {
    cwd: projectRoot,
    input: JSON.stringify({ ...payload, hook_event_name: event }),
    maxBuffer: maxBytes,
    timeout: contextHookTimeoutMs,
    // A synchronous deadline cannot escalate after SIGTERM; SIGKILL guarantees completion.
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectRoot,
      GEMINI_PROJECT_DIR: projectRoot,
      AGY_PROJECT_DIR: projectRoot,
      EVCRATE_SESSION_ID: payload.session_id,
    },
  });
  if (result.error || result.status !== 0) throw new Error('Context hook failed');
  const stderr = decoder.decode(result.stderr || Buffer.alloc(0)).trim();
  // Canonical hooks report caught failures on stderr even when they exit zero.
  if (stderr) throw new Error('Context hook reported an error: ' + stderr.slice(0, 2048));
  const stdout = decoder.decode(result.stdout || Buffer.alloc(0)).trim();
  let context = stdout;
  // Canonical hooks emit text today; accept only their additionalContext envelope if structured.
  if (/^[{\[]/u.test(stdout)) {
    const output = JSON.parse(stdout);
    const specific = output && output.hookSpecificOutput;
    if (!output || typeof output !== 'object' || Array.isArray(output)
        || (output.decision !== undefined && output.decision !== 'allow')
        || (output.continue !== undefined && output.continue !== true)
        || !specific || typeof specific !== 'object' || Array.isArray(specific)
        || specific.hookEventName !== event || typeof specific.additionalContext !== 'string') {
      throw new Error('Invalid context hook output');
    }
    context = specific.additionalContext;
  }
  if (context.includes('\0')) throw new Error('Invalid context hook text');
  return context;
};
try {
  // Node resolves symlinked entrypoints before setting __dirname; inspect the invoked path too.
  assertSafePath(process.argv[1]);
  const data = JSON.parse(readBounded(0));
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Number.isSafeInteger(data.invocationNum) || data.invocationNum < 0
      || typeof data.conversationId !== 'string' || !data.conversationId
      || !Array.isArray(data.workspacePaths)) {
    throw new Error('Invalid native invocation');
  }
  // Native rules own instruction injection. This gate verifies this installation only.
  installedInstructions();
  const projectRoot = data.workspacePaths.find(isDirectory);
  if (!projectRoot) throw new Error('Context workspace unavailable');
  const payload = {
    cwd: projectRoot,
    session_id: data.conversationId,
    transcript_path: data.transcriptPath,
  };
  const contexts = [];
  // Official invocationNum is zero-indexed. No native field proves resume/clear/compact.
  if (data.invocationNum === 0) {
    contexts.push(canonicalContext('session-init.cjs', 'SessionStart', { ...payload, source: 'startup' }, projectRoot));
  }
  contexts.push(canonicalContext('dev-rules-reminder.cjs', 'UserPromptSubmit', payload, projectRoot));
  if (contexts.reduce((size, text) => size + Buffer.byteLength(text, 'utf8'), 0) > maxBytes) {
    throw new Error('Combined context exceeds byte limit');
  }
  process.stdout.write(JSON.stringify({
    injectSteps: contexts.filter(Boolean).map((ephemeralMessage) => ({ ephemeralMessage })),
  }) + '\n');
} catch (error) {
  fail(error instanceof Error ? error.message : 'Context unavailable');
}
`;
}
function extractHooks(context: ProjectionBuildContext): Record<string, unknown>[] {
  const settings = context.resources.files.find((file) => file.path === 'settings.json');
  const data: Record<string, JsonValue> = settings ? record(parseText(settings.bytes)) : {};
  const hooks = data.hooks === undefined ? {} : record(data.hooks);
  const behaviors: Record<string, unknown>[] = [];
  const policies: JsonValue[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) invalid();
    for (const group of groups) {
      const entries = record(group).hooks;
      if (!Array.isArray(entries)) invalid();
      for (const hook of entries) {
        const handler = record(hook);
        if (typeof handler.command !== 'string') invalid();
        const policy = event === 'PreToolUse' && HOOK_FILES.some((file) => handler.command === `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/${file}`);
        const session = event === 'SessionStart' && handler.command === 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/session-init.cjs';
        const reminder = event === 'UserPromptSubmit' && handler.command === 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/dev-rules-reminder.cjs';
        if (policy) {
          policies.push({ type: 'command', command: handler.command.replace('node "$CLAUDE_PROJECT_DIR"/.claude/', 'node .antigravity/'), ...(handler.timeout === undefined ? {} : { timeout: handler.timeout }) });
        }
        behaviors.push({
          kind: 'hook', source: event, classification: 'lifecycle-hook',
          status: policy || session || reminder ? 'adapted' : 'unsupported',
          ...(policy ? { target: 'PreToolUse' }
            : session ? { target: 'PreInvocation', reason: 'First invocation only (invocationNum=0); resume, clear and compact have no native lifecycle signal.' }
            : reminder ? { target: 'PreInvocation', reason: 'Reminder per model invocation; native payload does not identify user-prompt submissions.' }
            : { reason: event === 'PostToolUse'
              ? 'Native PostToolUse has no additionalContext output; canonical modularization context is not registered.'
              : 'No equivalent native lifecycle event; not registered.' }),
        });
      }
    }
  }
  const nativeHooks = {
    'evcrate-context': { PreInvocation: [{ type: 'command', command: 'node .antigravity/hooks/pre-invocation.cjs' }] },
    ...(policies.length ? { 'evcrate-policy': { PreToolUse: [{ matcher: PRETOOL_MATCHER, hooks: policies }] } } : {}),
  };
  const bytes = textBytes(pythonJson(nativeHooks));
  writeProjectionFile(context, '.antigravity/hooks.json', bytes);
  writeProjectionFile(context, '.agents/hooks.json', bytes);
  writeProjectionFile(context, '.agents/rules/evcrate-antigravity.md', textBytes([
    '---',
    'trigger: always_on',
    'description: "EVCrate instructions from this Antigravity installation"',
    '---',
    '@[EVCrate instructions](../../.antigravity/AGENTS.md)',
    '',
  ].join('\n')));
  return behaviors;
}
function wrapHooks(context: ProjectionBuildContext): void {
  for (const hookFile of [...HOOK_FILES, ...CONTEXT_HOOKS]) {
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
    if (!CONTEXT_HOOKS.includes(hookFile)) writeProjectionFile(context, path, textBytes(wrapper(hookFile)), true);
  }
  writeProjectionFile(context, '.antigravity/hooks/pre-invocation.cjs', textBytes(contextWrapper()), true);
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
  assertResourceNames(context);
  ensureProjectionDirectory(context, '.antigravity');
  writeProjectionFile(context, '.antigravity/AGENTS.md', textBytes(graphText(context, 'AGENTS.md')));
  for (const file of context.resources.files) if (shouldCopy(file.path)) writeProjectionFile(context, `.antigravity/${file.path}`, file.bytes, file.executable ?? false);
  const hookBehaviors = extractHooks(context);
  const advisor = context.resources.files.find((file) => file.path === 'agents/evc-advisor.md');
  if (advisor) writeProjectionFile(context, '.antigravity/agents/evc-advisor.md', textBytes(projectAdvisor(decode(advisor.bytes))));
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
    const identity = commandNameFromSourcePath(file.path);
    const content = decode(file.bytes);
    const name = identity.name;
    const command = `/${name}`;
    let body = content.replaceAll('python .claude/scripts/ev-help.py', 'python .antigravity/scripts/ev-help.py')
      .replaceAll('.claude/workflows/', '.antigravity/workflows/');
    body = workflowFallback(body);
    const commandDescription = identity.semanticId === 'advise'
      ? 'Interview-first technical advice with native inline questioning and explicit relay rejection'
      : description(body);
    if (identity.semanticId === 'advise') body = inlineAdviseCommand(body);
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
  rewriteAll(context);
  wrapHooks(context);
  const behaviors: Record<string, unknown>[] = [...hookBehaviors];
  behaviors.push({ kind: 'project-doc', source: 'AGENTS.md', classification: 'instruction-context', status: 'migrated', target: '.agents/rules/evcrate-antigravity.md', reason: 'Native always_on include; HOME standalone AGENTS.md. PreInvocation verifies, never reinjects instructions.' });
  for (const file of sourceFiles(context, 'commands')) {
    if (!file.path.endsWith('.md')) continue;
    const identity = commandNameFromSourcePath(file.path);
    behaviors.push({ kind: 'command-prose', source: `${identity.name}.md`, classification: 'command-prose', status: 'migrated', target: `${identity.name}/SKILL.md`, target_name: identity.name });
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
        const command = commandNameFromSourcePath(`commands/${cmd.source}`);
        return {
          name: '/' + command.name,
          path: `${command.name}/SKILL.md`
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
