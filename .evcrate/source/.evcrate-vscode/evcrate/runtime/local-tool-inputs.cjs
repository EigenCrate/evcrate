'use strict';

const MAX_OPERANDS = 256;
const MAX_OPERAND_BYTES = 4096;

const READ_TOOL_NAMES = {
  read_file: true,
  view: true,
  readfile: true,
  read: true
};

const EDIT_TOOL_NAMES = {
  edit_file: true,
  edit: true,
  editfiles: true,
  str_replace_editor: true,
  apply_patch: true,
  write: true,
  create: true
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
  rg: true
};

const GLOB_TOOL_NAMES = {
  file_search: true,
  glob: true,
  find: true
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
  read_resource: true,
  list_resources: true
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
    const rawPath = toolInput.path || toolInput.file_path || toolInput.target_file || toolInput.TargetFile;
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
    const collectedPaths = [];
    const directPath = toolInput.path || toolInput.file_path || toolInput.target_file || toolInput.TargetFile;
    if (typeof directPath === 'string' && directPath.trim()) {
      collectedPaths.push(directPath);
    }

    if (Array.isArray(toolInput.files)) {
      for (const item of toolInput.files) {
        if (item && typeof item === 'object' && typeof item.path === 'string' && item.path.trim()) {
          collectedPaths.push(item.path);
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
    const command = toolInput.command || toolInput.CommandLine;
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
    const query = toolInput.query || toolInput.pattern;
    if (typeof query !== 'string' || !query.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'Grep search tool requires a non-empty query or pattern string',
        originalInput: toolInput
      };
    }
    const pathOperand = toolInput.path || toolInput.folder || toolInput.SearchPath;
    const operandsToValidate = typeof pathOperand === 'string' && pathOperand.trim() ? [pathOperand] : [];
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
    const pattern = toolInput.pattern || toolInput.query;
    if (typeof pattern !== 'string' || !pattern.trim()) {
      return {
        kind: 'unqualified',
        toolName,
        reason: 'File search tool requires a non-empty pattern string',
        originalInput: toolInput
      };
    }
    const folderOperand = toolInput.folder || toolInput.path || toolInput.DirectoryPath;
    const operandsToValidate = typeof folderOperand === 'string' && folderOperand.trim() ? [folderOperand] : [];
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
    const agentName = toolInput.agentName || toolInput.agent_type || toolInput.agent_id;
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
  normalizeLocalTool
};
