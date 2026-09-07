import { lstatSync } from 'node:fs';
import { basename } from 'node:path';
import type { ProjectionBuildContext } from '../types.js';
import { parseJsonDocument } from '../../protocol/json.js';
import { graphFile, sourceSibling, writeProjectionFile, ensureProjectionDirectory, textBytes, isProductionControllerArtifact } from '../projection-utils.js';
import { applyTargetReplacements, TOOL_MAPPING } from './replacements.js';
const EVENTS: Record<string, string> = { SessionStart: 'SessionStart', UserPromptSubmit: 'BeforeAgent', PreToolUse: 'BeforeTool', SessionEnd: 'SessionEnd' };
const DROPPED: Record<string, string> = { SubagentStart: 'No Gemini CLI hook directly targets subagent startup; behavior is intentionally dropped.', PreCompact: 'No clean Gemini CLI equivalent for Claude PreCompact; behavior is intentionally dropped.' };
const CONTEXT_NAMES = ['GEMINI.md', 'AGENTS.md', 'CLAUDE.md'];
const HOOK_MATCHER = 'run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file';

function sourceExists(context: ProjectionBuildContext, path: string): boolean {
  try { const stat = lstatSync(sourceSibling(context, path)); return stat.isFile() && !stat.isSymbolicLink(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function sourceJson(context: ProjectionBuildContext): Record<string, unknown> {
  if (!context.resources.files.some((file) => file.path === 'settings.json')) return {};
  const parsed = parseJsonDocument(graphFile(context, 'settings.json').bytes);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}
function transformJson(value: unknown): unknown {
  if (typeof value === 'string') {
    return applyTargetReplacements(value)
      .replace(/node\s+"?(\$GEMINI_PROJECT_DIR)"?\/\.gemini\/hooks\//gu, '$1/.gemini/hooks/');
  }
  if (Array.isArray(value)) return value.map(transformJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transformJson(item)]));
  return value;
}
function merge(base: unknown, override: unknown): unknown {
  if (!base || typeof base !== 'object' || Array.isArray(base) || !override || typeof override !== 'object' || Array.isArray(override)) return override;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    const old = result[key];
    if (old && typeof old === 'object' && !Array.isArray(old) && value && typeof value === 'object' && !Array.isArray(value)) result[key] = merge(old, value);
    else if (Array.isArray(old) && Array.isArray(value) && value.every((item) => item && typeof item === 'object' && 'name' in item)) {
      const items = [...old] as Record<string, unknown>[];
      for (const item of value as Record<string, unknown>[]) {
        const index = items.findIndex((candidate) => candidate && candidate.name === item.name);
        if (index < 0) items.push(item); else items[index] = merge(items[index], item) as Record<string, unknown>;
      }
      result[key] = items;
    } else result[key] = value;
  }
  return result;
}
function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, sortObject(item)]));
}
function bridge(kind: 'context' | 'block' | 'passthrough', event: string, source: string): string {
  const escaped = JSON.stringify(source); const eventJson = JSON.stringify(event);
  const unavailable = kind === 'block' ? `JSON.stringify({decision:'deny',reason:'EVCREATE_HOOK_UNAVAILABLE',hookSpecificOutput:{hookEventName:${eventJson}}})` : "JSON.stringify({})";
  const output = kind === 'context' ? `const out=(result.stdout||'').trim();process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:${eventJson},additionalContext:out}}));` :
    kind === 'passthrough' ? "process.stdout.write(JSON.stringify({}));" :
    `const ok=result.status===0&&!result.error;process.stdout.write(ok?JSON.stringify({decision:'allow',hookSpecificOutput:{hookEventName:${eventJson}}}):JSON.stringify({decision:'deny',reason:(result.stderr||result.stdout||'').trim()||'Blocked by migrated Claude hook.',hookSpecificOutput:{hookEventName:${eventJson}}}));`;
  const inputTransform = kind === 'block' ? "try{const d=JSON.parse(input);const a=d?.toolCall?.args;if(a){const keys={AbsolutePath:'path',TargetFile:'path',SearchPath:'path',DirectoryPath:'path',CommandLine:'command'};payload=JSON.stringify({tool_name:a.CommandLine?'run_command':a.TargetFile?'replace_file_content':a.Query?'grep_search':a.DirectoryPath?'list_dir':a.AbsolutePath?'view_file':'unknown',tool_input:Object.fromEntries(Object.entries(a).map(([k,v])=>[keys[k]||k,v]))});}}catch{}" : '';
  return `#!/usr/bin/env node\nconst fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');const input=fs.readFileSync(0,'utf8');let payload=input;const project=process.env.GEMINI_PROJECT_DIR||process.cwd();const hook=path.join(project,${escaped});${inputTransform}if(!fs.existsSync(hook)){process.stdout.write(${unavailable});process.exit(0)}const result=spawnSync(process.execPath,[hook],{input:payload,encoding:'utf8',env:{...process.env,CLAUDE_PROJECT_DIR:project,GEMINI_PROJECT_DIR:project,EVCRATE_CONFIG_DIR:'.gemini'}});${output}\n`;
}

export function projectHooks(context: ProjectionBuildContext): void {
  for (const file of context.resources.files.filter((entry) => entry.path.startsWith('hooks/'))) {
    const relative = file.path.slice('hooks/'.length); const parts = relative.split('/');
    if (parts.some((part) => ['__pycache__', '__tests__', 'tests', 'fixtures', 'helpers'].includes(part)) || isProductionControllerArtifact(relative)) continue;
    const destination = relative === 'session-end.cjs' ? 'claude-session-end.cjs' : relative;
    const bytes = file.bytes.subarray(0, 1024).includes(0) ? file.bytes : textBytes(applyTargetReplacements(new TextDecoder().decode(file.bytes)));
    writeProjectionFile(context, `.gemini/hooks/${destination}`, bytes, file.mode);
  }
  const wrappers: Record<string, [string, 'context' | 'block' | 'passthrough', string]> = {
    'session-start.cjs': ['SessionStart', 'context', '.gemini/hooks/session-init.cjs'],
    'before-agent.cjs': ['BeforeAgent', 'context', '.gemini/hooks/dev-rules-reminder.cjs'],
    'before-tool-scout-block.cjs': ['BeforeTool', 'block', '.gemini/hooks/scout-block.cjs'],
    'before-tool-privacy-block.cjs': ['BeforeTool', 'block', '.gemini/hooks/privacy-block.cjs'],
    'session-end.cjs': ['SessionEnd', 'passthrough', '.gemini/hooks/claude-session-end.cjs'],
  };
  for (const [name, [event, kind, source]] of Object.entries(wrappers)) writeProjectionFile(context, `.gemini/hooks/${name}`, textBytes(bridge(kind, event, source)), 0o755);
}
export function projectScripts(context: ProjectionBuildContext): void {
  ensureProjectionDirectory(context, '.gemini/scripts');
  for (const file of context.resources.files.filter((entry) => entry.path.startsWith('scripts/'))) {
    const relative = file.path.slice('scripts/'.length);
    const parts = relative.split('/');
    if (parts.some((part) => ['__pycache__', '__tests__', 'tests', 'fixtures', 'helpers'].includes(part))
      || isProductionControllerArtifact(relative) || relative.includes('advise-state') || basename(relative).startsWith('fake-')
      || relative === 'commands_data.yaml' || relative === 'skills_data.yaml') continue;
    const bytes = file.bytes.subarray(0, 1024).includes(0) ? file.bytes : textBytes(applyTargetReplacements(new TextDecoder().decode(file.bytes)));
    writeProjectionFile(context, `.gemini/scripts/${relative}`, bytes, file.mode);
  }
}

export function projectConfig(context: ProjectionBuildContext): void {
  for (const name of ['.evcrate.json', '.evcrateignore']) {
    if (context.resources.files.some((file) => file.path === name)) writeProjectionFile(context, `.gemini/${name}`, graphFile(context, name).bytes, graphFile(context, name).mode);
  }
}

export function projectSettings(context: ProjectionBuildContext): void {
  let settings: unknown = transformJson(sourceJson(context));
  const source = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
  if (source.hooks && typeof source.hooks === 'object') {
    const hooks: Record<string, unknown[]> = {};
    for (const [event, groups] of Object.entries(source.hooks as Record<string, unknown>)) {
      const mapped = EVENTS[event]; if (!mapped || !Array.isArray(groups)) continue;
      hooks[mapped] ??= [];
      for (const group of groups as Record<string, unknown>[]) {
        const copy: Record<string, unknown> = { ...group, matcher: typeof group.matcher === 'string' ? group.matcher.replace(/\b(?:Glob|Grep|Read|Edit|Write|Bash)\b/gu, (name) => TOOL_MAPPING[name] ?? name) : group.matcher };
        if (Array.isArray(copy.hooks)) copy.hooks = (copy.hooks as Record<string, unknown>[]).map((hook) => ({ ...hook, name: hook.name ?? `migrated-${event.toLowerCase()}-${Buffer.from(String(hook.command ?? '')).toString('hex').slice(0, 8)}` }));
        hooks[mapped].push(copy);
      }
    }
    source.hooks = hooks;
  }
  const migration = { model: { name: 'gemini-3.1-flash-lite-preview' }, context: { fileName: CONTEXT_NAMES }, hooks: {
    SessionStart: [{ matcher: '*', hooks: [{ name: 'claude-session-start', type: 'command', command: '$GEMINI_PROJECT_DIR/.gemini/hooks/session-start.cjs' }] }],
    BeforeAgent: [{ matcher: '*', hooks: [{ name: 'claude-user-prompt-submit', type: 'command', command: '$GEMINI_PROJECT_DIR/.gemini/hooks/before-agent.cjs' }] }],
    BeforeTool: [{ matcher: HOOK_MATCHER, hooks: [{ name: 'claude-scout-block', type: 'command', command: '$GEMINI_PROJECT_DIR/.gemini/hooks/before-tool-scout-block.cjs' }, { name: 'claude-privacy-block', type: 'command', command: '$GEMINI_PROJECT_DIR/.gemini/hooks/before-tool-privacy-block.cjs' }] }],
    SessionEnd: [{ matcher: '*', hooks: [{ name: 'claude-session-end', type: 'command', command: '$GEMINI_PROJECT_DIR/.gemini/hooks/session-end.cjs' }] }],
  } };
  settings = merge(source, migration);
  if (settings && typeof settings === 'object') { const result = settings as Record<string, unknown>; for (const event of Object.keys(DROPPED)) if (result.hooks && typeof result.hooks === 'object') delete (result.hooks as Record<string, unknown>)[event]; for (const key of ['effortLevel', 'env', 'includeCoAuthoredBy', 'statusLine']) delete result[key]; }
  writeProjectionFile(context, '.gemini/settings.json', textBytes(JSON.stringify(settings, null, 2)), 0o644);
}

export function projectDocumentsAndMatrix(context: ProjectionBuildContext): void {
  if (context.manifest.projectDocs.includes('GEMINI.md') && sourceExists(context, 'CLAUDE.md')) writeProjectionFile(context, 'GEMINI.md', textBytes('# Gemini Project Context\n\nThe authoritative project memory file for this migrated workspace remains `CLAUDE.md`.\nGemini should load native context first and then import the source memory document below.\n\n@./CLAUDE.md\n\n'), 0o644);
  const behaviors: Record<string, unknown>[] = [{ kind: 'memory-file', source: 'CLAUDE.md', classification: 'memory-file', status: sourceExists(context, 'CLAUDE.md') ? 'migrated-wrapper' : 'not-present', target: sourceExists(context, 'CLAUDE.md') ? 'GEMINI.md -> @./CLAUDE.md' : null }];
  const commands = context.resources.files.filter((file) => file.path.startsWith('commands/') && file.path.endsWith('.md'));
  for (const file of commands) behaviors.push({ kind: 'command-prose', source: file.path.slice('commands/'.length), classification: 'command-prose', status: 'migrated', target: file.path.slice('commands/'.length, -3) + '.toml' });
  const skipSkills = new Set(['claude-code', 'skill-creator', 'template-skill']);
  for (const file of context.resources.files.filter((entry) => entry.path.startsWith('skills/') && entry.path.endsWith('/SKILL.md'))) {
    const rel = file.path.slice('skills/'.length);
    const top = rel.split('/')[0];
    if (skipSkills.has(top)) continue;
    const mappedPath = rel.replace(/claude/giu, 'gemini');
    const mappedName = rel.slice(0, -'/SKILL.md'.length).replace(/claude/giu, 'gemini');
    behaviors.push({ kind: 'skill-package', source: rel, classification: 'skill-package', status: 'migrated', target: mappedPath, target_name: mappedName });
  }
  behaviors.push({ kind: 'advisory-capability', classification: 'target-native', checkpoint: 'supported', inline: 'supported', relay: 'unsupported', relay_error: 'ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI' });
  const source = sourceJson(context); const hooks = source.hooks;
  if (hooks && typeof hooks === 'object') for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) if (Array.isArray(groups)) for (const group of groups as Record<string, unknown>[]) for (const hook of (Array.isArray(group.hooks) ? group.hooks : []) as Record<string, unknown>[]) behaviors.push({ kind: 'hook-driven', source_event: event, source_matcher: group.matcher ?? '*', source_command: hook.command ?? '', ...(EVENTS[event] ? { target_event: EVENTS[event], classification: 'hook-driven', status: 'migrated' } : { classification: 'unsupported', status: 'dropped', reason: DROPPED[event] ?? 'No Gemini CLI hook mapping was defined for this Claude event.' }) });
  const payload = { target: 'gemini', context_file_names: CONTEXT_NAMES, unsupported_events: DROPPED, behaviors };
  writeProjectionFile(context, '.gemini/migration-behavior-matrix.json', textBytes(JSON.stringify(sortObject(payload), null, 2) + '\n'));
}
