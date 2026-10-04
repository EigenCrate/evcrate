export type SettingDisposition = 'mapped' | 'manual' | 'unsupported' | 'inactive';

export interface VscodeSettingDispositionEntry {
  readonly key: string;
  readonly disposition: SettingDisposition;
  readonly reason: string;
  readonly nativeEquivalent: string | null;
}

export interface VscodeSettingsDisposition {
  readonly schema: 'evcrate-vscode-settings-disposition-v1';
  readonly source: string;
  readonly keys: Readonly<Record<string, VscodeSettingDispositionEntry>>;
}

export const CANONICAL_SETTINGS_DISPOSITION_RULES: Readonly<Record<string, {
  readonly disposition: SettingDisposition;
  readonly reason: string;
  readonly nativeEquivalent: string | null;
}>> = Object.freeze({
  hooks: Object.freeze({
    disposition: 'mapped',
    reason: 'Mapped to Agent Plugins 1.0 hooks in com.github.copilot/hooks/hooks.json via local-hook-bridge.cjs.',
    nativeEquivalent: 'com.github.copilot/hooks/hooks.json'
  }),
  includeCoAuthoredBy: Object.freeze({
    disposition: 'unsupported',
    reason: 'Claude-specific Git co-author attribution trailer has no native VS Code setting.',
    nativeEquivalent: null
  }),
  statusLine: Object.freeze({
    disposition: 'unsupported',
    reason: 'Claude shell command statusline has no native VS Code statusline or token telemetry setting; runtime telemetry is not promised.',
    nativeEquivalent: null
  }),
  effortLevel: Object.freeze({
    disposition: 'unsupported',
    reason: 'Claude CLI effortLevel has no native VS Code setting; coding-level preferences are governed via .evcrate.json context.',
    nativeEquivalent: null
  }),
  env: Object.freeze({
    disposition: 'inactive',
    reason: 'Claude CLI environment variables (CLAUDE_CODE_*) are Claude-specific runtime flags without native VS Code extension host equivalents.',
    nativeEquivalent: null
  }),
  'settings.local.json': Object.freeze({
    disposition: 'inactive',
    reason: 'Local permission overrides are not imported into VS Code; Workspace Trust and PreToolUse confirmations govern permissions.',
    nativeEquivalent: null
  })
});

export const PINNED_REVIEWED_MCP_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  'context7': '@upstash/context7-mcp@0.1.18',
  'chrome-devtools': 'chrome-devtools-mcp@0.1.0',
  'sequential-thinking': '@modelcontextprotocol/server-sequential-thinking@0.1.0'
});
