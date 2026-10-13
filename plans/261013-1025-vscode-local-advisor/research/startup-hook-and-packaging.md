# Research: Startup Hook Design and Extension Packaging

## 1. Scope & System Boundaries
- Target: Independent private extension `extensions/vscode-advisor` delivering native LM tool `ask_advisor` to VS Code Copilot Local Agent.
- Scope: Single-folder trusted local workspace MVP. Rejects multi-root, virtual, remote, and untrusted workspaces.
- Non-goals: No background daemon/IPC services, no automatic editor settings mutation, zero dependency on EVCrate companion packager (`scripts/build-vscode-companion.mjs:21-43`) or proposed `chatPromptFiles` API.

## 2. Official Hooks Contract & Citations
- References: [Agent Customization Hooks](https://code.visualstudio.com/docs/agent-customization/hooks), [Hooks Reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference).
- Precedent: `src/adapters/vscode/hooks.ts:28-44` projects Agent Plugin format; standalone workspace hooks use `.github/hooks/*.json`.
- Event: `SessionStart` (PascalCase Local protocol; fires when the first prompt starts a new Local session).
- Output envelope: STDOUT JSON `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<guidance text>" } }`. Empty/skip output: `{}`.
- Execution & Timeout: Spawns external CLI command with configurable timeout (recommend 5s). Detached from Extension Host; zero `vscode` API access. Non-zero exit triggers host error logs; hook runner must handle internal errors and strictly exit code 0.
- Proposed Hook Manifest (`.github/hooks/evc-advisor.json`):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "\"/usr/bin/node\" \"/abs/path/.vscode/advisor/hook.cjs\"",
        "timeout": 5
      }
    ]
  }
}
```

## 3. Comparison: Dedicated Hook File vs Agent Plugin
- Dedicated `.github/hooks/evc-advisor.json` (Recommended): Isolated lifecycle; clean individual file addition/removal; native discovery; avoids mutating shared hook manifests; no collision with companion plugin projections. Does not prevent hook ordering or duplicate prompt effects if other tools inject guidance.
- Agent Plugin: also supports hooks, but adds a plugin registration lifecycle. Avoid a second plugin requirement for this independently installed VSIX.

## 4. Ownership, Lifecycle & Staging
- Managed Assets:
  - `.github/hooks/evc-advisor.json` (hook configuration)
  - `.vscode/advisor/hook.cjs` (workspace runner script)
  - `.vscode/advisor/snapshot.json` (runtime settings snapshot)
  - `.vscode/advisor/ownership.json` (receipt: schema version, workspace URI, file list, SHA-256 hashes)
- Consented Setup (`advisor.setupStartupGuidance`):
  1. Validates `vscode.workspace.isTrusted` and single-folder workspace; aborts if untrusted or multi-root.
  2. Resolves and validates external Node.js CLI binary (`node -v` via `execFile`); `process.execPath` (Electron binary) is strictly rejected.
  3. Pre-flight check: verifies NONE of the managed paths exist without a matching receipt. Aborts on unmanaged conflict.
  4. Stages `.vscode/advisor/hook.cjs` and `.vscode/advisor/snapshot.json`.
  5. Writes `.vscode/advisor/ownership.json` containing SHA-256 hashes of all three target assets.
  6. Publishes `.github/hooks/evc-advisor.json` last to prevent premature hook execution.
  7. Diagnose `chat.useHooks` and `chat.hookFilesLocations` plus enterprise restrictions. Explain any disabled hook; never enable settings automatically.
- Update/Repair (`advisor.updateStartupGuidance`):
  - Validates current file hashes against `ownership.json`. Aborts if user made out-of-band modifications. Regenerates snapshot/runner and updates receipt hashes.
- Disable/Remove (`advisor.removeStartupGuidance`):
  - Verify ownership before mutation; remove or atomically disable the hook configuration first, then remove only unchanged receipt-owned runner/snapshot assets. Do not claim already-running hooks are cancelled.
  - Never recursively delete `.vscode/advisor/`; preserve changed/unowned files and report precise manual review paths.
- Manual cleanup after uninstall requires inspecting the recorded ownership and current file hashes, not an unconditional `rm` recipe.

## 5. Subprocess Execution & Settings Snapshot
- Path quoting: JSON escaping alone is not shell escaping. Use a platform-specific command encoder; qualify shell metacharacters, spaces and Unicode. Reject unsafe control characters. Do not interpolate model input into hook commands.
- Prefer a pinned external Node executable with a generated owned runner path. Initial platform support must be explicitly agreed and verified, not inferred from command-string examples.
- Settings Snapshot (`.vscode/advisor/snapshot.json`):
```json
{
  "schemaVersion": 1,
  "workspacePath": "/abs/path",
  "enabled": true,
  "guidanceText": "Advisory Guidance: If native tool ask_advisor is available in Copilot, consult it before committing consequential architectural decisions or after 2 consecutive failed attempts. If ask_advisor is not registered or unavailable, continue normal work."
}
```
- Sync Behavior: Extension refreshes snapshot on activation (if receipt exists) and on `onDidChangeConfiguration`. Writes atomically via temporary file and rename.
- Subprocess behavior: bound stdin to 64 KiB; check `hook_event_name === "SessionStart"`, snapshot schema, workspace identity and `enabled === true`. Missing/malformed/disabled state emits `{}` and exits 0. No startup timing benchmark performed.
- Fresh-session timing: context applies to subsequent `SessionStart` events. Running chats are never modified retroactively.

## 6. Stale-Hook & Orphaned Runner Resilience
- Registry Decoupling: Hook runner cannot query the VS Code Language Model Tool registry. Injected guidance is explicitly conditional.
- Orphaned Runner: If the extension is disabled/uninstalled without running cleanup, `hook.cjs` remains valid on disk and emits conditional guidance until manually removed. It cannot detect extension removal.
- Host Failure Boundary: If external Node or `hook.cjs` is deleted while `evc-advisor.json` remains, VS Code Copilot logs a process failure; graceful skip only functions while Node and the runner file are present.

## 7. Packaging: @vscode/vsce vs Custom Packager
- Companion Packager (`scripts/build-vscode-companion.mjs`): Custom zip/CRC-32 builder with hardcoded companion targets and proposed APIs. Do not copy or adapt.
- Packaging Decision: Standard `@vscode/vsce package` in `extensions/vscode-advisor/`.
  - Prefer TypeScript output plus copied standalone CommonJS hook asset; add a bundler only if runtime dependencies require one.
  - Package through a pinned local `@vscode/vsce` dependency, never an unpinned `npx` download. Put the VSIX outside its own package input tree.
  - Explicit allowlist includes compiled runtime, manifest, operator README, LICENSE and required notices. Exclude tests, credentials, source, caches, receipts and generated VSIX files.
  - Zero Proposed APIs: Stable API only; no `--enable-proposed-api`.

## 8. Future Real-Host Qualification Gates
1. Discovery gate: VS Code Local discovers the dedicated hook file and invokes `SessionStart` on the first prompt of a new session.
2. Quoting gate: execute on each declared platform with spaces, Unicode and shell metacharacters in paths. Do not claim untested platforms.
3. Envelope gate: `hookSpecificOutput.hookEventName: "SessionStart"` and `additionalContext` appear in the actual model context before the first response.
4. Coexistence Gate: Dedicated hook executes alongside existing hooks without interference or syntax errors.
5. Lifecycle Conflict Gate: Setup refuses unowned files; removal deletes only owned files; update halts on tampered files.
6. Graceful Skip Gate: Corrupt, missing, or disabled snapshot exits code 0 with `{}` within 5s timeout.
7. VSIX Install Gate: Packaged VSIX installs cleanly into private VS Code instance and registers `ask_advisor` tool.

## Parent verification corrections
Cross-checked against official Local docs: corrected event casing, required event envelope field, actual hook settings, unsupported timing estimate and unsafe cleanup/quoting claims from the initial research draft. This report is design evidence only; all native gates remain unexecuted.
