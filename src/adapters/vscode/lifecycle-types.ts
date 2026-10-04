import type { VscodeSessionStateRecord } from './session-state-types.js';

export interface LifecycleOptions {
  readonly explicitProjectRoot?: string;
  readonly qualifiedWorkspaceContract?: boolean;
  readonly tmpDir?: string;
  readonly now?: number;
}

export interface SessionStartPayload {
  readonly hook_event_name: 'SessionStart';
  readonly source?: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly transcript_path?: string;
  readonly timestamp?: number;
}

export interface SubagentStartPayload {
  readonly hook_event_name: 'SubagentStart';
  readonly agent_id: string;
  readonly agent_type: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly timestamp?: number;
}

export interface UserPromptSubmitPayload {
  readonly hook_event_name: 'UserPromptSubmit';
  readonly prompt: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly timestamp?: number;
}

export interface PreCompactPayload {
  readonly hook_event_name: 'PreCompact';
  readonly trigger?: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly timestamp?: number;
}

export interface PostToolUsePayload {
  readonly hook_event_name: 'PostToolUse';
  readonly tool_name: string;
  readonly tool_input: Record<string, unknown>;
  readonly tool_response?: unknown;
  readonly tool_use_id?: string;
  readonly session_id?: string;
  readonly cwd?: string;
  readonly timestamp?: number;
}

export interface SessionStartResult {
  readonly continue: true;
  readonly hookSpecificOutput: {
    readonly hookEventName: 'SessionStart';
    readonly additionalContext: string;
  };
  readonly handle: string | null;
  readonly state: VscodeSessionStateRecord | null;
}

export interface SubagentStartResult {
  readonly continue: true;
  readonly hookSpecificOutput: {
    readonly hookEventName: 'SubagentStart';
    readonly additionalContext: string;
  };
}

export interface PromptReminderResult {
  readonly continue: true;
  readonly systemMessage?: string;
}

export interface PreCompactResult {
  readonly continue: true;
  readonly systemMessage?: string;
}

export interface ModularizationResult {
  readonly continue: true;
  readonly systemMessage?: string;
  readonly warnings?: readonly string[];
}
