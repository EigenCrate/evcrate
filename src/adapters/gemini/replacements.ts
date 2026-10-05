import { restoreIndexedTokens } from '../uri-restoration.js';
const URI = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;
const URL = /https?:\/\/[^\s<>()]+/giu;
const RESOURCE_SUFFIXES = ['output-styles', 'workflows', 'scripts', 'hooks', 'skills', '.evcrate.json', '.mcp.json', '.env'];

const REPLACEMENTS: readonly [RegExp, string][] = [
  [/claude-4-6-opus(?:-[a-z0-9]+)?/giu, 'gemini-3.1-pro-preview'],
  [/claude-4-6-sonnet(?:-[a-z0-9]+)?/giu, 'gemini-3-flash-preview'],
  [/claude-4-5-opus(?:-[a-z0-9]+)?/giu, 'gemini-3.1-pro-preview'],
  [/claude-4-5-haiku(?:-[a-z0-9]+)?/giu, 'gemini-3.1-flash-lite-preview'],
  [/claude-3-7-sonnet(?:-[a-z0-9]+)?/giu, 'gemini-3-flash-preview'],
  [/claude-3-5-sonnet(?:-[a-z0-9]+)?/giu, 'gemini-3-flash-preview'],
  [/claude-3-5-haiku(?:-[a-z0-9]+)?/giu, 'gemini-3.1-flash-lite-preview'],
  [/claude-3-opus(?:-[a-z0-9]+)?/giu, 'gemini-3.1-pro-preview'],
  [/claude[\s-]*4[.-]*6[\s-]*opus/giu, 'gemini 3.1 pro'],
  [/claude[\s-]*opus[\s-]*4[.-]*6/giu, 'gemini 3.1 pro'],
  [/claude[\s-]*4[.-]*6[\s-]*sonnet/giu, 'gemini 3 flash'],
  [/claude[\s-]*sonnet[\s-]*4[.-]*6/giu, 'gemini 3 flash'],
  [/claude[\s-]*4[.-]*5[\s-]*opus/giu, 'gemini 3.1 pro'],
  [/claude[\s-]*opus[\s-]*4[.-]*5/giu, 'gemini 3.1 pro'],
  [/claude[\s-]*4[.-]*5[\s-]*haiku/giu, 'gemini 3.1 flash-lite'],
  [/claude[\s-]*haiku[\s-]*4[.-]*5/giu, 'gemini 3.1 flash-lite'],
  [/claude[\s-]*3[.-]*7[\s-]*sonnet/giu, 'gemini 3 flash'],
  [/claude[\s-]*sonnet[\s-]*3[.-]*7/giu, 'gemini 3 flash'],
  [/claude[\s-]*3[.-]*5[\s-]*sonnet/giu, 'gemini 3 flash'],
  [/claude[\s-]*sonnet[\s-]*3[.-]*5/giu, 'gemini 3 flash'],
  [/claude[\s-]*3[.-]*5[\s-]*haiku/giu, 'gemini 3.1 flash-lite'],
  [/claude[\s-]*haiku[\s-]*3[.-]*5/giu, 'gemini 3.1 flash-lite'],
  [/claude[\s-]*3[\s-]*opus/giu, 'gemini 3.1 pro'],
  [/claude[\s-]*opus[\s-]*3/giu, 'gemini 3.1 pro'],
  [/opus[\s-]*4[.-]*6/giu, 'pro'], [/sonnet[\s-]*4[.-]*6/giu, 'flash'],
  [/opus[\s-]*4[.-]*5/giu, 'pro'], [/haiku[\s-]*4[.-]*5/giu, 'flash-lite'],
  [/sonnet[\s-]*3[.-]*7/giu, 'flash'], [/sonnet[\s-]*3[.-]*5/giu, 'flash'],
  [/haiku[\s-]*3[.-]*5/giu, 'flash-lite'], [/opus[\s-]*3/giu, 'pro'],
  [/4[.-]*6[\s-]*opus/giu, 'pro'], [/4[.-]*6[\s-]*sonnet/giu, 'flash'],
  [/4[.-]*5[\s-]*opus/giu, 'pro'], [/4[.-]*5[\s-]*haiku/giu, 'flash-lite'],
  [/ANTHROPIC_API_KEY/gi, 'GEMINI_API_KEY'], [/anthropic/giu, 'google'],
  [/CLAUDE_PROJECT_DIR/g, 'GEMINI_PROJECT_DIR'], [/CLAUDE_COMMAND/g, 'GEMINI_COMMAND'],
  [/sonnet/giu, 'flash'], [/haiku/giu, 'flash-lite'], [/opus/giu, 'pro'],
  [/\bCLAUDE\.md\b/giu, 'CLAUDE.md'],
  [/(?<![A-Za-z0-9_.-])claude(?![A-Za-z0-9_-]|\.(?:com|ai)\b)/giu, 'gemini'],
  [/CLAUDE_PROJECT_DIR/g, 'GEMINI_PROJECT_DIR'], [/CLAUDE_COMMAND/g, 'GEMINI_COMMAND'],
  [/SlashCommand/g, 'Custom Command'], [/Skill tool/g, 'activate_skill tool'],
  [/AskUserQuestion/g, 'ask_user'], [/\$ARGUMENTS/g, '{{args}}'],
  [/"\$CLAUDE_PROJECT_DIR"/g, '"$GEMINI_PROJECT_DIR"'],
  [/\.claude\/workflows\//g, '.gemini/workflows/'],
  [/python \.claude\/scripts\/ev-help\.py\b/g, 'python .gemini/scripts/ev-help.py'],
  [/gemini-sonnet/giu, 'gemini-3-flash-preview'], [/gemini-haiku/giu, 'gemini-3.1-flash-lite-preview'],
  [/gemini-opus/giu, 'gemini-3.1-pro-preview'],
];

function resourcePath(scope: 'local' | 'global', suffix: string): string {
  if (scope === 'global') return `.gemini/${suffix}`;
  return `.gemini/${suffix}`;
}

/** Rewrite ordinary Claude resource references while leaving URI literals byte-identical. */
export function renderHarnessScriptReferences(input: string): string {
  const protectedUrls: string[] = [];
  let rendered = input.replace(URI, (value) => {
    protectedUrls.push(value);
    return `__EVCRATE_HARNESS_URL_${protectedUrls.length - 1}__`;
  });
  for (const prefix of ['~', '$HOME', '${HOME}']) {
    for (const suffix of [...RESOURCE_SUFFIXES].sort((a, b) => b.length - a.length)) {
      rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, `${prefix}/${resourcePath('global', suffix)}`);
    }
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.gemini`);
  }
  for (const suffix of [...RESOURCE_SUFFIXES].sort((a, b) => b.length - a.length)) {
    rendered = rendered.replaceAll(`.claude/${suffix}`, resourcePath('local', suffix));
  }
  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\]|['"`\)\]\}]|\s|$))/gu, '.gemini');
  rendered = rendered.replace(/^(\s*)claude_dir\s*=\s*skills_dir\.parent(\s*#.*)?$/gmu,
    '$1harness_dir = skills_dir.parent.parent / ".gemini"$2');
  rendered = rendered.replaceAll('claude_dir', 'harness_dir');
  rendered = rendered.replace(/^(\s*)const\s+claudeDir\s*=\s*path\.resolve\(skillsDir,\s*['"]\.\.['"]\);(.*)$/gmu,
    "$1const harnessDir = path.resolve(skillsDir, '..', '..', '.gemini');$2");
  rendered = rendered.replaceAll('claudeDir', 'harnessDir');
  return restoreIndexedTokens(rendered, '__EVCRATE_HARNESS_URL_', protectedUrls);
}

export function applyTargetReplacements(input: string): string {
  if (typeof input !== 'string') return input;
  const protectedUrls: string[] = [];
  let text = renderHarnessScriptReferences(input).replace(URL, (value) => {
    protectedUrls.push(value);
    return `__GEMINI_PROTECTED_${protectedUrls.length - 1}__`;
  });
  text = text.replace(/\bCLAUDE\.md\b/giu, '__SOURCE_MEMORY_DOC__');
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  text = text.replaceAll('__SOURCE_MEMORY_DOC__', 'CLAUDE.md');
  return restoreIndexedTokens(text, '__GEMINI_PROTECTED_', protectedUrls);
}

export const TOOL_MAPPING: Readonly<Record<string, string>> = {
  Glob: 'glob', Grep: 'grep_search', Read: 'read_file', Write: 'write_file', Edit: 'replace',
  Bash: 'run_shell_command', AskUserQuestion: 'ask_user', WebSearch: 'google_web_search', LS: 'list_directory',
  WebFetch: 'web_fetch', MultiEdit: 'replace', NotebookEdit: 'replace', TodoWrite: 'write_file',
  BashOutput: 'run_shell_command', KillBash: 'run_shell_command', KillShell: 'run_shell_command',
  ListMcpResourcesTool: 'run_shell_command', ReadMcpResourceTool: 'run_shell_command',
};
export const VALID_GEMINI_TOOLS = new Set([
  'update_topic', 'list_directory', 'read_file', 'grep_search', 'glob', 'replace', 'write_file', 'web_fetch',
  'run_shell_command', 'list_background_processes', 'read_background_output', 'google_web_search', 'ask_user',
  'enter_plan_mode', 'invoke_agent', 'activate_skill',
]);

export const EXTERNAL_SCOUT_STRATEGY_START = '<!-- EXTERNAL_SCOUT_STRATEGY_START -->';
export const EXTERNAL_SCOUT_STRATEGY_END = '<!-- EXTERNAL_SCOUT_STRATEGY_END -->';
export const GEMINI_EXTERNAL_SCOUT_STRATEGY = `## External command strategy

Use the read-only primary command for each focused directory search. Prompts must request concise paths and supporting evidence, and must not ask for modifications or credentials. If the primary command is unavailable or fails, use the fallback command once; otherwise do not mix commands based on search count.

\`\`\`bash
codex exec -m gpt-5.6-luna "[prompt]"
\`\`\`

\`\`\`bash
claude -p --model sonnet "[prompt]"
\`\`\`

Run focused searches in parallel when useful, with a three-minute timeout per command. Do not restart a timed-out command. Fall back to native Glob, Grep, and Read tools when both commands are unavailable, unsafe, or fail.`;

export function renderExternalScoutStrategy(body: string): string {
  if (body.split(EXTERNAL_SCOUT_STRATEGY_START).length - 1 !== 1
    || body.split(EXTERNAL_SCOUT_STRATEGY_END).length - 1 !== 1) throw new Error('Malformed external scout strategy markers');
  const start = body.indexOf(EXTERNAL_SCOUT_STRATEGY_START);
  const end = body.indexOf(EXTERNAL_SCOUT_STRATEGY_END);
  if (end < start) throw new Error('Malformed external scout strategy markers');
  return body.slice(0, start) + EXTERNAL_SCOUT_STRATEGY_START + '\n' + GEMINI_EXTERNAL_SCOUT_STRATEGY
    + '\n' + body.slice(end + EXTERNAL_SCOUT_STRATEGY_END.length);
}
