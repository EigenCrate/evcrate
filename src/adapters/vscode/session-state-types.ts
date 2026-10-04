export interface VscodeCompactRecord {
  readonly sequence: number;
  readonly lastObservedAt: number;
}

export interface VscodeSessionStateRecord {
  readonly version: 1;
  readonly target: 'vscode';
  readonly projectRoot: string;
  readonly projectKey: string;
  readonly sessionKey: string;
  readonly revision: number;
  readonly activePlan: string | null;
  readonly lastSeenAt: number;
  readonly compact: VscodeCompactRecord | null;
}

export type SessionStateErrorCode =
  | 'SESSION_CONTEXT_UNAVAILABLE'
  | 'SESSION_CONTEXT_EXPIRED'
  | 'SESSION_CONTEXT_INVALID'
  | 'SESSION_CONTEXT_PROJECT_MISMATCH'
  | 'SESSION_CONTEXT_REVISION_CONFLICT'
  | 'PLAN_PATH_UNSAFE'
  | 'SESSION_STATE_CAPACITY';

export class SessionStateError extends Error {
  readonly code: SessionStateErrorCode;

  constructor(code: SessionStateErrorCode, message: string) {
    super(`[evcrate-session-state] ${code}: ${message}`);
    this.name = 'SessionStateError';
    this.code = code;
  }
}

export type ReadSessionResult =
  | { readonly status: 'ok'; readonly record: VscodeSessionStateRecord; readonly rawBytes: string }
  | { readonly status: 'error'; readonly code: SessionStateErrorCode; readonly message: string };
