import { ControlPlaneError } from '../errors/control-plane-error.js';

const START = '<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->';
const END = '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';
const CANONICAL = '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->';

function invalid(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}

function relayError(target: string): string {
  return `ADVISE_AGENT_RELAY_UNSUPPORTED_${target.toUpperCase()}`;
}

export function renderAdvisoryCapabilities(text: string, target: string): string {
  const starts = text.split(START).length - 1;
  const ends = text.split(END).length - 1;
  const begin = text.indexOf(START);
  const finish = text.indexOf(END, begin);
  if (starts !== 1 || ends !== 1 || begin < 0 || finish < begin
    || text.slice(begin + START.length, finish).trim() !== CANONICAL) invalid();
  const error = relayError(target);
  const block = [
    START,
    '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->',
    `<!-- EVCRATE_CAPABILITY: advise-agent-relay/unsupported/${target}/v1 -->`,
    `<!-- EVCRATE_CAPABILITY_ERROR: ${error} -->`,
    END,
  ].join('\n');
  return `${text.slice(0, begin)}${block}${text.slice(finish + END.length)}`
    .replaceAll('advise-agent-relay/claude/v1', `advise-agent-relay/unsupported/${target}/v1`);
}

export function renderInlineAdviseCommand(canonical: string, target: string, questionTool: string): string {
  const match = canonical.match(/^---\s*\n[\s\S]*?\n---\s*\n/u);
  const frontmatter = match ? match[0] : '';
  const error = relayError(target);
  const projected = renderAdvisoryCapabilities(canonical, target);
  const begin = projected.indexOf(START);
  const finish = projected.indexOf(END, begin) + END.length;
  const capabilityBlock = projected.slice(begin, finish);
  return `${frontmatter}<!-- generated target: ${target} -->
${capabilityBlock}

Use this command for candid technical or architectural advice. \`/evc-cmd-advise\` is
separate from \`--advice\` checkpoint mentorship: it first converges on the
problem, then provides advice.

## Parse input

Count exact, case-sensitive, whitespace-delimited standalone \`--agent\` tokens.
Reject two or more tokens. One token requests relay only when it is final after
trailing whitespace; quoted, embedded, suffixed, non-final, and differently
cased text remains ordinary input. If a final token requests relay, return
\`${error}\` and say: \`Run /evc-cmd-advise <prompt> without --agent for inline
advice.\` Do not invoke an advisor, create relay state, or silently continue in
inline mode.

## Inline interview

Run in the main session. Do not invoke a subagent or create persistent state.

1. Analyze only bounded local context relevant to the prompt or URL.
2. Ask exactly one concise substantive question per turn using \`${questionTool}\`.
   Never batch questions or infer an answer. Stop after eight discovery questions.
3. Present one concise reframed problem and require explicit \`confirm\` or
   \`correct\`. Permit at most two confirmation/correction cycles. On exhaustion,
   return \`INTERVIEW_NOT_CONVERGED\` and write no report.
4. After confirmation, write a concise Markdown report with exactly these headings:
   \`## Reframed problem\`, \`## Recommendation\`,
   \`## Alternatives/tradeoffs\`, \`## Risks\`, \`## Assumptions/evidence gaps\`,
   \`## Success checks\`, \`## Next actions\`, and \`## Unresolved questions\`.
5. Write the sanitized report to the active \`<plan>/reports\` directory, or
   \`plans/reports\` when there is no active plan. Never include credentials,
   environment values, tool traces, fetched page bodies, or model reasoning.
`;
}

export function renderAdvisoryInterviewWorkflow(text: string, target: string): string {
  const error = relayError(target);
  let projected = renderAdvisoryCapabilities(text, target);
  projected = projected.replace(
    'The second marker is a Claude-only capability claim. Generated targets must\nreplace it with their tested capability or an explicit unsupported result;\npresence of a generated file is never runtime proof.',
    `The second marker records this target's explicit \`${error}\` relay rejection.\nGenerated-file presence is never runtime proof.`,
  );
  for (const [source, replacement] of [
    ['| `design a cache --agent` | Claude relay | `design a cache` |', `| ` + '`design a cache --agent`' + ` | \`${error}\` | no inline interview |`],
    ['| `design a cache --agent ` | Claude relay | `design a cache` |', `| ` + '`design a cache --agent `' + ` | \`${error}\` | no inline interview |`],
    ['| `--agent` | Claude relay, empty prompt | empty; normal empty-input handling |', `| ` + '`--agent`' + ` | \`${error}\` | no inline interview |`],
  ] as const) projected = projected.replaceAll(source, replacement);
  projected = projected.replace(
    'Inline mode keeps the active conversation in the main session. Relay mode\npersists only the bounded, sanitized invocation state through\n`scripts/advise-state.cjs`. Both modes ask exactly one question per turn.\n\nThe helper exposes the executable `parse`, `validate-envelope`, `write-report`,\nand `validate-report` operations in addition to state lifecycle operations.\nCommands must call those operations; prose is not a substitute for validation.\n\n',
    'Inline mode keeps the active conversation in the main session and asks exactly\none question per turn. No relay state is created on this target.\n\n',
  );
  const relay = projected.indexOf('## Relay turn envelope');
  if (relay < 0) invalid();
  return `${projected.slice(0, relay)}## Unsupported relay\n\nA final standalone \`--agent\` returns \`${error}\` before advisor delegation, state creation, or inline-interview work. Users can run \`/advise <prompt>\` for inline advice.\n`;
}

export const MENTORING_START = '<!-- EVCRATE_MENTORING_CAPABILITIES_START -->';
export const MENTORING_END = '<!-- EVCRATE_MENTORING_CAPABILITIES_END -->';
export const CANONICAL_MENTORING = '<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->\n<!-- EVCRATE_CAPABILITY: write-checks/claude/advisory-only/v1 -->';

export interface TargetMentoringCapability {
  readonly mentoring: 'supported' | 'unavailable';
  readonly writeChecks: 'mediated' | 'advisory-only' | 'unavailable';
}

export const TARGET_MENTORING_CAPABILITIES: Readonly<Record<string, TargetMentoringCapability>> = Object.freeze({
  claude: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  codex: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  omp: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  antigravity: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  gemini: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  copilot: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
  pi: Object.freeze({ mentoring: 'supported', writeChecks: 'advisory-only' }),
});

export function renderMentoringCapabilities(text: string, target: string): string {
  const cap = TARGET_MENTORING_CAPABILITIES[target];
  if (!cap) invalid();
  const starts = text.split(MENTORING_START).length - 1;
  const ends = text.split(MENTORING_END).length - 1;
  const begin = text.indexOf(MENTORING_START);
  const finish = text.indexOf(MENTORING_END, begin);
  if (starts !== 1 || ends !== 1 || begin < 0 || finish < begin
    || text.slice(begin + MENTORING_START.length, finish).trim() !== CANONICAL_MENTORING) invalid();
  const block = [
    MENTORING_START,
    `<!-- EVCRATE_CAPABILITY: mentoring/${cap.mentoring}/v2 -->`,
    `<!-- EVCRATE_CAPABILITY: write-checks/${target}/${cap.writeChecks}/v1 -->`,
    MENTORING_END,
  ].join('\n');
  return `${text.slice(0, begin)}${block}${text.slice(finish + MENTORING_END.length)}`;
}

export function renderMentoringWorkflow(text: string, target: string): string {
  return renderMentoringCapabilities(text, target);
}
