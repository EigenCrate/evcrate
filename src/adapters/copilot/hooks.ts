import type { ProjectionBuildContext } from '../types.js';
import { BRIDGE_SOURCE } from './bridge.js';
import { copyFile, filesUnder, invalid, parseJson, writeJson } from './common.js';
import { isProductionControllerArtifact, textBytes, writeProjectionFile } from '../projection-utils.js';
import { renderHarness } from './text.js';

const EVENTS: Record<string, [string, string]> = { SessionStart: ['sessionStart', 'session-start'], SubagentStart: ['subagentStart', 'subagent-start'], PreToolUse: ['preToolUse', 'pre-tool-use'], PostToolUse: ['postToolUse', 'post-tool-use'], PreCompact: ['preCompact', 'pre-compact'], SessionEnd: ['sessionEnd', 'session-end'] };
const TOOL_MATCHERS: Record<string, string[]> = { bash: ['bash', 'powershell'], glob: ['glob'], grep: ['grep', 'rg'], read: ['view'], edit: ['edit', 'str_replace_editor', 'apply_patch'], write: ['create'] };
export interface HookAudit { hooks: string[]; scripts: string[]; events: string[]; registrations: { event: string; targetEvent: string; index: number }[] }
function translate(value: string, relative: string): string {
  let rendered = renderHarness(value);
  if (relative === 'lib/evcrate-config-utils.cjs') rendered = rendered.replaceAll("new Set(['.claude', '.codex', '.pi'])", "new Set(['.claude', '.codex', '.pi', '.copilot'])").replaceAll("return VALID_CONFIG_DIRS.has(value) ? value : '.claude';", "return VALID_CONFIG_DIRS.has(value) ? value : '.copilot';");
  if (relative === 'scout-block.cjs') rendered = rendered.replaceAll('const claudeDir = path.dirname(scriptDir);', 'const copilotDir = path.dirname(path.dirname(scriptDir));').replaceAll('claudeDir', 'copilotDir');
  if (relative === 'session-init.cjs') rendered = rendered.replaceAll('const envFile = process.env.COPILOT_ENV_FILE;', 'const envFile = undefined;');
  if (relative === 'session-end.cjs') rendered = rendered.replaceAll("if (reason === 'clear' && sessionId) {", 'if (sessionId) {');
  return rendered;
}
function bridgeCommand(operation: string): string {
  const code = "const path=require('node:path');const root=process.env.COPILOT_PROJECT_DIR||process.cwd();const bridge=path.resolve(root,'.copilot','evcrate','hooks','copilot-hook-bridge.cjs');process.exitCode=require(bridge)(process.argv[1]);";
  return `node -e ${JSON.stringify(code)} ${operation}`;
}
function matcher(event: string, value: unknown): string | undefined {
  if (['SessionStart', 'SessionEnd', 'SubagentStart'].includes(event)) return undefined;
  if (typeof value !== 'string' || !value || value === '*' || value === '**') return undefined;
  if (event === 'PreCompact') return value;
  const result: string[] = []; for (const token of value.split('|')) for (const mapped of TOOL_MATCHERS[token.toLowerCase()] ?? [token]) if (!result.includes(mapped)) result.push(mapped);
  return result.join('|');
}
function hookConfig(events: Record<string, unknown>): Record<string, unknown> {
  const hooks: Record<string, unknown> = {};
  for (const [event, raw] of Object.entries(events)) {
    if (event === 'UserPromptSubmit') continue;
    const mapping = EVENTS[event]; if (!mapping) invalid(); if (!Array.isArray(raw) || raw.length !== 1) invalid();
    const registration = raw[0]; if (!registration || typeof registration !== 'object' || Array.isArray(registration)) invalid();
    const item = registration as Record<string, unknown>; const rawHooks = item.hooks;
    const expected = event === 'PreToolUse' ? 2 : 1; if (!Array.isArray(rawHooks) || rawHooks.length !== expected) invalid();
    if (!rawHooks.every((entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as Record<string, unknown>).type === 'command' && typeof (entry as Record<string, unknown>).command === 'string')) invalid();
    if (event === 'PreToolUse') { const commands = rawHooks.map((entry) => String((entry as Record<string, unknown>).command)); if (!commands[0].includes('scout-block.cjs') || !commands[1].includes('privacy-block.cjs')) invalid(); }
    if (!['SessionStart', 'SessionEnd'].includes(event) && typeof item.matcher !== 'string') invalid();
    const output: Record<string, unknown> = { type: 'command', command: bridgeCommand(mapping[1]) }; const value = matcher(event, item.matcher); if (value !== undefined) output.matcher = value; hooks[mapping[0]] = [output];
  }
  return { version: 1, hooks };
}
export function convertHooks(context: ProjectionBuildContext, transform: (value: string) => string): HookAudit {
  const copiedHooks: string[] = []; for (const file of filesUnder(context, 'hooks')) { const relative = file.path.slice('hooks/'.length); if (isProductionControllerArtifact(relative)) continue; copyFile(context, file.path, `evcrate/hooks/${relative}`, (value) => transform(translate(value, relative))); copiedHooks.push(relative); }
  const copiedScripts: string[] = []; for (const file of filesUnder(context, 'scripts')) { const relative = file.path.slice('scripts/'.length); if (relative.includes('advise-state') || isProductionControllerArtifact(relative) || relative === 'commands_data.yaml' || relative === 'skills_data.yaml') continue; copyFile(context, file.path, `evcrate/scripts/${relative}`, (value) => transform(renderHarness(value))); copiedScripts.push(relative); }
  copiedScripts.push('commands_data.yaml', 'skills_data.yaml', 'scanner-layout.json');
  const bridge = textBytes(BRIDGE_SOURCE); writeProjectionFile(context, '.copilot/evcrate/hooks/copilot-hook-bridge.cjs', bridge, true);
  copyFile(context, '.evcrateignore', 'evcrate/.evcrateignore'); copyFile(context, '.evcrateignore', '.evcrateignore');
  const settings = parseJson(context, 'settings.json'); const events = settings.hooks; if (!events || typeof events !== 'object' || Array.isArray(events)) invalid();
  const shared = context.manifest.sharedJson;
  if (!shared || shared.schema !== 'managed-json-v1' || shared.destination !== 'settings.json' || shared.fragment !== 'evcrate/managed-settings.json' || shared.managedKeys.length !== 3 || new Set(shared.managedKeys).size !== 3 || !['includeCoAuthoredBy', 'effortLevel', 'statusLine'].every((key) => shared.managedKeys.includes(key))) invalid();
  const statusline = "const path=require('node:path');const root=process.env.COPILOT_PROJECT_DIR||process.cwd();const statusline=path.resolve(root,'.copilot','evcrate','statusline.cjs');require(statusline);";
  writeJson(context, 'hooks/evcrate.json', hookConfig(events as Record<string, unknown>)); writeJson(context, 'evcrate/managed-settings.json', { includeCoAuthoredBy: false, effortLevel: 'high', statusLine: { type: 'command', command: `node -e ${JSON.stringify(statusline)}` } });
  const registrations: HookAudit['registrations'] = []; for (const event of Object.keys(events as object).sort()) { const entries = (events as Record<string, unknown>)[event]; if (!Array.isArray(entries)) invalid(); const targetEvent = EVENTS[event]?.[0] ?? event; entries.forEach((_entry, index) => registrations.push({ event, targetEvent, index })); }
  copyFile(context, 'settings.json', 'evcrate/claude-settings.json', transform);
  return { hooks: copiedHooks.sort(), scripts: copiedScripts.sort(), events: Object.keys(events as object).sort(), registrations };
}
