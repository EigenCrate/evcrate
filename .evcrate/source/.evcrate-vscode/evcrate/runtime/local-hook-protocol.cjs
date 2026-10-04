'use strict';

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
    while (offset < text.length && (text[offset] === ' ' || text[offset] === '\t' || text[offset] === '\n' || text[offset] === '\r')) offset++;
  }
  function string() {
    offset++;
    let str = '';
    while (offset < text.length) {
      const c = text[offset++];
      if (c === '"') return str;
      if (c === '\\') {
        if (offset >= text.length) throw new SyntaxError('Unterminated string escape');
        const esc = text[offset++];
        if (esc === '"' || esc === '\\' || esc === '/') str += esc;
        else if (esc === 'b') str += '\b';
        else if (esc === 'f') str += '\f';
        else if (esc === 'n') str += '\n';
        else if (esc === 'r') str += '\r';
        else if (esc === 't') str += '\t';
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

  const json = JSON.stringify(normalized) + '\n';
  const byteLength = Buffer.byteLength(json, 'utf8');
  if (byteLength > MAX_OUTPUT_BYTES) {
    throw new LocalHookProtocolError('OUTPUT_OVERSIZED', 'Hook output exceeds 64 KiB limit (' + byteLength + ' bytes)');
  }

  return { stdout: json, stderr: '', exitCode: 0 };
}

function sanitizeDiagnostic(message) {
  return message
    .replace(/(ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{16,}/g, '[REDACTED_SECRET]')
    .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/([A-Za-z]:)?[\\/](Users|home)[\\/][^\\/\s]+/g, '~')
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

  const sanitized = sanitizeDiagnostic(message) + '\n';
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
