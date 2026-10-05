import { restoreIndexedTokens } from '../uri-restoration.js';
import { normalizeLf } from './frontmatter.js';

const URL = /https?:\/\/[^\s<>"']+/giu;
const PATH_TRANSLATIONS: readonly [RegExp, string][] = [
  [/(?<![~A-Za-z0-9_./-])(?:\.\/)?\.claude\/workflows\/([^\s)`\]"']+)/gu, '{{evcrate:workflows/$1}}'],
  [/(?<![~A-Za-z0-9_./-])(?:\.\/)?\.claude\/scripts\/([^\s)`\]"']+)/gu, '{{evcrate:scripts/$1}}'],
  [/(?<![~A-Za-z0-9_./-])(?:\.\/)?\.claude\/hooks\/([^\s)`\]"']+)/gu, '{{evcrate:hooks/$1}}'],
];
const LOCAL_PATHS: readonly [string, string][] = [
  ['.claude/commands', '.pi/agent/evcrate/commands'], ['.claude/agents', '.pi/agent/agents'],
  ['.claude/skills', '.pi/agent/skills'], ['.claude/workflows', '.pi/agent/evcrate/workflows'],
  ['.claude/scripts', '.pi/agent/evcrate/scripts'], ['.claude/hooks', '.pi/agent/evcrate/hooks'],
  ['.claude/output-styles', '.pi/agent/evcrate/output-styles'], ['.claude/.evcrate.json', '.pi/.evcrate.json'],
  ['.claude/.mcp.json', '.pi/.mcp.json'], ['.claude/.env', '.pi/.env'],
];
const COMMAND_NAME = '[a-z0-9][a-z0-9:_-]*';
const QUOTED_COMMAND = new RegExp(`\`/(?<name>${COMMAND_NAME})(?<args>[^\`\\n]*)\``, 'giu');
const BARE_COMMAND = new RegExp(`(?<![\\w/:<])/(?<name>${COMMAND_NAME})(?![a-z0-9:_-]|\\*)`, 'giu');
const DIRECTIVE = /\b(?:trigger|invoke|execute|run|dispatch|call)\b/iu;
const SLASH_PHRASE = /\bslash\s*[- ]?commands?\b/iu;
const USE = /\buse\b/iu;
const NON_DIRECTIVE = /\b(?:command\s*[- ]?path|discover(?:y|ing)?|available|examples?)\b/iu;
const FENCE = /^\s*(?:`{3,}|~{3,})/u;

function knownCommandNames(commands: readonly string[]): ReadonlySet<string> {
  return new Set(commands.map((command) => command.replaceAll('/', ':').toLowerCase()));
}

function translateDirectiveLine(line: string, commands: ReadonlySet<string>): string {
  if (commands.size === 0 || NON_DIRECTIVE.test(line) || (!DIRECTIVE.test(line) && !(USE.test(line) && SLASH_PHRASE.test(line)))) return line;
  const markdownReference = (value: string, position: number): boolean => {
    const opening = value.lastIndexOf('[', position);
    return opening >= 0 && value.indexOf(']', opening) >= position;
  };
  let translated = line.replace(QUOTED_COMMAND, (all, name: string, args: string, offset: number) => {
    const lower = name.toLowerCase();
    return !commands.has(lower) || markdownReference(line, offset) ? all : `{{evcrate:commands/${lower}}}${args}`;
  });
  translated = translated.replace(BARE_COMMAND, (all, name: string, offset: number) => {
    const lower = name.toLowerCase();
    return !commands.has(lower) || markdownReference(translated, offset) || (offset > 0 && '[('.includes(translated[offset - 1]))
      ? all : `{{evcrate:commands/${lower}}}`;
  });
  return translated;
}

function translateNestedCommands(value: string, commands: readonly string[]): string {
  const known = knownCommandNames(commands);
  let fenced = false;
  return value.split('\n').map((line, index, lines) => {
    const suffix = index + 1 < lines.length ? '\n' : '';
    if (FENCE.test(line)) fenced = !fenced;
    return `${fenced ? line : translateDirectiveLine(line, known)}${suffix}`;
  }).join('');
}

export function translatePrompt(value: string, commands: readonly string[] = []): string {
  const urls: string[] = [];
  let translated = normalizeLf(value).replace(URL, (match) => { const token = `__PI_URL_${urls.length}__`; urls.push(match); return token; });
  for (const [pattern, replacement] of PATH_TRANSLATIONS) translated = translated.replace(pattern, replacement);
  for (const prefix of ['$HOME', '${HOME}', '~']) for (const separator of ['/', '\\']) {
    for (const suffix of ['scripts', 'hooks', 'workflows', 'output-styles', '.env', '.mcp.json']) {
      const target = ['.env', '.mcp.json'].includes(suffix) ? `.pi/${suffix}` : `.pi/agent/evcrate/${suffix}`;
      translated = translated.replace(`${prefix}${separator}.claude${separator}${suffix}`, `${prefix}${separator}${target.replaceAll('/', separator)}`);
    }
  }
  const component = /(?<base>home|Path\.home\(\)|os\.homedir\(\))\s*\/\s*(?<quote>['"])\.claude\k<quote>\s*\/\s*\k<quote>(?<suffix>skills|scripts|hooks|workflows|output-styles|\.env|\.evcrate\.json|\.mcp\.json)\k<quote>/gu;
  translated = translated.replace(component, (all, base: string, quote: string, suffix: string) => {
    const parts = suffix === 'skills' ? ['.pi', 'agent', 'skills'] : ['scripts', 'hooks', 'workflows', 'output-styles'].includes(suffix) ? ['.pi', 'agent', 'evcrate', suffix] : ['.pi', suffix];
    return base + parts.map((part) => ` / ${quote}${part}${quote}`).join('');
  });
  for (const prefix of ['$HOME', '${HOME}', '~']) translated = translated.replaceAll(`${prefix}/.claude/skills`, `${prefix}/.pi/agent/skills`);
  translated = translated.replaceAll('.claude/skills', '.pi/agent/skills').replaceAll('.claude/.evcrate.json', '.pi/.evcrate.json').replaceAll('.claude/.mcp.json', '.pi/.mcp.json').replaceAll('.claude/.env', '.pi/.env');
  for (const [source, replacement] of LOCAL_PATHS) translated = translated.replaceAll(source, replacement).replaceAll(source.replaceAll('/', '\\'), replacement.replaceAll('/', '\\'));
  translated = translated.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\'"`)\}]|\s|$))/gu, '.pi');
  translated = translateNestedCommands(translated, commands);
  for (const [pattern, replacement] of [[/\bAskUserQuestion\b/gu, 'ask_user_question'], [/\bTask\b/gu, 'evcrate_subagent'], [/\bWebSearch\b|\bWebFetch\b/gu, 'web research'], [/\bSkill tool\b/gu, 'Pi skill']] as const) translated = translated.replace(pattern, replacement);
  return restoreIndexedTokens(translated, '__PI_URL_', urls);
}

export function translatePiSkill(value: string): string {
  const component = /(?<base>[A-Za-z_][A-Za-z0-9_.]*)\s*\/\s*(?<quote>['"])\.claude\k<quote>\s*\/\s*\k<quote>(?<suffix>skills|scripts|hooks|workflows|output-styles|\.env|\.evcrate\.json|\.mcp\.json)\k<quote>/gu;
  let translated = value.replace(component, (all, base: string, quote: string, suffix: string) => {
    const parts = suffix === 'skills' ? ['.pi', 'agent', 'skills'] : ['scripts', 'hooks', 'workflows', 'output-styles'].includes(suffix) ? ['.pi', 'agent', 'evcrate', suffix] : ['.pi', suffix];
    return base + parts.map((part) => ` / ${quote}${part}${quote}`).join('');
  });
  translated = translated.replace(/path\.resolve\(skillsDir, ['"]\.\.['"]\)/gu, "path.resolve(skillsDir, '../..')");
  translated = translated.replace(/script_dir\.parent\.parent\.parent\s*\/\s*['"]\.env['"]/gu, "script_dir.parent.parent.parent.parent / '.env'");
  translated = translated.replace(/claude_dir\s*=\s*skills_dir\.parent/gu, 'claude_dir = skills_dir.parent.parent');
  return translatePrompt(translated);
}

export function renderHarnessScriptReferences(value: string): string {
  const urls: string[] = [];
  const uri = /(?<![A-Za-z0-9_./])(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/giu;
  let rendered = normalizeLf(value).replace(uri, (match) => {
    const token = `__EVCRATE_HARNESS_URL_${urls.length}__`; urls.push(match); return token;
  });
  const suffixes = ['output-styles', 'workflows', 'scripts', 'hooks', 'skills', '.evcrate.json', '.mcp.json', '.env'];
  const targetPath = (scope: 'global' | 'local', suffix: string): string => {
    if (suffix === 'skills') return '.pi/agent/skills';
    if (['scripts', 'hooks', 'workflows', 'output-styles'].includes(suffix)) return `.pi/agent/evcrate/${suffix}`;
    return `.pi/${suffix}`;
  };
  for (const prefix of ['~', '$HOME', '${HOME}']) for (const suffix of suffixes) {
    const target = targetPath('global', suffix);
    rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, `${prefix}/${target}`);
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.pi/agent`);
  }
  for (const suffix of suffixes) rendered = rendered.replaceAll(`.claude/${suffix}`, targetPath('local', suffix));
  const suffixPattern = suffixes.map((suffix) => suffix.replaceAll('.', '\\.')).join('|');
  const joinPattern = new RegExp(`path\\.join\\(\\s*(?<base>os\\.homedir\\(\\)|process\\.cwd\\(\\))\\s*,\\s*(?<quote>['\"])\\.claude\\k<quote>\\s*,\\s*\\k<quote>(?<suffix>${suffixPattern})\\k<quote>`, 'gu');
  rendered = rendered.replace(joinPattern, (all, base: string, quote: string, suffix: string) => {
    const parts = targetPath(base === 'os.homedir()' ? 'global' : 'local', suffix).split('/');
    return `path.join(${base}${parts.map((part) => `, ${quote}${part}${quote}`).join('')}`;
  });
  const componentPattern = new RegExp(`(?<base>home|Path\\.home\\(\\)|os\\.homedir\\(\\)|process\\.cwd\\(\\)|project_root|directory|current|[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)\\s*\\/\\s*(?<quote>['\"])\\.claude\\k<quote>\\s*\\/\\s*\\k<quote>(?<suffix>${suffixPattern})\\k<quote>`, 'gu');
  rendered = rendered.replace(componentPattern, (all, base: string, quote: string, suffix: string) => {
    const global = ['home', 'Path.home()', 'os.homedir()'].includes(base);
    return base + targetPath(global ? 'global' : 'local', suffix).split('/').map((part) => ` / ${quote}${part}${quote}`).join('');
  });
  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\'"`)\}]|\s|$))/gu, '.pi');
  return restoreIndexedTokens(rendered, '__EVCRATE_HARNESS_URL_', urls);
}
