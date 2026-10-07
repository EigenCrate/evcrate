export { LOCAL_SESSION_CONTEXT_SOURCE } from './runtime-session-context-source.js';
export { LOCAL_SESSION_STATE_SOURCE } from './runtime-session-state-source.js';
export { LOCAL_LIFECYCLE_SOURCE } from './runtime-lifecycle-source.js';

// CommonJS runtime sources for VS Code Local native hook bridge closure

export const LOCAL_HOOK_PROTOCOL_SOURCE = `'use strict';

const MAX_STDIN_BYTES = 1024 * 1024; // 1 MiB
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB
const VSCODE_LOCAL_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'SubagentStart',
  'SubagentStop',
  'Stop'
];

class LocalHookProtocolError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.name = 'LocalHookProtocolError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function parseJsonWithoutDuplicates(text) {
  let offset = 0;
  function skipWhitespace() {
    while (offset < text.length && (text[offset] === ' ' || text[offset] === '\\t' || text[offset] === '\\n' || text[offset] === '\\r')) offset++;
  }
  function string() {
    offset++;
    let str = '';
    while (offset < text.length) {
      const c = text[offset++];
      if (c === '"') return str;
      if (c === '\\\\') {
        if (offset >= text.length) throw new SyntaxError('Unterminated string escape');
        const esc = text[offset++];
        if (esc === '"' || esc === '\\\\' || esc === '/') str += esc;
        else if (esc === 'b') str += '\\b';
        else if (esc === 'f') str += '\\f';
        else if (esc === 'n') str += '\\n';
        else if (esc === 'r') str += '\\r';
        else if (esc === 't') str += '\\t';
        else if (esc === 'u') {
          const hex = text.slice(offset, offset + 4);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError('Invalid unicode escape');
          str += String.fromCharCode(parseInt(hex, 16));
          offset += 4;
        } else throw new SyntaxError('Invalid escape character: ' + esc);
      } else {
        str += c;
      }
    }
    throw new SyntaxError('Unterminated string');
  }
  function number() {
    const start = offset;
    if (text[offset] === '-') offset++;
    while (offset < text.length && text[offset] >= '0' && text[offset] <= '9') offset++;
    if (text[offset] === '.') {
      offset++;
      while (offset < text.length && text[offset] >= '0' && text[offset] <= '9') offset++;
    }
    if (text[offset] === 'e' || text[offset] === 'E') {
      offset++;
      if (text[offset] === '+' || text[offset] === '-') offset++;
      while (offset < text.length && text[offset] >= '0' && text[offset] <= '9') offset++;
    }
    const numStr = text.slice(start, offset);
    const num = Number(numStr);
    if (isNaN(num)) throw new SyntaxError('Invalid number: ' + numStr);
    return num;
  }
  function object(depth) {
    if (depth > 64) throw new RangeError('JSON nesting is too deep');
    offset++;
    const output = {};
    const keys = new Set();
    skipWhitespace();
    if (text[offset] === '}') { offset++; return output; }
    while (true) {
      skipWhitespace();
      if (text[offset] !== '"') throw new SyntaxError('Object key must be a string');
      const key = string();
      if (keys.has(key)) throw new SyntaxError('Duplicate JSON object key');
      keys.add(key);
      skipWhitespace();
      if (text[offset++] !== ':') throw new SyntaxError('Object key has no value');
      skipWhitespace();
      const val = value(depth + 1);
      output[key] = val;
      skipWhitespace();
      const delim = text[offset++];
      if (delim === '}') return output;
      if (delim !== ',') throw new SyntaxError('Object separator is invalid');
    }
  }
  function array(depth) {
    if (depth > 64) throw new RangeError('JSON nesting is too deep');
    offset++;
    const output = [];
    skipWhitespace();
    if (text[offset] === ']') { offset++; return output; }
    while (true) {
      skipWhitespace();
      output.push(value(depth + 1));
      skipWhitespace();
      const delim = text[offset++];
      if (delim === ']') return output;
      if (delim !== ',') throw new SyntaxError('Array separator is invalid');
    }
  }
  function value(depth) {
    skipWhitespace();
    const c = text[offset];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    if (text.startsWith('true', offset)) { offset += 4; return true; }
    if (text.startsWith('false', offset)) { offset += 5; return false; }
    if (text.startsWith('null', offset)) { offset += 4; return null; }
    return number();
  }
  try {
    skipWhitespace();
    const rootVal = value(0);
    skipWhitespace();
    if (offset !== text.length) throw new SyntaxError('Trailing JSON data');
    if (rootVal === null || typeof rootVal !== 'object') throw new SyntaxError('JSON document root must be an object or array');
    return rootVal;
  } catch (err) {
    throw new LocalHookProtocolError('INVALID_JSON', 'Hook input JSON parsing failed: ' + err.message);
  }
}

function parseLocalHookInput(raw, expectedEvent) {
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Buffer.isBuffer(raw)) {
    text = raw.toString('utf8');
  } else if (raw instanceof Uint8Array) {
    text = Buffer.from(raw).toString('utf8');
  }

  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > MAX_STDIN_BYTES) {
    throw new LocalHookProtocolError('PAYLOAD_OVERSIZED', 'Hook stdin exceeds 1 MiB limit (' + byteLength + ' bytes)');
  }

  const parsed = parseJsonWithoutDuplicates(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LocalHookProtocolError('MALFORMED_PAYLOAD', 'Hook input root must be a JSON object');
  }

  const eventName = parsed.hook_event_name;
  if (typeof eventName !== 'string' || !eventName) {
    throw new LocalHookProtocolError('MISSING_EVENT_NAME', 'hook_event_name is required');
  }

  if (!VSCODE_LOCAL_HOOK_EVENTS.includes(eventName)) {
    throw new LocalHookProtocolError(
      'UNSUPPORTED_EVENT',
      'Unsupported hook event "' + eventName + '". Expected one of: ' + VSCODE_LOCAL_HOOK_EVENTS.join(', ')
    );
  }

  if (expectedEvent && eventName !== expectedEvent) {
    throw new LocalHookProtocolError(
      'EVENT_MISMATCH',
      'Registered event "' + expectedEvent + '" does not match payload event "' + eventName + '"'
    );
  }

  if (parsed.cwd !== undefined && typeof parsed.cwd !== 'string') {
    throw new LocalHookProtocolError('INVALID_CWD', 'cwd must be a string if provided');
  }

  if (eventName === 'UserPromptSubmit') {
    if (typeof parsed.prompt !== 'string') {
      throw new LocalHookProtocolError('INVALID_PROMPT', 'prompt string is required for UserPromptSubmit');
    }
  } else if (eventName === 'PreToolUse') {
    if (typeof parsed.tool_name !== 'string' || !parsed.tool_name) {
      throw new LocalHookProtocolError('INVALID_TOOL_NAME', 'tool_name string is required for PreToolUse');
    }
    if (!parsed.tool_input || typeof parsed.tool_input !== 'object' || Array.isArray(parsed.tool_input)) {
      throw new LocalHookProtocolError('INVALID_TOOL_INPUT', 'tool_input object is required for PreToolUse');
    }
  } else if (eventName === 'PostToolUse') {
    if (typeof parsed.tool_name !== 'string' || !parsed.tool_name) {
      throw new LocalHookProtocolError('INVALID_TOOL_NAME', 'tool_name string is required for PostToolUse');
    }
    if (!parsed.tool_input || typeof parsed.tool_input !== 'object' || Array.isArray(parsed.tool_input)) {
      throw new LocalHookProtocolError('INVALID_TOOL_INPUT', 'tool_input object is required for PostToolUse');
    }
    if (!('tool_response' in parsed)) {
      throw new LocalHookProtocolError('INVALID_TOOL_RESPONSE', 'tool_response field is required for PostToolUse');
    }
  } else if (eventName === 'PreCompact') {
    if (typeof parsed.trigger !== 'string' || !parsed.trigger) {
      throw new LocalHookProtocolError('INVALID_PRE_COMPACT', 'trigger string is required for PreCompact');
    }
  } else if (eventName === 'SubagentStart') {
    if (typeof parsed.agent_id !== 'string' || !parsed.agent_id) {
      throw new LocalHookProtocolError('INVALID_AGENT_ID', 'agent_id is required for SubagentStart');
    }
    if (typeof parsed.agent_type !== 'string' || !parsed.agent_type) {
      throw new LocalHookProtocolError('INVALID_AGENT_TYPE', 'agent_type is required for SubagentStart');
    }
  } else if (eventName === 'SubagentStop') {
    if (typeof parsed.agent_id !== 'string' || !parsed.agent_id) {
      throw new LocalHookProtocolError('INVALID_AGENT_ID', 'agent_id is required for SubagentStop');
    }
    if (typeof parsed.agent_type !== 'string' || !parsed.agent_type) {
      throw new LocalHookProtocolError('INVALID_AGENT_TYPE', 'agent_type is required for SubagentStop');
    }
    if (parsed.stop_hook_active !== undefined && typeof parsed.stop_hook_active !== 'boolean') {
      throw new LocalHookProtocolError('INVALID_STOP_HOOK_ACTIVE', 'stop_hook_active must be a boolean if provided');
    }
  } else if (eventName === 'Stop') {
    if (parsed.stop_hook_active !== undefined && typeof parsed.stop_hook_active !== 'boolean') {
      throw new LocalHookProtocolError('INVALID_STOP_HOOK_ACTIVE', 'stop_hook_active must be a boolean if provided');
    }
  }

  return parsed;
}

function serializeLocalHookResult(event, output) {
  const normalized = {
    continue: output.continue !== undefined ? Boolean(output.continue) : true
  };

  if (output.systemMessage) {
    normalized.systemMessage = String(output.systemMessage);
  }

  if (event === 'PreToolUse') {
    const hookSpecific = {
      hookEventName: 'PreToolUse'
    };
    const decision = (output.hookSpecificOutput && output.hookSpecificOutput.permissionDecision) || output.permissionDecision;
    if (decision) hookSpecific.permissionDecision = decision;
    const reason = (output.hookSpecificOutput && (output.hookSpecificOutput.permissionDecisionReason || output.hookSpecificOutput.reason))
      || output.permissionDecisionReason
      || output.reason;
    if (reason) hookSpecific.permissionDecisionReason = String(reason);
    const updated = (output.hookSpecificOutput && output.hookSpecificOutput.updatedInput) || output.updatedInput;
    if (updated && typeof updated === 'object') hookSpecific.updatedInput = updated;
    const context = (output.hookSpecificOutput && output.hookSpecificOutput.additionalContext) || output.additionalContext;
    if (context) hookSpecific.additionalContext = String(context);
    if (Object.keys(hookSpecific).length > 1 || output.hookSpecificOutput) {
      normalized.hookSpecificOutput = hookSpecific;
    }
  } else if (event === 'SessionStart') {
    if (output.hookSpecificOutput && typeof output.hookSpecificOutput === 'object') {
      normalized.hookSpecificOutput = output.hookSpecificOutput;
    }
  } else if (event === 'PostToolUse') {
    if (output.decision) normalized.decision = output.decision;
    if (output.reason) normalized.reason = output.reason;
    if (output.additionalContext) normalized.additionalContext = output.additionalContext;
    if (output.hookSpecificOutput) normalized.hookSpecificOutput = output.hookSpecificOutput;
  } else if (event === 'SubagentStart') {
    if (output.hookSpecificOutput) normalized.hookSpecificOutput = output.hookSpecificOutput;
  } else if (event === 'SubagentStop') {
    if (output.decision) normalized.decision = output.decision;
    if (output.reason) normalized.reason = output.reason;
  } else if (event === 'Stop') {
    if (output.hookSpecificOutput) normalized.hookSpecificOutput = output.hookSpecificOutput;
  }

  const json = JSON.stringify(normalized) + '\\n';
  const byteLength = Buffer.byteLength(json, 'utf8');
  if (byteLength > MAX_OUTPUT_BYTES) {
    throw new LocalHookProtocolError('OUTPUT_OVERSIZED', 'Hook output exceeds 64 KiB limit (' + byteLength + ' bytes)');
  }

  return { stdout: json, stderr: '', exitCode: 0 };
}

function sanitizeDiagnostic(message) {
  return message
    .replace(/(ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{16,}/g, '[REDACTED_SECRET]')
    .replace(/bearer\\s+[A-Za-z0-9\\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/([A-Za-z]:)?[\\\\/](Users|home)[\\\\/][^\\\\/\\s]+/g, '~')
    .trim();
}

function serializeLocalHookError(err) {
  let message;
  let exitCode = 2;

  if (err instanceof LocalHookProtocolError) {
    message = '[evcrate-local-hook] ' + err.code + ': ' + err.message;
    exitCode = err.exitCode;
  } else if (err instanceof Error) {
    message = '[evcrate-local-hook] INTERNAL_ERROR: ' + err.message;
  } else {
    message = '[evcrate-local-hook] UNKNOWN_ERROR: ' + String(err);
  }

  const sanitized = sanitizeDiagnostic(message) + '\\n';
  return { stdout: '', stderr: sanitized, exitCode };
}

module.exports = {
  MAX_STDIN_BYTES,
  MAX_OUTPUT_BYTES,
  VSCODE_LOCAL_HOOK_EVENTS,
  LocalHookProtocolError,
  parseLocalHookInput,
  serializeLocalHookResult,
  serializeLocalHookError,
  sanitizeDiagnostic
};
`;

export const LOCAL_TOOL_INPUTS_SOURCE = `'use strict';

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

const BARE_PRIVACY_REGEX = /credentials|id_rsa|id_ed25519|secrets?\\.ya?ml|\\.env/i;

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
  const tokens = withoutQuotes.split(/\\s+/).filter(Boolean);

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
      token.includes('\\\\') ||
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
      let norm = op.trim().replace(/\\\\/g, '/');
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
      const patchTargets = toolInput.patch.match(/--- [ab]\\/(.+)|=== (.+)/g) || [];
      for (const t of patchTargets) {
        const cleanTarget = t.replace(/^(--- [ab]\\/|=== )/, '').trim();
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
`;

export const LOCAL_POLICY_SOURCE = `'use strict';

const DEFAULT_SCOUT_PATTERNS = [
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '.nuxt/',
  '__pycache__/',
  '.venv/',
  'venv/',
  'vendor/',
  'target/',
  '.git/',
  'coverage/'
];

const SAFE_PATTERNS = [
  /\\.example$/i,
  /\\.sample$/i,
  /\\.template$/i
];

const PRIVACY_PATTERNS = [
  /^\\.env$/,
  /^\\.env\\./,
  /\\.env$/,
  /\\/\\.env\\./,
  /credentials/i,
  /secrets?\\.ya?ml$/i,
  /\\.pem$/,
  /\\.key$/,
  /id_rsa/,
  /id_ed25519/
];

const BUILD_COMMAND_PATTERN = /^(npm|pnpm|yarn|bun)\\s+([^\\s]+\\s+)*(run\\s+)?(build|test|lint|dev|start|install|ci|add|remove|update|publish|pack|init|create|exec)\\b/;
const TOOL_COMMAND_PATTERN = /^(\\.\\/)?(npx|pnpx|bunx|tsc|esbuild|vite|webpack|rollup|turbo|nx|jest|vitest|mocha|eslint|prettier|go|cargo|make|mvn|mvnw|gradle|gradlew|dotnet|docker|podman|kubectl|helm|terraform|ansible|bazel|cmake|sbt|flutter|swift|ant|ninja|meson)\\b/;
const NODE_BUILD_SCRIPT_PATTERN = /^(node|bun)\\s+([^\\s]+\\s+)*((\\S*\\/)?build\\.(js|cjs|mjs|ts))\\b/;
const PYTHON_BUILD_PATTERN = /^((\\S*\\/)?(python\\d*(\\.\\d+)?|py))\\s+(-m\\s+build|setup\\.py\\s+build)\\b/;
const DENO_BUILD_PATTERN = /^deno\\s+task\\s+build\\b/;
const ZIG_BUILD_PATTERN = /^zig\\s+build\\b/;

const BROAD_PATTERN_REGEXES = [
  /^\\*\\*$/,
  /^\\*$/,
  /^\\*\\*\\/\\*$/,
  /^\\*\\*\\/\\.\\*$/,
  /^\\*\\*\\/\\*\\.\\w+$/,
  /^\\*\\*\\/\\*\\.\\{[^}]+\\}$/,
  /^\\*\\*\\/[\\w-]+\\.\\w+$/,
  /^\\*\\.\\w+$/,
  /^\\*\\.\\{[^}]+\\}$/
];

function isBuildCommand(command) {
  const cleaned = (command || '').trim();
  if (!cleaned) return false;
  return (
    BUILD_COMMAND_PATTERN.test(cleaned) ||
    TOOL_COMMAND_PATTERN.test(cleaned) ||
    NODE_BUILD_SCRIPT_PATTERN.test(cleaned) ||
    PYTHON_BUILD_PATTERN.test(cleaned) ||
    DENO_BUILD_PATTERN.test(cleaned) ||
    ZIG_BUILD_PATTERN.test(cleaned)
  );
}

function isBroadPattern(pattern) {
  const trimmed = (pattern || '').trim();
  if (!trimmed) return false;
  for (const regex of BROAD_PATTERN_REGEXES) {
    if (regex.test(trimmed)) return true;
  }
  return false;
}

function isPrivacySensitive(testPath) {
  if (!testPath) return false;
  const cleanPath = testPath.startsWith('APPROVED:') ? testPath.slice('APPROVED:'.length) : testPath;
  let normalized = cleanPath.replace(/\\\\/g, '/');

  try {
    normalized = decodeURIComponent(normalized);
  } catch {}

  const lastSlash = normalized.lastIndexOf('/');
  const basename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;

  for (const safe of SAFE_PATTERNS) {
    if (safe.test(basename)) return false;
  }

  for (const pattern of PRIVACY_PATTERNS) {
    if (pattern.test(basename) || pattern.test(normalized)) return true;
  }

  return false;
}

function compileScoutPatterns(patterns) {
  const compiled = [];
  for (const p of patterns) {
    const trimmed = (p || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const isNegated = trimmed.startsWith('!');
    const raw = isNegated ? trimmed.slice(1).trim() : trimmed;
    const isDirOnly = raw.endsWith('/');
    const cleanRaw = isDirOnly ? raw.slice(0, -1) : raw;
    compiled.push({
      negated: isNegated,
      dirOnly: isDirOnly,
      raw: trimmed,
      normalized: cleanRaw.replace(/\\\\/g, '/')
    });
  }
  return compiled;
}

function matchesScoutPattern(testPath, compiledPatterns) {
  let normalized = (testPath || '').trim().replace(/\\\\/g, '/');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {}
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  const segments = normalized.split('/').filter(Boolean);

  let blocked = false;
  let matchingPattern = undefined;

  for (const pat of compiledPatterns) {
    let matches = false;

    if (pat.dirOnly) {
      const target = pat.normalized;
      if (segments.includes(target) || normalized === target || normalized.startsWith(target + '/')) {
        matches = true;
      }
    } else {
      const target = pat.normalized;
      if (target.indexOf('*') !== -1) {
        const parts = target.split('*');
        let reg = '^';
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) reg += '.*';
          reg += parts[i].replace(/[.+^$\\[\\](){}|\\\\]/g, '\\\\$&');
        }
        reg += '$';
        if (new RegExp(reg).test(normalized)) {
          matches = true;
        }
      } else {
        if (normalized === target || segments.includes(target)) {
          matches = true;
        }
      }
    }

    if (matches) {
      if (pat.negated) {
        blocked = false;
        matchingPattern = undefined;
      } else {
        blocked = true;
        matchingPattern = pat.raw;
      }
    }
  }

  return { blocked, pattern: matchingPattern };
}

function evaluateLocalPolicies(operation, config = {}) {
  if (operation.kind === 'unqualified') {
    return {
      decision: 'deny',
      reason: 'PreToolUse security policy denied unqualified tool "' + operation.toolName + '": ' + operation.reason,
      warnings: []
    };
  }

  const rawPatterns = config.patterns && config.patterns.length > 0 ? config.patterns : DEFAULT_SCOUT_PATTERNS;
  const compiledScout = compileScoutPatterns(rawPatterns);
  const warnings = [];

  const isTerminalBuild = operation.kind === 'terminal' && operation.command && isBuildCommand(operation.command);

  if (!isTerminalBuild) {
    for (const operand of operation.operands) {
      const scoutCheck = matchesScoutPattern(operand, compiledScout);
      if (scoutCheck.blocked) {
        return {
          decision: 'deny',
          reason: 'Scout policy blocked access to directory operand "' + operand + '" matching .evcrateignore pattern "' + scoutCheck.pattern + '"',
          warnings: []
        };
      }
    }
  }

  if (operation.kind === 'search' && operation.pattern && isBroadPattern(operation.pattern)) {
    const isRootSearch = operation.operands.length === 0 || operation.operands.every(
      (op) => op === '.' || op === './' || op === '' || op === '/'
    );
    if (isRootSearch) {
      return {
        decision: 'deny',
        reason: 'Scout policy blocked overly broad search pattern "' + operation.pattern + '" at project root. Narrow the search folder or specify a more targeted query.',
        warnings: []
      };
    }
  }

  if (config.privacyEnabled !== false) {
    for (const operand of operation.operands) {
      if (isPrivacySensitive(operand)) {
        if (operation.kind === 'read' || operation.kind === 'edit') {
          return {
            decision: 'ask',
            reason: 'Access to privacy-sensitive file "' + operand + '" requires explicit user confirmation.',
            warnings: []
          };
        } else if (operation.kind === 'terminal') {
          const warnMsg = 'Warning: Terminal command references privacy-sensitive path "' + operand + '". Note: File read access is not blocked in shell environment.';
          if (!warnings.includes(warnMsg)) {
            warnings.push(warnMsg);
          }
        }
      }
    }
  }

  return {
    decision: 'none',
    warnings,
    systemMessage: warnings.length > 0 ? warnings.join('\\n') : undefined
  };
}

module.exports = {
  DEFAULT_SCOUT_PATTERNS,
  isBuildCommand,
  isBroadPattern,
  isPrivacySensitive,
  compileScoutPatterns,
  matchesScoutPattern,
  evaluateLocalPolicies
};
`;

export const LOCAL_HOOK_BRIDGE_SOURCE = `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseLocalHookInput,
  serializeLocalHookResult,
  serializeLocalHookError
} = require('./local-hook-protocol.cjs');
const { normalizeLocalTool } = require('./local-tool-inputs.cjs');
const { evaluateLocalPolicies, DEFAULT_SCOUT_PATTERNS } = require('./local-policy.cjs');
const { resolveInstallationRoots } = require('./local-session-context.cjs');
const {
  buildSessionStartContext,
  buildSubagentStartContext,
  buildPromptReminder,
  recordPreCompact,
  buildModularizationContext
} = require('./local-lifecycle.cjs');

function loadIgnorePatterns() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.evcrateignore'),
    path.resolve(__dirname, '..', '.evcrateignore'),
    path.resolve(process.cwd(), '.evcrateignore')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        const text = fs.readFileSync(c, 'utf8');
        const lines = text.split('\\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        if (lines.length > 0) return lines;
      }
    } catch {}
  }
  return [...DEFAULT_SCOUT_PATTERNS];
}

function runBridge(expectedEvent, stdinBytes) {
  const payload = parseLocalHookInput(stdinBytes, expectedEvent);
  const eventName = payload.hook_event_name;
  let output = { continue: true };

  let roots = null;
  try {
    roots = resolveInstallationRoots(__filename);
  } catch {}

  switch (eventName) {
    case 'PreToolUse': {
      const toolOp = normalizeLocalTool(
        payload.tool_name,
        payload.tool_input,
        payload.tool_use_id,
        payload.cwd
      );
      const patterns = loadIgnorePatterns();
      const policyResult = evaluateLocalPolicies(toolOp, { patterns });

      if (policyResult.decision === 'deny') {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: policyResult.reason
          },
          systemMessage: policyResult.reason
        };
      } else if (policyResult.decision === 'ask') {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: policyResult.reason
          },
          systemMessage: policyResult.reason
        };
      } else {
        output = {
          continue: true,
          ...(policyResult.systemMessage ? { systemMessage: policyResult.systemMessage } : {})
        };
      }
      break;
    }

    case 'PostToolUse': {
      if (roots) {
        const modResult = buildModularizationContext(payload, roots);
        output = {
          continue: true,
          ...(modResult.systemMessage ? { systemMessage: modResult.systemMessage } : {})
        };
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'SessionStart': {
      if (roots) {
        output = buildSessionStartContext(payload, roots);
      } else {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: 'EVCrate Local qualification context active.'
          }
        };
      }
      break;
    }

    case 'UserPromptSubmit': {
      if (roots) {
        output = buildPromptReminder(payload, roots);
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'PreCompact': {
      if (roots) {
        output = recordPreCompact(payload, roots);
      } else {
        output = { continue: true };
      }
      break;
    }

    case 'SubagentStart': {
      if (roots) {
        output = buildSubagentStartContext(payload, roots);
      } else {
        output = {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SubagentStart',
            additionalContext: 'EVCrate subagent context active.'
          }
        };
      }
      break;
    }

    case 'SubagentStop':
    case 'Stop': {
      output = { continue: true };
      break;
    }
  }

  return serializeLocalHookResult(eventName, output);
}

function main() {
  const expectedEvent = process.argv[2];
  let inputBuffer = Buffer.alloc(0);

  try {
    inputBuffer = fs.readFileSync(0);
  } catch (readErr) {
    const errResult = serializeLocalHookError(readErr);
    process.stderr.write(errResult.stderr);
    process.exit(errResult.exitCode);
  }

  try {
    const result = runBridge(expectedEvent, inputBuffer);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  } catch (err) {
    const errResult = serializeLocalHookError(err);
    if (errResult.stdout) process.stdout.write(errResult.stdout);
    if (errResult.stderr) process.stderr.write(errResult.stderr);
    process.exit(errResult.exitCode);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runBridge,
  loadIgnorePatterns
};
`;
