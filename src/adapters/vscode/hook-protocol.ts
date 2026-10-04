import { parseJsonDocument, decodeUtf8, isPlainObject } from '../../protocol/json.js';

export const VSCODE_LOCAL_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'SubagentStart',
  'SubagentStop',
  'Stop'
] as const;

export type VscodeLocalHookEvent = typeof VSCODE_LOCAL_HOOK_EVENTS[number];

export const MAX_STDIN_BYTES = 1024 * 1024; // 1 MiB
export const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB
export const MAX_CONTEXT_CHARS = 16 * 1024; // 16 KiB / 16,384 characters

export class LocalHookProtocolError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = 2) {
    super(message);
    this.name = 'LocalHookProtocolError';
    this.code = code;
    this.exitCode = exitCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface BaseHookInput {
  hook_event_name: VscodeLocalHookEvent;
  session_id?: string;
  timestamp?: number;
  cwd?: string;
}

export interface SessionStartInput extends BaseHookInput {
  hook_event_name: 'SessionStart';
  source?: 'new' | string;
  transcript_path?: string;
}

export interface UserPromptSubmitInput extends BaseHookInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface PreToolUseInput extends BaseHookInput {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
}

export interface PostToolUseInput extends BaseHookInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: unknown;
  tool_use_id?: string;
}

export interface PreCompactInput extends BaseHookInput {
  hook_event_name: 'PreCompact';
  trigger: string;
}

export interface SubagentStartInput extends BaseHookInput {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type: string;
}

export interface SubagentStopInput extends BaseHookInput {
  hook_event_name: 'SubagentStop';
  agent_id: string;
  agent_type: string;
  stop_hook_active?: boolean;
}

export interface StopInput extends BaseHookInput {
  hook_event_name: 'Stop';
  stop_hook_active?: boolean;
}

export type LocalHookInput =
  | SessionStartInput
  | UserPromptSubmitInput
  | PreToolUseInput
  | PostToolUseInput
  | PreCompactInput
  | SubagentStartInput
  | SubagentStopInput
  | StopInput;

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface BaseHookOutput {
  continue?: boolean;
  systemMessage?: string;
}

export interface SessionStartOutput extends BaseHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'SessionStart';
    additionalContext: string;
  };
}

export interface UserPromptSubmitOutput extends BaseHookOutput {}

export interface PreToolUseOutput extends BaseHookOutput {
  permissionDecision?: PermissionDecision;
  permissionDecisionReason?: string;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: PermissionDecision;
    permissionDecisionReason?: string;
    reason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

export interface PostToolUseOutput extends BaseHookOutput {
  decision?: 'block';
  reason?: string;
  additionalContext?: string;
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
  };
}

export interface PreCompactOutput extends BaseHookOutput {}

export interface SubagentStartOutput extends BaseHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'SubagentStart';
    additionalContext?: string;
  };
}

export interface SubagentStopOutput extends BaseHookOutput {
  decision?: 'block';
  reason?: string;
}

export interface StopOutput extends BaseHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'Stop';
    decision?: 'block';
    reason?: string;
  };
}

export type LocalHookOutput =
  | SessionStartOutput
  | UserPromptSubmitOutput
  | PreToolUseOutput
  | PostToolUseOutput
  | PreCompactOutput
  | SubagentStartOutput
  | SubagentStopOutput
  | StopOutput;

export function isLocalHookEvent(value: unknown): value is VscodeLocalHookEvent {
  return typeof value === 'string' && (VSCODE_LOCAL_HOOK_EVENTS as readonly string[]).includes(value);
}

export function parseLocalHookInput(
  raw: string | Uint8Array | ArrayBuffer,
  expectedEvent?: string
): LocalHookInput {
  let parsedValue: unknown;
  try {
    if (typeof raw === 'string') {
      const bytes = new TextEncoder().encode(raw);
      if (bytes.byteLength > MAX_STDIN_BYTES) {
        throw new LocalHookProtocolError('PAYLOAD_OVERSIZED', `Hook stdin exceeds 1 MiB limit (${bytes.byteLength} bytes)`);
      }
      parsedValue = parseJsonDocument(raw, MAX_STDIN_BYTES);
    } else {
      const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      if (u8.byteLength > MAX_STDIN_BYTES) {
        throw new LocalHookProtocolError('PAYLOAD_OVERSIZED', `Hook stdin exceeds 1 MiB limit (${u8.byteLength} bytes)`);
      }
      const text = decodeUtf8(u8, MAX_STDIN_BYTES);
      parsedValue = parseJsonDocument(text, MAX_STDIN_BYTES);
    }
  } catch (err) {
    if (err instanceof LocalHookProtocolError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new LocalHookProtocolError('INVALID_JSON', `Hook input JSON parsing failed: ${msg}`);
  }

  if (!isPlainObject(parsedValue)) {
    throw new LocalHookProtocolError('MALFORMED_PAYLOAD', 'Hook input root must be a JSON object');
  }

  const rawObj = parsedValue as Record<string, unknown>;
  const eventName = rawObj.hook_event_name;

  if (typeof eventName !== 'string' || !eventName) {
    throw new LocalHookProtocolError('MISSING_EVENT_NAME', 'hook_event_name is required');
  }

  if (!isLocalHookEvent(eventName)) {
    throw new LocalHookProtocolError(
      'UNSUPPORTED_EVENT',
      `Unsupported hook event "${eventName}". Expected one of: ${VSCODE_LOCAL_HOOK_EVENTS.join(', ')}`
    );
  }

  if (expectedEvent && eventName !== expectedEvent) {
    throw new LocalHookProtocolError(
      'EVENT_MISMATCH',
      `Registered event "${expectedEvent}" does not match payload event "${eventName}"`
    );
  }

  // Validate timestamps if present
  if (rawObj.timestamp !== undefined && typeof rawObj.timestamp !== 'number') {
    throw new LocalHookProtocolError('INVALID_TIMESTAMP', 'timestamp must be a number');
  }

  // Validate session_id if present
  if (rawObj.session_id !== undefined && (typeof rawObj.session_id !== 'string' || rawObj.session_id.length === 0)) {
    throw new LocalHookProtocolError('INVALID_SESSION_ID', 'session_id must be a non-empty string');
  }

  // Validate cwd if present
  if (rawObj.cwd !== undefined && typeof rawObj.cwd !== 'string') {
    throw new LocalHookProtocolError('INVALID_CWD', 'cwd must be a string if provided');
  }

  // Per-event validations
  switch (eventName) {
    case 'SessionStart': {
      if (rawObj.source !== undefined && typeof rawObj.source !== 'string') {
        throw new LocalHookProtocolError('INVALID_SESSION_START', 'source must be a string if provided');
      }
      return rawObj as unknown as SessionStartInput;
    }

    case 'UserPromptSubmit': {
      if (typeof rawObj.prompt !== 'string') {
        throw new LocalHookProtocolError('INVALID_PROMPT', 'prompt string is required for UserPromptSubmit');
      }
      return rawObj as unknown as UserPromptSubmitInput;
    }

    case 'PreToolUse': {
      if (typeof rawObj.tool_name !== 'string' || !rawObj.tool_name) {
        throw new LocalHookProtocolError('INVALID_TOOL_NAME', 'tool_name string is required for PreToolUse');
      }
      if (!isPlainObject(rawObj.tool_input)) {
        throw new LocalHookProtocolError('INVALID_TOOL_INPUT', 'tool_input object is required for PreToolUse');
      }
      return rawObj as unknown as PreToolUseInput;
    }

    case 'PostToolUse': {
      if (typeof rawObj.tool_name !== 'string' || !rawObj.tool_name) {
        throw new LocalHookProtocolError('INVALID_TOOL_NAME', 'tool_name string is required for PostToolUse');
      }
      if (!isPlainObject(rawObj.tool_input)) {
        throw new LocalHookProtocolError('INVALID_TOOL_INPUT', 'tool_input object is required for PostToolUse');
      }
      if (!('tool_response' in rawObj)) {
        throw new LocalHookProtocolError('INVALID_TOOL_RESPONSE', 'tool_response field is required for PostToolUse');
      }
      return rawObj as unknown as PostToolUseInput;
    }

    case 'PreCompact': {
      if (typeof rawObj.trigger !== 'string' || !rawObj.trigger) {
        throw new LocalHookProtocolError('INVALID_PRE_COMPACT', 'trigger string is required for PreCompact');
      }
      return rawObj as unknown as PreCompactInput;
    }

    case 'SubagentStart': {
      if (typeof rawObj.agent_id !== 'string' || !rawObj.agent_id) {
        throw new LocalHookProtocolError('INVALID_AGENT_ID', 'agent_id is required for SubagentStart');
      }
      if (typeof rawObj.agent_type !== 'string' || !rawObj.agent_type) {
        throw new LocalHookProtocolError('INVALID_AGENT_TYPE', 'agent_type is required for SubagentStart');
      }
      return rawObj as unknown as SubagentStartInput;
    }

    case 'SubagentStop': {
      if (typeof rawObj.agent_id !== 'string' || !rawObj.agent_id) {
        throw new LocalHookProtocolError('INVALID_AGENT_ID', 'agent_id is required for SubagentStop');
      }
      if (typeof rawObj.agent_type !== 'string' || !rawObj.agent_type) {
        throw new LocalHookProtocolError('INVALID_AGENT_TYPE', 'agent_type is required for SubagentStop');
      }
      if (rawObj.stop_hook_active !== undefined && typeof rawObj.stop_hook_active !== 'boolean') {
        throw new LocalHookProtocolError('INVALID_STOP_HOOK_ACTIVE', 'stop_hook_active must be a boolean if provided');
      }
      return rawObj as unknown as SubagentStopInput;
    }

    case 'Stop': {
      if (rawObj.stop_hook_active !== undefined && typeof rawObj.stop_hook_active !== 'boolean') {
        throw new LocalHookProtocolError('INVALID_STOP_HOOK_ACTIVE', 'stop_hook_active must be a boolean if provided');
      }
      return rawObj as unknown as StopInput;
    }

    default: {
      const _exhaustiveCheck: never = eventName;
      throw new LocalHookProtocolError('UNSUPPORTED_EVENT', `Unhandled event: ${_exhaustiveCheck}`);
    }
  }
}

export function serializeLocalHookResult(
  event: VscodeLocalHookEvent,
  output: LocalHookOutput
): { stdout: string; stderr: string; exitCode: number } {
  const normalized: Record<string, unknown> = {
    continue: output.continue ?? true
  };

  if (output.systemMessage) {
    normalized.systemMessage = output.systemMessage;
  }

  // Event-specific validation & normalization
  if (event === 'PreToolUse') {
    const preOutput = output as PreToolUseOutput;
    const hookSpecific: Record<string, unknown> = {
      hookEventName: 'PreToolUse'
    };

    const decision = preOutput.hookSpecificOutput?.permissionDecision ?? preOutput.permissionDecision;
    if (decision !== undefined) {
      if (!['allow', 'deny', 'ask'].includes(decision)) {
        throw new LocalHookProtocolError('INVALID_DECISION', `Invalid permissionDecision: ${decision}`);
      }
      hookSpecific.permissionDecision = decision;
    }

    const reason = preOutput.hookSpecificOutput?.permissionDecisionReason
      ?? preOutput.hookSpecificOutput?.reason
      ?? preOutput.permissionDecisionReason
      ?? preOutput.reason;
    if (reason !== undefined) {
      hookSpecific.permissionDecisionReason = String(reason);
    }

    const updated = preOutput.hookSpecificOutput?.updatedInput ?? preOutput.updatedInput;
    if (updated !== undefined && isPlainObject(updated)) {
      hookSpecific.updatedInput = updated;
    }

    const context = preOutput.hookSpecificOutput?.additionalContext ?? preOutput.additionalContext;
    if (context !== undefined) {
      hookSpecific.additionalContext = String(context);
    }

    if (preOutput.hookSpecificOutput) {
      if (preOutput.hookSpecificOutput.hookEventName !== 'PreToolUse') {
        throw new LocalHookProtocolError('ENVELOPE_EVENT_MISMATCH', 'hookSpecificOutput.hookEventName must be PreToolUse');
      }
    }

    if (Object.keys(hookSpecific).length > 1 || preOutput.hookSpecificOutput) {
      normalized.hookSpecificOutput = hookSpecific;
    }
  } else if (event === 'SessionStart') {
    const startOutput = output as SessionStartOutput;
    if (startOutput.hookSpecificOutput) {
      if (startOutput.hookSpecificOutput.hookEventName !== 'SessionStart') {
        throw new LocalHookProtocolError('ENVELOPE_EVENT_MISMATCH', 'hookSpecificOutput.hookEventName must be SessionStart');
      }
      normalized.hookSpecificOutput = startOutput.hookSpecificOutput;
    }
  } else if (event === 'PostToolUse') {
    const postOutput = output as PostToolUseOutput;
    if (postOutput.decision) {
      if (postOutput.decision !== 'block') {
        throw new LocalHookProtocolError('INVALID_DECISION', `PostToolUse decision must be "block" if set`);
      }
      normalized.decision = postOutput.decision;
    }
    if (postOutput.reason) {
      normalized.reason = postOutput.reason;
    }
    if (postOutput.additionalContext) {
      normalized.additionalContext = postOutput.additionalContext;
    }
    if (postOutput.hookSpecificOutput) {
      if (postOutput.hookSpecificOutput.hookEventName !== 'PostToolUse') {
        throw new LocalHookProtocolError('ENVELOPE_EVENT_MISMATCH', 'hookSpecificOutput.hookEventName must be PostToolUse');
      }
      normalized.hookSpecificOutput = postOutput.hookSpecificOutput;
    }
  } else if (event === 'SubagentStart') {
    const subOutput = output as SubagentStartOutput;
    if (subOutput.hookSpecificOutput) {
      if (subOutput.hookSpecificOutput.hookEventName !== 'SubagentStart') {
        throw new LocalHookProtocolError('ENVELOPE_EVENT_MISMATCH', 'hookSpecificOutput.hookEventName must be SubagentStart');
      }
      normalized.hookSpecificOutput = subOutput.hookSpecificOutput;
    }
  } else if (event === 'SubagentStop') {
    const stopOutput = output as SubagentStopOutput;
    if (stopOutput.decision) {
      if (stopOutput.decision !== 'block') {
        throw new LocalHookProtocolError('INVALID_DECISION', 'SubagentStop decision must be "block" if set');
      }
      normalized.decision = stopOutput.decision;
    }
    if (stopOutput.reason) {
      normalized.reason = stopOutput.reason;
    }
  } else if (event === 'Stop') {
    const stopOutput = output as StopOutput;
    if (stopOutput.hookSpecificOutput) {
      if (stopOutput.hookSpecificOutput.hookEventName !== 'Stop') {
        throw new LocalHookProtocolError('ENVELOPE_EVENT_MISMATCH', 'hookSpecificOutput.hookEventName must be Stop');
      }
      normalized.hookSpecificOutput = stopOutput.hookSpecificOutput;
    }
  }

  const json = JSON.stringify(normalized) + '\n';
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new LocalHookProtocolError('OUTPUT_OVERSIZED', `Hook output exceeds 64 KiB limit (${bytes.byteLength} bytes)`);
  }

  return {
    stdout: json,
    stderr: '',
    exitCode: 0
  };
}

export function sanitizeDiagnostic(message: string): string {
  // Strip potential tokens, secret prefixes, absolute home paths
  return message
    .replace(/(ghp|gho|ghu|github_pat)_[A-Za-z0-9_]{16,}/g, '[REDACTED_SECRET]')
    .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/([A-Za-z]:)?[\\/](Users|home)[\\/][^\\/\s]+/g, '~')
    .trim();
}

export function serializeLocalHookError(err: unknown): { stdout: string; stderr: string; exitCode: number } {
  let message: string;
  let exitCode = 2;

  if (err instanceof LocalHookProtocolError) {
    message = `[evcrate-local-hook] ${err.code}: ${err.message}`;
    exitCode = err.exitCode;
  } else if (err instanceof Error) {
    message = `[evcrate-local-hook] INTERNAL_ERROR: ${err.message}`;
  } else {
    message = `[evcrate-local-hook] UNKNOWN_ERROR: ${String(err)}`;
  }

  const sanitized = sanitizeDiagnostic(message) + '\n';
  const bytes = new TextEncoder().encode(sanitized);
  const truncated = bytes.byteLength > MAX_OUTPUT_BYTES
    ? new TextDecoder('utf-8').decode(bytes.slice(0, MAX_OUTPUT_BYTES - 1)) + '\n'
    : sanitized;

  return {
    stdout: '',
    stderr: truncated,
    exitCode
  };
}
