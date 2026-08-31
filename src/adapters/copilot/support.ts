import type { ProjectionBuildContext } from '../types.js';
import { copyFile, filesUnder, decode, invalid, optionalGraphFile, parseJson, writeJson } from './common.js';

function statusline(value: string, transform: (value: string) => string): string {
  let rendered = transform(value);
  const replacements: [string, string][] = [
    ['data.workspace?.current_dir', 'data.workspace?.current_dir || data.workspace?.currentDir || data.workspace?.path'],
    ['currentDir = data.workspace.current_dir;', 'currentDir = data.workspace.current_dir || data.workspace?.currentDir || data.workspace?.path;'],
    ['session_id: data.session_id,', 'session_id: data.session_id || data.sessionId,'],
    ['const transcriptPath = data.transcript_path;', 'const transcriptPath = data.transcript_path || data.transcriptPath;'],
    ["const modelName = data.model?.display_name || 'Copilot';", "const modelName = data.model?.display_name || data.model?.displayName || data.model?.name || 'Copilot';"],
    ["const modelVersion = data.model?.version && data.model.version !== 'null' ? data.model.version : '';", "const modelVersion = (data.model?.version || data.model?.versionName) && (data.model.version || data.model.versionName) !== 'null' ? (data.model.version || data.model.versionName) : '';"],
    ["costUSD = data.cost?.total_cost_usd || '';", "costUSD = data.cost?.total_cost_usd || data.cost?.totalCostUsd || '';"],
    ['linesAdded = data.cost?.total_lines_added || 0;', 'linesAdded = data.cost?.total_lines_added || data.cost?.totalLinesAdded || 0;'],
    ['linesRemoved = data.cost?.total_lines_removed || 0;', 'linesRemoved = data.cost?.total_lines_removed || data.cost?.totalLinesRemoved || 0;'],
  ];
  for (const [from, to] of replacements) rendered = rendered.replaceAll(from, to);
  if (rendered.includes('console.log(output);') && !rendered.includes('MAX_STATUSLINE_LENGTH')) rendered = rendered.replace('async function main() {', 'const MAX_STATUSLINE_LENGTH = 512;\n\nasync function main() {').replace('        console.log(output);', '        const boundedOutput = output.slice(0, MAX_STATUSLINE_LENGTH);\n        console.log(boundedOutput);');
  return rendered;
}
function validateMcp(value: Record<string, unknown>): Record<string, unknown> {
  const servers = value.mcpServers; if (!servers || typeof servers !== 'object' || Array.isArray(servers) || !Object.keys(servers).length) invalid();
  const output: Record<string, unknown> = {};
  for (const name of Object.keys(servers as object).sort()) {
    const raw = (servers as Record<string, unknown>)[name]; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(); const item = raw as Record<string, unknown>; const command = item.command; const args = item.args ?? []; const env = item.env ?? {};
    if (typeof command !== 'string' || !command || !Array.isArray(args) || !args.every((arg) => typeof arg === 'string') || !env || typeof env !== 'object' || Array.isArray(env) || !Object.values(env as object).every((entry) => typeof entry === 'string')) invalid();
    const rendered: Record<string, unknown> = { command, args }; if (Object.keys(env as object).length) rendered.env = Object.fromEntries(Object.entries(env as Record<string, unknown>).sort()); if (item.tools !== undefined) { if (!Array.isArray(item.tools) || !item.tools.every((tool) => typeof tool === 'string')) invalid(); rendered.tools = item.tools; } output[name] = rendered;
  }
  return { mcpServers: output };
}
export interface SupportAudit { config: string[]; archives: string[]; statusline: string[]; mcpExample: string }
export function convertSupport(context: ProjectionBuildContext, transform: (value: string) => string): SupportAudit {
  copyFile(context, '.evcrate.json', '.evcrate.json', transform); copyFile(context, '.evcrateignore', '.evcrateignore');
  const archives: string[] = []; const gitignore = optionalGraphFile(context, '.gitignore'); if (gitignore) { copyFile(context, '.gitignore', 'evcrate/source-gitignore', transform); archives.push('evcrate/source-gitignore'); }
  copyFile(context, 'settings.json', 'evcrate/claude-settings.json', transform); archives.push('evcrate/claude-settings.json');
  const statuslinePaths: string[] = []; for (const file of context.resources.files.filter((item) => /^statusline\./u.test(item.path))) { const name = file.path; copyFile(context, name, `evcrate/${name}`, (value) => statusline(value, transform)); statuslinePaths.push(`evcrate/${name}`); }
  const example = parseJson(context, '.mcp.json.example'); writeJson(context, 'mcp-config.example.json', validateMcp(example));
  return { config: ['.evcrate.json', '.evcrateignore'], archives, statusline: statuslinePaths.sort(), mcpExample: 'mcp-config.example.json' };
}
