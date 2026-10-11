import { isPlainObject } from '../../protocol/json.js';

export const MAX_OPERANDS = 256;
export const MAX_OPERAND_BYTES = 4096; // 4 KiB per path

export type NormalizedToolKind =
  | 'read'
  | 'edit'
  | 'search'
  | 'terminal'
  | 'subagent'
  | 'web'
  | 'unrelated';

export interface NormalizedToolOperation {
  kind: NormalizedToolKind;
  toolName: string;
  operands: string[];
  command?: string;
  pattern?: string;
  toolUseId?: string;
  originalInput: Record<string, unknown>;
  executionBase?: string;
}

export interface UnqualifiedToolInput {
  kind: 'unqualified';
  toolName: string;
  reason: string;
  originalInput: Record<string, unknown>;
}

export type NormalizedToolResult = NormalizedToolOperation | UnqualifiedToolInput;

const READ_TOOL_NAMES: Record<string, true> = {
  read_file: true,
  view: true,
  readfile: true,
  read: true,
  'read/readfile': true,
  copilot_readfile: true,
  getnotebooksummary: true,
  'read/getnotebooksummary': true,
  copilot_getnotebooksummary: true
};

const EDIT_TOOL_NAMES: Record<string, true> = {
  edit_file: true,
  edit: true,
  editfiles: true,
  str_replace_editor: true,
  apply_patch: true,
  applypatch: true,
  write: true,
  create: true,
  createfile: true,
  copilot_createfile: true,
  replacestring: true,
  copilot_replacestring: true,
  insertedit: true,
  copilot_insertedit: true,
  multireplacestring: true,
  copilot_multireplacestring: true,
  editnotebook: true,
  'edit/editnotebook': true,
  copilot_editnotebook: true
};

const TERMINAL_TOOL_NAMES: Record<string, true> = {
  run_in_terminal: true,
  execute: true,
  runinterminal: true,
  bash: true,
  terminal: true,
  powershell: true
};

const GREP_TOOL_NAMES: Record<string, true> = {
  grep_search: true,
  grep: true,
  rg: true,
  textsearch: true,
  'search/textsearch': true,
  copilot_findtextinfiles: true
};

const GLOB_TOOL_NAMES: Record<string, true> = {
  file_search: true,
  glob: true,
  find: true,
  filesearch: true,
  'search/filesearch': true,
  copilot_findfiles: true,
  listdirectory: true,
  'search/listdirectory': true,
  copilot_listdirectory: true
};

const SUBAGENT_TOOL_NAMES: Record<string, true> = {
  runsubagent: true,
  'agent/runsubagent': true,
  task: true,
  subagent: true
};

const UNRELATED_TOOL_NAMES: Record<string, true> = {
  ask_user: true,
  askuserquestion: true,
  question: true,
  todo: true,
  manage_todo_list: true,
  todowrite: true,
  view_image: true,
  copilot_viewimage: true,
  read_resource: true,
  list_resources: true,
  getterminaloutput: true,
  killterminal: true
};

const WEB_TOOL_NAMES: Record<string, true> = {
  web_fetch: true,
  webfetch: true,
  fetch: true,
  'web/fetch': true,
  copilot_fetchwebpage: true,
  fetchwebpage: true
};

const NOTEBOOK_EDIT_TOOL_NAMES: Record<string, true> = {
  editnotebook: true,
  'edit/editnotebook': true,
  copilot_editnotebook: true
};

const VALID_NOTEBOOK_EDIT_TYPES: Record<string, true> = {
  insert: true,
  edit: true,
  delete: true
};

const CANONICAL_BLOCKED_DIR_NAMES: Record<string, true> = {
  node_modules: true,
  dist: true,
  build: true,
  '.next': true,
  '.nuxt': true,
  __pycache__: true,
  '.venv': true,
  venv: true,
  vendor: true,
  target: true,
  '.git': true,
  coverage: true
};

const BARE_PRIVACY_REGEX = /credentials|id_rsa|id_ed25519|secrets?\.ya?ml|\.env/i;

export function extractCommandOperands(command: string): string[] {
  const operands: string[] = [];
  const cleaned = command.trim();
  if (!cleaned) return operands;

  // 1. Quoted segments
  const quotedRegex = /["']([^"']+)["']/g;
  let match: RegExpExecArray | null = quotedRegex.exec(cleaned);
  while (match !== null) {
    if (match[1] && match[1].trim()) {
      operands.push(match[1].trim());
    }
    match = quotedRegex.exec(cleaned);
  }

  // 2. Unquoted tokens
  const withoutQuotes = cleaned.replace(/["'][^"']*["']/g, ' ');
  const tokens = withoutQuotes.split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Check flag with assignment or variable assignment (e.g., --file=.env, -o=dist, FILE=.env)
    if (token.includes('=')) {
      const eqIndex = token.indexOf('=');
      const val = token.slice(eqIndex + 1).trim();
      if (val && !val.startsWith('-')) {
        operands.push(val);
      }
      continue;
    }

    // Skip bare command flags (e.g., -rf, --verbose)
    if (token.startsWith('-')) continue;

    // Skip command verbs/keywords at index 0
    if (i === 0) continue;

    // Check path or file argument: slashes, dots, canonical blocked dirs, or sensitive patterns
    if (
      token.includes('/') ||
      token.includes('\\') ||
      token.startsWith('.') ||
      token.includes('.') ||
      CANONICAL_BLOCKED_DIR_NAMES[token] ||
      BARE_PRIVACY_REGEX.test(token)
    ) {
      operands.push(token);
    }
  }

  return operands;
}
export function extractGlobRoot(pattern: string): string | undefined {
  if (typeof pattern !== 'string') return undefined;
  let normalized = pattern.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  const wildcardIndex = normalized.search(/[*?[{]/);
  let dirPrefix: string;
  if (wildcardIndex === -1) {
    dirPrefix = normalized;
  } else {
    const prefix = normalized.slice(0, wildcardIndex);
    const lastSlash = prefix.lastIndexOf('/');
    if (lastSlash === -1) {
      return undefined;
    }
    dirPrefix = prefix.slice(0, lastSlash);
  }
  dirPrefix = dirPrefix.trim();
  while (dirPrefix.endsWith('/')) dirPrefix = dirPrefix.slice(0, -1);
  return dirPrefix || undefined;
}

export function collectSearchOperands(toolInput: Record<string, unknown>, extraOperand?: string): string[] {
  const operands: string[] = [];
  const directPath =
    toolInput.path ??
    toolInput.folder ??
    toolInput.SearchPath ??
    toolInput.filePath ??
    toolInput.FilePath ??
    toolInput.dirPath ??
    toolInput.DirPath ??
    toolInput.directoryPath ??
    toolInput.DirectoryPath;
  if (typeof directPath === 'string' && directPath.trim()) {
    operands.push(directPath.trim());
  }

  const rawIncludes =
    toolInput.includePattern ??
    toolInput.filesToInclude ??
    toolInput.include ??
    toolInput.includes ??
    toolInput.includePatterns;
  if (typeof rawIncludes === 'string' && rawIncludes.trim()) {
    for (const item of rawIncludes.split(',')) {
      const trimmed = item.trim();
      if (trimmed) operands.push(trimmed);
    }
  } else if (Array.isArray(rawIncludes)) {
    for (const item of rawIncludes) {
      if (typeof item === 'string' && item.trim()) {
        operands.push(item.trim());
      }
    }
  }

  if (typeof extraOperand === 'string' && extraOperand.trim()) {
    const trimmedExtra = extraOperand.trim();
    if (!operands.includes(trimmedExtra)) {
      operands.push(trimmedExtra);
    }
  }

  return operands;
}

export function normalizeLocalTool(
  rawToolName: string,
  rawToolInput: unknown,
  toolUseId?: string,
  contextCwd?: string
): NormalizedToolResult {
  const toolName = rawToolName.trim();
  const lowerName = toolName.toLowerCase();

  if (!isPlainObject(rawToolInput)) {
    return {
      kind: 'unqualified',
      toolName,
      reason: 'tool_input must be a non-null JSON object',
      originalInput: {}
    };
  }

  const toolInput = rawToolInput as Record<string, unknown>;

  // Check bounds and normalize path strings
  const validateOperands = (ops: string[]): string[] | string => {
    if (ops.length > MAX_OPERANDS) {
      return `Total path operands (${ops.length}) exceed maximum permitted limit (${MAX_OPERANDS})`;
    }
    const validated: string[] = [];
    for (const op of ops) {
      const bytes = new TextEncoder().encode(op).byteLength;
      if (bytes > MAX_OPERAND_BYTES) {
        return `Operand length (${bytes} bytes) exceeds maximum permitted limit (${MAX_OPERAND_BYTES} bytes)`;
      }
      let norm = op.trim().replace(/\\/g, '/');
      if (norm.startsWith('file://')) {
        norm = norm.slice('file://'.length);
      }
      while (norm.startsWith('./')) {
        norm = norm.slice(2);
      }
      validated.push(norm);
    }
    return validated;
  };

  // 1. Read operations
  if (READ_TOOL_NAMES[lowerName]) {
    const rawPath =
      toolInput.filePath ??
      toolInput.FilePath ??
      toolInput.path ??
      toolInput.file_path ??
      toolInput.target_file ??
      toolInput.TargetFile;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Read tool requires a non-empty string path parameter',
        originalInput: toolInput
      };
    }
    const checked = validateOperands([rawPath]);
    if (typeof checked === 'string') {
      return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
    }
    return {
      kind: 'read',
      toolName,
      operands: checked,
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 2. Edit operations
  if (EDIT_TOOL_NAMES[lowerName]) {
    const directPath =
      toolInput.filePath ??
      toolInput.FilePath ??
      toolInput.path ??
      toolInput.file_path ??
      toolInput.target_file ??
      toolInput.TargetFile;
    if (NOTEBOOK_EDIT_TOOL_NAMES[lowerName]) {
      if (typeof directPath !== 'string' || !directPath.trim()) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Notebook edit tool requires a non-empty filePath string',
          originalInput: toolInput
        };
      }
      const editType = toolInput.editType;
      if (typeof editType !== 'string' || !VALID_NOTEBOOK_EDIT_TYPES[editType]) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Notebook edit tool requires editType to be "insert", "edit", or "delete"',
          originalInput: toolInput
        };
      }
      const cellId = toolInput.cellId;
      if (typeof cellId !== 'string' || !cellId.trim()) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Notebook edit tool requires a non-empty cellId string',
          originalInput: toolInput
        };
      }
      const checked = validateOperands([directPath]);
      if (typeof checked === 'string') {
        return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
      }
      return {
        kind: 'edit',
        toolName,
        operands: checked,
        toolUseId,
        originalInput: toolInput,
        executionBase: contextCwd
      };
    }

    const collectedPaths: string[] = [];
    if (typeof directPath === 'string' && directPath.trim()) {
      collectedPaths.push(directPath);
    }

    // Check multi-file edits array
    if (Array.isArray(toolInput.files)) {
      for (const item of toolInput.files) {
        if (isPlainObject(item)) {
          const itemPath =
            item.filePath ??
            item.FilePath ??
            item.path ??
            item.file_path ??
            item.target_file ??
            item.TargetFile;
          if (typeof itemPath === 'string' && itemPath.trim()) {
            collectedPaths.push(itemPath);
          }
        }
      }
    }

    // Check multi-replace replacements array
    if (Array.isArray(toolInput.replacements)) {
      for (const item of toolInput.replacements) {
        if (isPlainObject(item)) {
          const itemPath =
            item.filePath ??
            item.FilePath ??
            item.path ??
            item.file_path ??
            item.target_file ??
            item.TargetFile;
          if (typeof itemPath === 'string' && itemPath.trim()) {
            collectedPaths.push(itemPath);
          }
        }
      }
    }

    // Check patch / diff header targets if present
    if (typeof toolInput.patch === 'string') {
      const patch = toolInput.patch;
      const patchTargets = patch.match(/--- [ab]\/(.+)|=== (.+)/g) || [];
      for (const t of patchTargets) {
        const cleanTarget = t.replace(/^(--- [ab]\/|=== )/, '').trim();
        if (cleanTarget && cleanTarget !== '/dev/null') {
          collectedPaths.push(cleanTarget);
        }
      }
    }

    if (collectedPaths.length === 0) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Edit tool requires at least one target path or edit specification',
        originalInput: toolInput
      };
    }

    const checked = validateOperands(collectedPaths);
    if (typeof checked === 'string') {
      return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
    }
    return {
      kind: 'edit',
      toolName,
      operands: checked,
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 3. Terminal operations
  if (TERMINAL_TOOL_NAMES[lowerName]) {
    const command = toolInput.command ?? toolInput.CommandLine;
    if (typeof command !== 'string' || !command.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Terminal tool requires a non-empty command string',
        originalInput: toolInput
      };
    }
    const extracted = extractCommandOperands(command);
    const checked = validateOperands(extracted);
    if (typeof checked === 'string') {
      return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
    }
    const toolCwd = typeof toolInput.cwd === 'string' && toolInput.cwd.trim() ? toolInput.cwd.trim() : contextCwd;
    return {
      kind: 'terminal',
      toolName,
      operands: checked,
      command,
      toolUseId,
      originalInput: toolInput,
      executionBase: toolCwd
    };
  }

  // 4. Grep / Text search operations
  if (GREP_TOOL_NAMES[lowerName]) {
    const query = toolInput.query ?? toolInput.pattern;
    if (typeof query !== 'string' || !query.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Grep search tool requires a non-empty query or pattern string',
        originalInput: toolInput
      };
    }
    const operandsToValidate = collectSearchOperands(toolInput);
    const checked = validateOperands(operandsToValidate);
    if (typeof checked === 'string') {
      return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
    }
    return {
      kind: 'search',
      toolName,
      operands: checked,
      pattern: query,
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 5. Glob / File search operations
  if (GLOB_TOOL_NAMES[lowerName]) {
    const isListDir = lowerName.includes('listdirectory');
    const pattern = toolInput.pattern ?? toolInput.query ?? (isListDir ? '*' : undefined);
    if (typeof pattern !== 'string' || !pattern.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'File search tool requires a non-empty pattern string',
        originalInput: toolInput
      };
    }
    const globRoot = extractGlobRoot(pattern);
    const operandsToValidate = collectSearchOperands(toolInput, globRoot);
    const checked = validateOperands(operandsToValidate);
    if (typeof checked === 'string') {
      return { kind: 'unqualified', toolName, reason: checked, originalInput: toolInput };
    }
    return {
      kind: 'search',
      toolName,
      operands: checked,
      pattern,
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 6. Subagent operations
  if (SUBAGENT_TOOL_NAMES[lowerName]) {
    const agentName = toolInput.agentName ?? toolInput.agent_type ?? toolInput.agent_id;
    if (typeof agentName !== 'string' || !agentName.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Subagent tool requires a non-empty agentName identifier',
        originalInput: toolInput
      };
    }
    return {
      kind: 'subagent',
      toolName,
      operands: [agentName.trim()],
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 7. Web fetch operations
  if (WEB_TOOL_NAMES[lowerName]) {
    const query = toolInput.query;
    if (typeof query !== 'string' || !query.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Web fetch tool requires a non-empty query string',
        originalInput: toolInput
      };
    }

    const rawUrls = toolInput.urls;
    if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Web fetch tool requires a non-empty urls array',
        originalInput: toolInput
      };
    }

    if (rawUrls.length > MAX_OPERANDS) {
      return {
        kind: 'unqualified',
        toolName,
        reason: `Total URL operands (${rawUrls.length}) exceed maximum permitted limit (${MAX_OPERANDS})`,
        originalInput: toolInput
      };
    }

    const validatedUrls: string[] = [];
    for (const u of rawUrls) {
      if (typeof u !== 'string' || !u.trim()) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Web fetch urls array must contain only non-empty URL strings',
          originalInput: toolInput
        };
      }
      const trimmedUrl = u.trim();
      const bytes = new TextEncoder().encode(trimmedUrl).byteLength;
      if (bytes > MAX_OPERAND_BYTES) {
        return {
          kind: 'unqualified',
          toolName,
          reason: `URL operand length (${bytes} bytes) exceeds maximum permitted limit (${MAX_OPERAND_BYTES} bytes)`,
          originalInput: toolInput
        };
      }
      let parsed: URL;
      try {
        parsed = new URL(trimmedUrl);
      } catch {
        return {
          kind: 'unqualified',
          toolName,
          reason: `Web fetch requires valid HTTP(S) URLs; invalid URL "${trimmedUrl}"`,
          originalInput: toolInput
        };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          kind: 'unqualified',
          toolName,
          reason: `Web fetch only permits http: or https: protocols; rejected "${parsed.protocol}"`,
          originalInput: toolInput
        };
      }
      if (!parsed.hostname) {
        return {
          kind: 'unqualified',
          toolName,
          reason: `Web fetch URL requires a valid hostname: "${trimmedUrl}"`,
          originalInput: toolInput
        };
      }
      validatedUrls.push(trimmedUrl);
    }

    return {
      kind: 'web',
      toolName,
      operands: validatedUrls,
      pattern: query.trim(),
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 7. Known unrelated tools
  if (UNRELATED_TOOL_NAMES[lowerName]) {
    return {
      kind: 'unrelated',
      toolName,
      operands: [],
      toolUseId,
      originalInput: toolInput,
      executionBase: contextCwd
    };
  }

  // 8. Unknown / Unqualified tool
  return {
    kind: 'unqualified',
    toolName,
    reason: `Unrecognized or unqualified tool schema: "${toolName}"`,
    originalInput: toolInput
  };
}
