export function validateLocalConfiguration(options: {
  readonly settings?: Record<string, unknown>;
  readonly mcp?: Record<string, unknown>;
  readonly models?: Record<string, string>;
}): { readonly valid: boolean; readonly errors: readonly string[] } {
  const errors: string[] = [];

  // 1. Check settings for forbidden automatic bypasses or auto-approval
  if (options.settings) {
    if (options.settings['chat.tools.autoApprove'] === true) {
      errors.push('chat.tools.autoApprove must not be enabled automatically.');
    }
    if (options.settings['security.workspace.trust.enabled'] === false) {
      errors.push('Workspace Trust must not be disabled.');
    }
  }

  // 2. Check MCP configuration for plaintext secrets or credential-bearing argv
  if (options.mcp) {
    const raw = JSON.stringify(options.mcp);
    if (raw.includes('YOUR_API_KEY')) {
      errors.push('MCP configuration contains placeholder YOUR_API_KEY; use input variable instead.');
    }
    if (/\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,})\b/u.test(raw)) {
      errors.push('MCP configuration contains potential raw API credentials.');
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}
