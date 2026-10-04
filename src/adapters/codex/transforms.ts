import { restoreIndexedTokens } from '../uri-restoration.js';
import type { ResourceGraphFile } from '../resource-graph.js';

const URL_REFERENCE = /https?:\/\/[^\s<>()]+/giu;
const COMMAND_TOKEN = /\/[A-Za-z0-9_-]+(?:[:/][A-Za-z0-9_-]+)*/gu;
const REPLACEMENTS: readonly [RegExp, string][] = [
  [/\.claude\/skills/giu, '.agents/skills'],
  [/\.claude/giu, '.codex'],
  [/\bCLAUDE\.md\b/giu, 'AGENTS.md'],
  [/\bClaude Code\b/giu, 'Codex CLI'],
  [/\bclaude-code\b/giu, 'codex-cli'],
  [/\bClaude\b/gu, 'Codex'],
  [/\bclaude\b/gu, 'codex'],
  [/\bAnthropic\b/giu, 'OpenAI'],
  [/\banthropic\b/giu, 'openai'],
  [/\bCLAUDE_PROJECT_DIR\b/giu, 'CODEX_PROJECT_DIR'],
  [/\bCLAUDE_COMMAND\b/giu, 'CODEX_COMMAND'],
  [/\bANTHROPIC_API_KEY\b/giu, 'OPENAI_API_KEY'],
  [/\$ARGUMENTS/gu, '{{args}}'],
  [/\bTask tool\b/gu, 'subagent workflow'],
  [/\bTask\(subagent_type=/gu, 'Ask Codex to spawn a subagent with type='],
  [/\bAskUserQuestion tool\b/gu, 'request_user_input tool'],
  [/\bAskUserQuestion\b/gu, 'request_user_input'],
  [/\bSlashCommands\b/gu, 'Codex slash commands'],
  [/\bSlashCommand\b/gu, 'Codex slash command'],
  [/\bCustom Commands\b/gu, 'Codex slash commands'],
  [/\bTodoWrite\b/gu, 'update_plan'],
];

export const MODEL_MAP: Readonly<Record<string, readonly [string, string]>> = {
  opus: ['gpt-5.6-sol', 'high'], sonnet: ['gpt-5.6-luna', 'xhigh'],
  haiku: ['gpt-5.6-luna', 'low'], inherit: ['gpt-5.6-luna', 'high'], '': ['gpt-5.6-sol', 'high'],
};

export const SUBAGENT_WAIT_CONTRACT = `## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
`;

export interface Frontmatter { readonly metadata: Record<string, string | string[]>; readonly body: string; }

export function parseFrontmatter(content: string): Frontmatter {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/u.exec(content);
  if (!match) return { metadata: {}, body: content };
  const metadata: Record<string, string | string[]> = {};
  const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim(); const raw = line.slice(colon + 1).trim();
    if (['|', '|-', '|+', '>', '>-', '>+'].includes(raw)) {
      const block: string[] = []; index += 1;
      while (index < lines.length && (!lines[index].trim() || /^[ \t]/u.test(lines[index]))) {
        block.push(lines[index].trim()); index += 1;
      }
      index -= 1; metadata[key] = block.join(raw.startsWith('|') ? '\n' : ' ').trim(); continue;
    }
    if (raw.startsWith('[') && raw.endsWith(']')) {
      metadata[key] = raw.slice(1, -1).split(',').map((item) => item.trim().replace(/^["']|["']$/gu, '')).filter(Boolean);
    } else metadata[key] = raw.replace(/^["']|["']$/gu, '');
  }
  return { metadata, body: match[2] };
}

export function markdownFrontmatter(metadata: Record<string, string | string[]>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === '' || value.length === 0) continue;
    lines.push(Array.isArray(value) ? `${key}: [${value.map((item) => JSON.stringify(item)).join(', ')}]` : `${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---'); return lines.join('\n');
}

function firstParagraph(text: string): string {
  for (const block of text.trim().split(/\n\s*\n/gu)) {
    const clean = block.replace(/\s+/gu, ' ').trim(); if (clean && !clean.startsWith('#')) return clean;
  }
  return '';
}
export function normalizeDescription(raw: string | string[] | undefined, body: string, fallback: string): string {
  let value = Array.isArray(raw) ? raw.join(', ') : (raw ?? '').trim();
  if (!value || value.toLowerCase().startsWith('migrated command from')) value = firstParagraph(body) || fallback;
  value = value.replace(/\s+/gu, ' ').trim(); return value.length > 1024 ? `${value.slice(0, 1021).trimEnd()}...` : value;
}

export function applyReplacements(value: string): string {
  const urls: string[] = []; let result = value.replace(URL_REFERENCE, (url) => { urls.push(url); return `__EVCRATE_GLOBAL_URL_${urls.length - 1}__`; });
  for (const [pattern, replacement] of REPLACEMENTS) result = result.replace(pattern, replacement);
  result = result.replace(/\.Codex/gu, '.codex');
  return restoreIndexedTokens(result, '__EVCRATE_GLOBAL_URL_', urls);
}

export function canonicalCommandPath(path: string): string { return path.startsWith('/') ? `/${path.slice(1).replaceAll('/', ':')}` : path; }
export function canonicalizeCommands(text: string, known: ReadonlySet<string>): string {
  return text.replace(COMMAND_TOKEN, (token) => { const canonical = canonicalCommandPath(token); return known.has(canonical) ? canonical : token; });
}
export function rewriteCommandGuidance(text: string, known: ReadonlySet<string>): string {
  let result = canonicalizeCommands(text, known);
  const substitutions: readonly [RegExp, string][] = [
    [/^(\s*(?:[-*]|\d+\.)\s*)Trigger slash command (`\/[^`]+`)(.*)$/gimu, '$1Use the matching `cmd_*` skill to run $2$3'],
    [/^(\s*(?:[-*]|\d+\.)\s*)Trigger (`\/[^`]+`)(.*)$/gimu, '$1Use the matching `cmd_*` skill to run $2$3'],
    [/(^|:\s*)Trigger slash command (`\/[^`]+`)(.*)$/gimu, '$1Use the matching `cmd_*` skill to run $2$3'],
    [/(^|:\s*)Trigger (`\/[^`]+`)(.*)$/gimu, '$1Use the matching `cmd_*` skill to run $2$3'],
    [/^(\s*(?:[-*]|\d+\.)\s*)Execute Codex slash command:\s*(.*)$/gimu, '$1Use the matching `cmd_*` skill to run $2'],
    [/(^|:\s*)Execute (`\/[^`]+`)(?: Codex slash command)?/gimu, '$1use the matching `cmd_*` skill to run $2'],
    [/(?<!\w)trigger (`\/[^`]+`) slash command\b/gimu, 'use the matching `cmd_*` skill to run $1'],
    [/Use (`\/[^`]+`) Codex slash command to/gimu, 'Use the matching `cmd_*` skill to run $1 to'],
    [/Use (`\/[^`]+`) Slash Command to/gimu, 'Use the matching `cmd_*` skill to run $1 to'],
    [/(→\s*)(`\/[^`]+`)/gu, '$1Use the matching `cmd_*` skill to run $2'],
  ];
  for (const [pattern, replacement] of substitutions) result = result.replace(pattern, replacement); return result;
}

export function addWorkflowFallback(text: string): string {
  let result = text;
  for (const name of ['advisor-mentoring.md', 'advisory-interview.md']) {
    const local = `.codex/workflows/${name}`; const home = `~/.codex/workflows/${name}`;
    const marker = `\`${local}\``; if (!result.includes(`${marker} if present`)) result = result.replace(marker, `${marker} if present; otherwise read \`${home}\` (the published install)`);
  }
  return result;
}

export function renderHarnessScriptReferences(text: string): string {
  const urls: string[] = []; let result = text.replace(URL_REFERENCE, (url) => { urls.push(url); return `__EVCRATE_HARNESS_URL_${urls.length - 1}__`; });
  const suffixes = ['output-styles', 'workflows', 'scripts', 'hooks', 'skills', '.evcrate.json', '.mcp.json', '.env'];
  for (const prefix of ['~', '$HOME', '${HOME}']) for (const suffix of suffixes) {
    const target = suffix === 'skills' ? '.agents/skills' : `.codex/${suffix}`;
    result = result.replaceAll(`${prefix}/.claude/${suffix}`, `${prefix}/${target}`);
  }
  for (const suffix of suffixes) result = result.replaceAll(`.claude/${suffix}`, suffix === 'skills' ? '.agents/skills' : `.codex/${suffix}`);
  result = result.replace(/(?<![A-Za-z0-9_])\.claude(?=[/\\'"`()\]\}]|\s|$)/gu, '.codex');
  result = result.replace(/^(\s*)claude_dir\s*=\s*skills_dir\.parent(\s*#.*)?$/gmu, '$1harness_dir = skills_dir.parent.parent / ".codex"$2').replaceAll('claude_dir', 'harness_dir');
  result = result.replace(/^\s*const\s+claudeDir\s*=\s*path\.resolve\(skillsDir,\s*['"]\.\.['"]\);.*$/gmu, "const harnessDir = path.resolve(skillsDir, '..', '..', '.codex');").replaceAll('claudeDir', 'harnessDir');
  return restoreIndexedTokens(result, '__EVCRATE_HARNESS_URL_', urls);
}

export function tomlValue(key: string, value: string | boolean): string {
  const safeKey = key.startsWith('#') || /^[A-Za-z0-9_-]+$/u.test(key) ? key : JSON.stringify(key);
  return `${safeKey} = ${typeof value === 'boolean' ? String(value) : JSON.stringify(value)}`;
}

export function transformResourceText(text: string, known: ReadonlySet<string>): string {
  return addWorkflowFallback(rewriteCommandGuidance(applyReplacements(text), known));
}

export function renderAdvisoryCapabilities(text: string, target = 'codex'): string {
  const start = '<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->'; const end = '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';
  if ((text.match(new RegExp(start, 'g')) ?? []).length !== 1 || (text.match(new RegExp(end, 'g')) ?? []).length !== 1) throw new Error('Malformed advisory capability markers');
  const begin = text.indexOf(start); const finish = text.indexOf(end, begin); const canonical = text.slice(begin + start.length, finish).trim();
  if (canonical !== '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->') throw new Error('Malformed advisory capability markers');
  const relay = `ADVISE_AGENT_RELAY_UNSUPPORTED_${target.toUpperCase()}`;
  const block = `${start}\n<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/${target}/v1 -->\n<!-- EVCRATE_CAPABILITY_ERROR: ${relay} -->\n${end}`;
  return `${text.slice(0, begin)}${block}${text.slice(finish + end.length)}`;
}

export function renderInlineAdvise(body: string): string {
  const relay = 'ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX';
  const capability = renderAdvisoryCapabilities(body);
  const start = capability.indexOf('<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->');
  const marker = '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';
  const end = capability.indexOf(marker) + marker.length;
  return `<!-- generated target: codex -->
${capability.slice(start, end)}

Use this command for candid technical or architectural advice. \`/advise\` is
separate from \`--advice\` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone \`--agent\` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; remove only that token, its separator, and trailing whitespace
from the prompt. If a final token requests relay, return \`${relay}\` and say:
\`Run /advise <prompt> without --agent for inline advice.\` Do not invoke an advisor,
create relay state, or silently continue in inline mode.

## Inline interview

Run in the main session. Do not invoke a subagent or create persistent state.

1. Analyze only bounded local context relevant to the prompt or URL.
2. Ask exactly one concise substantive question per turn using \`request_user_input\`.
   Never batch questions or infer an answer. Stop after eight discovery questions.
3. Present one concise reframed problem and require explicit \`confirm\` or \`correct\`.
   Permit at most two confirmation/correction cycles. On exhaustion, return
   \`INTERVIEW_NOT_CONVERGED\` and write no report.
4. After confirmation, write a concise Markdown report with exactly these headings:
   \`## Reframed problem\`, \`## Recommendation\`, \`## Alternatives/tradeoffs\`,
   \`## Risks\`, \`## Assumptions/evidence gaps\`, \`## Success checks\`,
   \`## Next actions\`, and \`## Unresolved questions\`.
5. Write the sanitized report to the active \`<plan>/reports\` directory, or
   \`plans/reports\` when there is no active plan. Never include credentials,
   environment values, tool traces, fetched page bodies, or model reasoning.
`;
}

export function renderAdvisoryInterview(body: string): string {
  let projected = renderAdvisoryCapabilities(body);
  projected = projected.replace('The second marker is a Claude-only capability claim. Generated targets must\nreplace it with their tested capability or an explicit unsupported result;\npresence of a generated file is never runtime proof.', "The second marker records this target's explicit `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` relay rejection.\nGenerated-file presence is never runtime proof.");
  projected = projected.replaceAll('`design a cache --agent` | Claude relay | `design a cache`', '`design a cache --agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview');
  projected = projected.replaceAll('`design a cache --agent ` | Claude relay | `design a cache`', '`design a cache --agent ` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview');
  projected = projected.replaceAll('`--agent` | Claude relay, empty prompt | empty; normal empty-input handling', '`--agent` | `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` | no inline interview');
  const relay = projected.indexOf('## Relay turn envelope');
  if (relay < 0) throw new Error('Canonical advisory interview workflow is missing relay contract');
  return `${projected.slice(0, relay)}## Unsupported relay\n\nA final standalone \`--agent\` returns \`ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX\` before advisor delegation, state creation, or inline-interview work. Users can run \`/advise <prompt>\` for inline advice.\n`;
}
export function isBinary(file: ResourceGraphFile): boolean { return file.bytes.slice(0, 1024).includes(0) || /\.(?:coverage|dll|dylib|exe|gif|gz|jpeg|jpg|pdf|png|pyc|pyo|so|tar|zip)$/iu.test(file.path); }
