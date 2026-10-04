export const VSCODE_LOCAL_TOOL_MAP: Readonly<Record<string, string>> = Object.freeze({
  read: 'read_file',
  edit: 'edit_file',
  write: 'edit_file',
  multiedit: 'edit_file',
  bash: 'run_in_terminal',
  bashoutput: 'run_in_terminal',
  killbash: 'run_in_terminal',
  killshell: 'run_in_terminal',
  grep: 'grep_search',
  glob: 'file_search',
  ls: 'file_search',
  task: 'runSubagent'
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
      mappedSet[native] = true;
      if (native === 'runSubagent') {
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
