export function contextBridge(event: string, sourceHook: string, guidance = ''): string {
  const guidanceCode = guidance ? `const guidancePath = path.join(__dirname, ${JSON.stringify(guidance)});\nfunction readGuidance() { try { return fs.readFileSync(guidancePath, 'utf8').trim(); } catch { return ''; } }\n` : '';
  const guidanceOutput = guidance ? `, readGuidance()` : '';
  return `#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
${guidanceCode}
function safeFile(candidate) {
  try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; }
}
function resolveHook() {
  const starts = [process.env.CODEX_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      const candidate = path.join(current, ${JSON.stringify(sourceHook)});
      if (safeFile(candidate) && path.resolve(candidate) !== path.resolve(path.join(os.homedir(), ${JSON.stringify(sourceHook)}))) return { projectDir: current, sourceHook: candidate };
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: path.join(process.cwd(), ${JSON.stringify(sourceHook)}) };
}
const { projectDir, sourceHook } = resolveHook();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({})); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
const additionalContext = [(result.stdout || '').trim()${guidanceOutput}].filter(Boolean).join('\\n\\n');
process.stdout.write(additionalContext ? JSON.stringify({ hookSpecificOutput: { hookEventName: ${JSON.stringify(event)}, additionalContext } }) : JSON.stringify({}));
`;
}

export function pretoolBridge(sourceHook: string): string {
  return `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const input = fs.readFileSync(0, 'utf-8');
function safeFile(candidate) { try { const stat = fs.lstatSync(candidate); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; } }
function resolveHook() {
  const starts = [process.env.CODEX_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let current = path.resolve(start);
    while (true) {
      const candidate = path.join(current, ${JSON.stringify(sourceHook)});
      if (safeFile(candidate)) return { projectDir: current, sourceHook: candidate };
      const parent = path.dirname(current); if (parent === current) break; current = parent;
    }
  }
  return { projectDir: process.env.CODEX_PROJECT_DIR || process.cwd(), sourceHook: path.join(process.cwd(), ${JSON.stringify(sourceHook)}) };
}
const { projectDir, sourceHook } = resolveHook();
if (!safeFile(sourceHook)) { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'EVCREATE_HOOK_UNAVAILABLE' } })); process.exit(0); }
const result = spawnSync(process.execPath, [sourceHook], { cwd: projectDir, input, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CODEX_PROJECT_DIR: projectDir, EVCRATE_CONFIG_DIR: '.codex' } });
if (result.status === 0 && !result.error) process.stdout.write(JSON.stringify({}));
else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: (result.stderr || result.stdout || '').trim() || (result.error ? result.error.message : '') || 'Blocked by migrated Claude hook.' } }));
`;
}

export function permissionHook(): string {
  return `#!/usr/bin/env node
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
const command = String(input.tool_input?.command || '');
const dangerous = /(\\brm\\s+-rf\\b|\\bgit\\s+reset\\s+--hard\\b|\\bmkfs\\b|\\bdd\\s+if=\\/dev\\/zero\\b|:\\s*>\\s*[^\\s]+)/i;
if (!dangerous.test(command)) process.stdout.write(JSON.stringify({}));
else process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Destructive shell command requires an explicit user-directed workflow review.' } } }));
`;
}

export function runNodeHook(): string {
  return `#!/usr/bin/env sh
set -eu
script_path="\${1:?missing hook script path}"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime_env="\${CODEX_RUNTIME_ENV:-$script_dir/../runtime.env}"
if [ -r "$runtime_env" ]; then . "$runtime_env"; fi
resolve_executable() { for candidate in "$@"; do [ -n "$candidate" ] || continue; if [ -x "$candidate" ]; then printf '%s\\n' "$candidate"; return 0; fi; if command -v "$candidate" >/dev/null 2>&1; then command -v "$candidate"; return 0; fi; done; return 1; }
if node_bin="$(resolve_executable "\${CODEX_NODE_BIN:-}" node nodejs /usr/local/bin/node /usr/bin/node "$HOME/.volta/bin/node" "$HOME/.local/bin/node")"; then "$node_bin" "$script_path"; else printf '{}'; fi
`;
}

export function runMcpPackage(): string {
  return `#!/usr/bin/env sh
set -eu
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
runtime_env="\${CODEX_RUNTIME_ENV:-$script_dir/../runtime.env}"
if [ -r "$runtime_env" ]; then . "$runtime_env"; fi
resolve_executable() { for candidate in "$@"; do [ -n "$candidate" ] || continue; if [ -x "$candidate" ]; then printf '%s\\n' "$candidate"; return 0; fi; if command -v "$candidate" >/dev/null 2>&1; then command -v "$candidate"; return 0; fi; done; return 1; }
while [ "$#" -gt 0 ]; do case "$1" in -y|--yes) shift;; --) shift; break;; *) break;; esac; done
package="\${1:-}"; if [ -z "$package" ]; then echo "Missing MCP package spec." >&2; exit 64; fi; shift
if launcher="$(resolve_executable "\${CODEX_NPX_BIN:-}" npx)"; then exec "$launcher" -y "$package" "$@"; fi
if launcher="$(resolve_executable "\${CODEX_PNPM_BIN:-}" pnpm)"; then exec "$launcher" dlx "$package" "$@"; fi
if launcher="$(resolve_executable "\${CODEX_BUNX_BIN:-}" bunx)"; then exec "$launcher" "$package" "$@"; fi
if launcher="$(resolve_executable "\${CODEX_YARN_BIN:-}" yarn)"; then exec "$launcher" dlx "$package" "$@"; fi
if launcher="$(resolve_executable "\${CODEX_COREPACK_BIN:-}" corepack)"; then exec "$launcher" pnpm dlx "$package" "$@"; fi
echo "No supported package runner found for MCP package: $package" >&2; exit 127
`;
}

export function hooksJson(): string {
  const payload = { hooks: {
    SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/session-start.cjs' }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/user-prompt-submit.cjs' }] }],
    PreToolUse: [{ matcher: 'Bash|Read|Edit|Write|apply_patch|mcp__.*|run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file', hooks: [
      { type: 'command', command: 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/pretool-scout-block.cjs' },
      { type: 'command', command: 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/pretool-privacy-block.cjs' },
    ] }],
    PermissionRequest: [{ matcher: 'Bash|run_command', hooks: [{ type: 'command', command: 'sh "$CODEX_PROJECT_DIR"/.codex/hooks/run-node-hook.sh "$CODEX_PROJECT_DIR"/.codex/hooks/permission-request.cjs' }] }],
  } };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
