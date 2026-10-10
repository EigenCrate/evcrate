/**
 * Canonical tool capability mapping from Claude/EVCrate source to native VS Code / Copilot Chat references.
 *
 * Distinct namespaces:
 * 1. Canonical source tool intent: authoring names (Read, Glob, Grep, LS, Bash, Edit, Write, Task, TodoWrite, etc.)
 * 2. Host frontmatter tool references: declarations emitted in agent frontmatter (e.g. read/readFile,
 *    search/fileSearch, search/textSearch, search/listDirectory, runInTerminal, getTerminalOutput,
 *    killTerminal, agent/runSubagent, todo, editFiles, createFile, multiReplaceString). Resolved by
 *    LanguageModelToolsService.
 * 3. Model-facing invocation names: identifiers used by LLM prompts/schemas (e.g. copilot_readFile,
 *    manage_todo_list).
 * 4. Hook event identities: names observed in PreToolUse/PostToolUse (e.g. read_file, readFile, editFiles).
 *
 * Invariants:
 * - Frontmatter references are declarations of tool enablement for the host, not runtime execution grants or sandboxes.
 * - 'todo' is registered for direct agent capability; the host runtime disables manage_todo_list in child sessions.
 * - Write maps to both creation ('createFile') and overwrite/edit ('editFiles') references.
 * - MultiEdit maps to narrow string replacement ('multiReplaceString'); broad 'applyPatch' is not granted.
 * - canDelegate is derived from recognized source Task capability, independent of output spelling.
 */
export const VSCODE_LOCAL_TOOL_MAP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  read: Object.freeze(['read/readFile']),
  edit: Object.freeze(['editFiles']),
  write: Object.freeze(['createFile', 'editFiles']),
  multiedit: Object.freeze(['multiReplaceString']),
  bash: Object.freeze(['runInTerminal']),
  bashoutput: Object.freeze(['getTerminalOutput']),
  killbash: Object.freeze(['killTerminal']),
  killshell: Object.freeze(['killTerminal']),
  grep: Object.freeze(['search/textSearch']),
  glob: Object.freeze(['search/fileSearch']),
  ls: Object.freeze(['search/listDirectory']),
  task: Object.freeze(['agent/runSubagent']),
  todowrite: Object.freeze(['todo'])
});

export interface ToolMappingResult {
  readonly hasExplicitTools: boolean;
  readonly isExplicitNone: boolean;
  readonly mapped: readonly string[];
  readonly dropped: readonly string[];
  readonly raw: readonly string[];
  readonly canDelegate: boolean;
}

export function mapAgentTools(sourceValue: unknown): ToolMappingResult {
  if (sourceValue === undefined || sourceValue === null) {
    return Object.freeze({
      hasExplicitTools: false,
      isExplicitNone: false,
      mapped: Object.freeze([]),
      dropped: Object.freeze([]),
      raw: Object.freeze([]),
      canDelegate: true
    });
  }

  let items: string[] = [];
  if (Array.isArray(sourceValue)) {
    items = sourceValue.map((v) => String(v).trim()).filter(Boolean);
  } else if (typeof sourceValue === 'string') {
    const trimmed = sourceValue.trim();
    if (trimmed.toLowerCase() === 'none') {
      return Object.freeze({
        hasExplicitTools: true,
        isExplicitNone: true,
        mapped: Object.freeze([]),
        dropped: Object.freeze([]),
        raw: Object.freeze(['none']),
        canDelegate: false
      });
    }
    items = trimmed
      .replace(/^\[/u, '')
      .replace(/\]$/u, '')
      .split(/[,\n]/u)
      .map((item) => item.trim().replace(/^['"]|['"]$/gu, '').replace(/^- /u, '').trim())
      .filter(Boolean);
  }

  if (items.length === 0) {
    return Object.freeze({
      hasExplicitTools: true,
      isExplicitNone: true,
      mapped: Object.freeze([]),
      dropped: Object.freeze([]),
      raw: Object.freeze([]),
      canDelegate: false
    });
  }

  const mappedSet: Record<string, true> = {};
  const droppedSet: Record<string, true> = {};
  let canDelegate = false;

  for (const item of items) {
    const lower = item.toLowerCase();
    const native = VSCODE_LOCAL_TOOL_MAP[lower];
    if (native) {
      for (const ref of native) {
        mappedSet[ref] = true;
      }
      if (lower === 'task' || native.includes('agent/runSubagent') || native.includes('runSubagent')) {
        canDelegate = true;
      }
    } else {
      droppedSet[item] = true;
    }
  }

  const mapped = Object.keys(mappedSet).sort();
  const dropped = Object.keys(droppedSet).sort();

  return Object.freeze({
    hasExplicitTools: true,
    isExplicitNone: false,
    mapped: Object.freeze(mapped),
    dropped: Object.freeze(dropped),
    raw: Object.freeze(items),
    canDelegate
  });
}
