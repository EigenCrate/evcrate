'use strict';

const MAX_OPERANDS = 256;
const MAX_OPERAND_BYTES = 4096;

const READ_TOOL_NAMES = {
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

const EDIT_TOOL_NAMES = {
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

const TERMINAL_TOOL_NAMES = {
  run_in_terminal: true,
  execute: true,
  runinterminal: true,
  bash: true,
  terminal: true,
  powershell: true
};

const GREP_TOOL_NAMES = {
  grep_search: true,
  grep: true,
  rg: true,
  textsearch: true,
  'search/textsearch': true,
  copilot_findtextinfiles: true
};

const GLOB_TOOL_NAMES = {
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

const SUBAGENT_TOOL_NAMES = {
  runsubagent: true,
  'agent/runsubagent': true,
  task: true,
  subagent: true
};

const UNRELATED_TOOL_NAMES = {
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

const WEB_TOOL_NAMES = {
  web_fetch: true,
  webfetch: true,
  fetch: true,
  'web/fetch': true,
  copilot_fetchwebpage: true,
  fetchwebpage: true
};

const NOTEBOOK_EDIT_TOOL_NAMES = {
  editnotebook: true,
  'edit/editnotebook': true,
  copilot_editnotebook: true
};

const VALID_NOTEBOOK_EDIT_TYPES = {
  insert: true,
  edit: true,
  delete: true
};

const CANONICAL_BLOCKED_DIR_NAMES = {
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

function extractCommandOperands(command) {
  const operands = [];
  const cleaned = (command || '').trim();
  if (!cleaned) return operands;

  const quotedRegex = /["']([^"']+)["']/g;
  let match = quotedRegex.exec(cleaned);
  while (match !== null) {
    if (match[1] && match[1].trim()) {
      operands.push(match[1].trim());
    }
    match = quotedRegex.exec(cleaned);
  }

  const withoutQuotes = cleaned.replace(/["'][^"']*["']/g, ' ');
  const tokens = withoutQuotes.split(/\s+/).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.includes('=')) {
      const eqIndex = token.indexOf('=');
      const val = token.slice(eqIndex + 1).trim();
      if (val && !val.startsWith('-')) {
        operands.push(val);
      }
      continue;
    }

    if (token.startsWith('-')) continue;
    if (i === 0) continue;

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
function extractGlobRoot(pattern) {
  if (typeof pattern !== 'string') return undefined;
  let normalized = pattern.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  const wildcardIndex = normalized.search(/[*?[{]/);
  let dirPrefix;
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

function collectSearchOperands(toolInput, extraOperand) {
  const operands = [];
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

function normalizeLocalTool(rawToolName, rawToolInput, toolUseId, contextCwd) {
  const toolName = (rawToolName || '').trim();
  const lowerName = toolName.toLowerCase();

  if (!rawToolInput || typeof rawToolInput !== 'object' || Array.isArray(rawToolInput)) {
    return {
      kind: 'unqualified',
      toolName,
      reason: 'tool_input must be a non-null JSON object',
      originalInput: {}
    };
  }

  const toolInput = rawToolInput;

  const validateOperands = (ops) => {
    if (ops.length > MAX_OPERANDS) {
      return 'Total path operands (' + ops.length + ') exceed maximum permitted limit (' + MAX_OPERANDS + ')';
    }
    const validated = [];
    for (const op of ops) {
      const byteLen = Buffer.byteLength(op, 'utf8');
      if (byteLen > MAX_OPERAND_BYTES) {
        return 'Operand length (' + byteLen + ' bytes) exceeds maximum permitted limit (' + MAX_OPERAND_BYTES + ' bytes)';
      }
      let norm = op.trim().replace(/\\/g, '/');
      if (norm.startsWith('file://')) norm = norm.slice('file://'.length);
      while (norm.startsWith('./')) norm = norm.slice(2);
      validated.push(norm);
    }
    return validated;
  };

  // 1. Read operations
  if (READ_TOOL_NAMES[lowerName]) {
    const rawPath = toolInput.filePath ?? toolInput.FilePath ?? toolInput.path ?? toolInput.file_path ?? toolInput.target_file ?? toolInput.TargetFile;
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
    if (NOTEBOOK_EDIT_TOOL_NAMES[lowerName]) {
      const editType = toolInput.editType;
      if (editType !== undefined && (typeof editType !== 'string' || !VALID_NOTEBOOK_EDIT_TYPES[editType])) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Notebook edit tool requires editType to be "insert", "edit", or "delete"',
          originalInput: toolInput
        };
      }
    }

    const collectedPaths = [];
    const directPath = toolInput.filePath ?? toolInput.FilePath ?? toolInput.path ?? toolInput.file_path ?? toolInput.target_file ?? toolInput.TargetFile;
    if (typeof directPath === 'string' && directPath.trim()) {
      collectedPaths.push(directPath);
    }

    if (Array.isArray(toolInput.files)) {
      for (const item of toolInput.files) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const itemPath = item.filePath ?? item.FilePath ?? item.path ?? item.file_path ?? item.target_file ?? item.TargetFile;
          if (typeof itemPath === 'string' && itemPath.trim()) {
            collectedPaths.push(itemPath);
          }
        }
      }
    }

    if (Array.isArray(toolInput.replacements)) {
      for (const item of toolInput.replacements) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const itemPath = item.filePath ?? item.FilePath ?? item.path ?? item.file_path ?? item.target_file ?? item.TargetFile;
          if (typeof itemPath === 'string' && itemPath.trim()) {
            collectedPaths.push(itemPath);
          }
        }
      }
    }

    if (typeof toolInput.patch === 'string') {
      const patchTargets = toolInput.patch.match(/--- [ab]\/(.+)|=== (.+)/g) || [];
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

  // 4. Grep search operations
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

  // 5. File search operations
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
        reason: 'Total URL operands (' + rawUrls.length + ') exceed maximum permitted limit (' + MAX_OPERANDS + ')',
        originalInput: toolInput
      };
    }

    const validatedUrls = [];
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
      const byteLen = Buffer.byteLength(trimmedUrl, 'utf8');
      if (byteLen > MAX_OPERAND_BYTES) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'URL operand length (' + byteLen + ' bytes) exceeds maximum permitted limit (' + MAX_OPERAND_BYTES + ' bytes)',
          originalInput: toolInput
        };
      }
      let parsed;
      try {
        parsed = new URL(trimmedUrl);
      } catch {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Web fetch requires valid HTTP(S) URLs; invalid URL "' + trimmedUrl + '"',
          originalInput: toolInput
        };
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Web fetch only permits http: or https: protocols; rejected "' + parsed.protocol + '"',
          originalInput: toolInput
        };
      }
      if (!parsed.hostname) {
        return {
          kind: 'unqualified',
          toolName,
          reason: 'Web fetch URL requires a valid hostname: "' + trimmedUrl + '"',
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

  // 7. Unrelated tools
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

  // 8. Unknown tool
  return {
    kind: 'unqualified',
    toolName,
    reason: 'Unrecognized or unqualified tool schema: "' + toolName + '"',
    originalInput: toolInput
  };
}

module.exports = {
  MAX_OPERANDS,
  MAX_OPERAND_BYTES,
  extractCommandOperands,
  extractGlobRoot,
  collectSearchOperands,
  normalizeLocalTool
};
