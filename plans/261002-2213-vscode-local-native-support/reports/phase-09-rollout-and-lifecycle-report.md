# VS Code Local Native Support — Phase 09 Rollout and Lifecycle Report

- **Date:** 2026-10-04
- **Phase:** `Phase 09 — Documentation, controlled rollout and lifecycle`
- **Plan:** `plans/261002-2213-vscode-local-native-support/plan.md`
- **Overview:** `plans/261002-2213-vscode-local-native-support/progress.md`
- **Workstation Platform:** Linux x64 (`7.1.10-200.fc44.x86_64`)
- **Pinned Local Runtime:** VS Code `1.140.0` (commit `07f806f999227108933c2e30515b26eecc1fda74`), Copilot Chat `0.68.0`
- **Candidate Release Tree Hash:** `52d3c831a7bc2a550556b85c830f58ba61908e065bd5e03e4dae50f3bc342393` (753 files)
- **Status:** **APPROVED & QUALIFIED FOR CONTROLLED ROLLOUT**

---

## 1. Executive Summary & Rollout Authority

Phase 09 completes the final planned implementation phase for VS Code Local native support. Following the durable qualification of Phase 08 (Task Run `980efda4-94ae-4a51-aac9-51bb62d1fe62`, commit `cbd298a4`, 8/8 qualification tests, 737/737 full npm test gate, code review score 9.4/10), Phase 09 establishes:

1. **Reconciled Core Documentation**: System architecture, codebase summary, code standards, project overview PDR (FR-25), roadmap, and public README/guide updated with the eighth persisted target `vscode`.
2. **Schema & Packaging Integrity**: Schema-2 target manifests manage all eight targets; legacy schema-1 registry maintains exact-seven read-only normalization for backward compatibility. Core release assets remain strictly seven files.
3. **Controlled Rollout Authority**: Transition from "Native Qualified" to "Controlled Pilot / Supported Release" under receipt-backed boundaries.
4. **Lifecycle & Stop-Trigger Governance**: Clear update, recovery, and retirement runbooks with six explicit stop triggers for upstream Local changes and version drift.

---

## 2. Authoritative Support Matrix

All 12 declared contexts from the Phase 08 qualification index are accounted for with empirical evidence or explicit boundary designations:

| Context ID | Target Environment | Status | Support Disposition | Evidence Authority |
|---|---|---|---|---|
| **linux-x64-project** | Linux x64 project-level install | **QUALIFIED (PASS)** | Supported | [linux-x64-project/receipt.md](./native-local/linux-x64-project/receipt.md) |
| **linux-x64-home** | Linux x64 HOME-level install | **QUALIFIED (PASS)** | Supported | [linux-x64-home/receipt.md](./native-local/linux-x64-home/receipt.md) |
| **multi-root-workspace** | Concurrent multi-root isolation | **QUALIFIED (PASS)** | Supported | [multi-root-workspace/receipt.md](./native-local/multi-root-workspace/receipt.md) |
| **untrusted-workspace** | Workspace trust boundary | **QUALIFIED (PASS)** | Supported | [untrusted-workspace/receipt.md](./native-local/untrusted-workspace/receipt.md) |
| **wrong-harness-isolation** | Non-Local harness safety | **QUALIFIED (PASS)** | Supported | [wrong-harness-isolation/receipt.md](./native-local/wrong-harness-isolation/receipt.md) |
| **diagnostic-protocol-probes** | Protocol edge probes | **QUALIFIED (PASS)** | Supported (Diagnostic) | [diagnostic-protocol-probes/receipt.md](./native-local/diagnostic-protocol-probes/receipt.md) |
| **windows-x64** | Windows local extension host | **NOT EXERCISED** | Pending workstation access | [windows-x64/receipt.md](./native-local/windows-x64/receipt.md) |
| **macos-arm64** | macOS local extension host | **NOT EXERCISED** | Pending workstation access | [macos-arm64/receipt.md](./native-local/macos-arm64/receipt.md) |
| **remote-ssh** | Remote SSH extension host | **NOT EXERCISED** | Pending remote environment | [remote-ssh/receipt.md](./native-local/remote-ssh/receipt.md) |
| **wsl-linux** | WSL 2 runtime environment | **NOT EXERCISED** | Pending WSL environment | [wsl-linux/receipt.md](./native-local/wsl-linux/receipt.md) |
| **dev-container** | Dev Container environment | **NOT EXERCISED** | Pending container setup | [dev-container/receipt.md](./native-local/dev-container/receipt.md) |
| **other-remote-web** | Browser-only web environment | **UNSUPPORTED** | Explicitly Unsupported | [other-remote-web/receipt.md](./native-local/other-remote-web/receipt.md) |

### Key Support Invariants
- **No Inferred Parity**: Unexercised platforms (Windows, macOS, Remote SSH, WSL, Dev Containers) remain honestly labeled "NOT EXERCISED" until physical workstation receipts are captured.
- **Explicit Unsupported Boundary**: Browser-only web contexts (`other-remote-web`) lack a Node.js process runtime and cannot execute CommonJS hook closures; they fail closed and are marked unsupported.
- **Honest Gaps by Design**:
  - **C39**: No `SessionEnd` event or shell environment variable persistence.
  - **C40**: No terminal statusline or token telemetry.

---

## 3. Quickstart and Manual Activation Runbook

### Step 1: Publication (Project Scope or HOME Scope)

Publication uses existing CLI commands and validates paths, ownership, and atomicity:

```bash
# Preview publication in project scope
evcrate publish --dry-run --scope project --project-root /path/to/project --target vscode --json

# Apply publication to project workspace (.evcrate-vscode/)
evcrate publish --apply --scope project --project-root /path/to/project --target vscode --json

# Apply publication to user HOME (~/.evcrate-vscode/)
evcrate publish --apply --scope home --target vscode --json
```

### Step 2: User Settings Registration

EVCrate publication strictly avoids writing to user editor configuration files. To activate the published bundle, add the absolute directory path to your VS Code `settings.json` (User or Workspace):

```json
{
  "chat.pluginLocations": {
    "/path/to/project/.evcrate-vscode": true
  }
}
```

### Step 3: Activation Verification

1. **Reload VS Code Window**: Run `Developer: Reload Window` from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. **Verify Custom Agents**: In Copilot Chat, open the agent picker. Confirm the 19 custom agents are visible (e.g., `@advisor`, `@code-reviewer`, `@tester`).
3. **Verify Slash Commands**: Confirm slash commands appear as manual skills under the `evcrate-local` namespace (e.g., `/evcrate-local:cmd-plan`, `/evcrate-local:cmd-code`).
4. **Verify Session Hooks**: Submit a prompt. Check that `.evcrate-vscode/hooks/lib/` executes and emits structured event envelopes without throwing.

---

## 4. Coexistence & Privacy Boundaries

### Coexistence Rules
- **One Active Copy**: Never enable both HOME (`~/.evcrate-vscode`) and project-level (`.evcrate-vscode`) in the same workspace. If both are enabled, duplicate command names and redundant hook triggers will occur.
- **Copilot CLI Independence**: The standalone Copilot CLI target (`.copilot/`) remains completely separate from VS Code Local (`.evcrate-vscode/`). Both can safely coexist in the same project root.

### Privacy & Policy Enforcements
- **Scout Policy**: Automatically blocks heavy directories (`node_modules/`, `dist/`, `build/`, `.git/`, `.venv/`, `coverage/`).
- **Privacy Policy**: Blocks or requests explicit interactive human confirmation when tools attempt to inspect sensitive files (`.env`, certificates, credentials, SSH keys).
- **Fail-Closed Bridge**: If a hook script encounters an unhandled exception or exit code 127, the bridge fails closed to exit code 2 (deny).
- **Opt-In MCP**: Example configurations in `evcrate/examples/vscode-settings.example.json` are inert templates with pinned package versions. No external MCP server is started automatically.

---

## 5. Maintenance, Recovery, and Retirement Runbook

### Updating to New Releases
```bash
# Rebuild and publish updated target projection
npm run distribute:build
evcrate publish --apply --scope project --project-root /path/to/project --target vscode --json
```
After publication, reload the VS Code window to load updated bundle files.

### Scope-Isolated Recovery
If a publication transaction is interrupted or aborted:
```bash
# Recover project scope (restores known-good files without modifying editor settings)
evcrate recover --scope project --project-root /path/to/project --json

# Recover HOME scope
evcrate recover --scope home --json
```

### Deactivation and Safe Retirement
1. **Deactivate**: In VS Code `settings.json`, set the `chat.pluginLocations` entry to `false` or delete the entry.
2. **Reload Window**: Ensure no active sessions are holding file descriptors open.
3. **Remove Files**: Delete only verified receipt-owned files under `.evcrate-vscode/`. Never run broad recursive deletes on unmanaged directories.

---

## 6. Release & Lifecycle Stop Triggers

The following six conditions mandate an immediate halt of VS Code Local rollout:

| Trigger | Description | Required Response |
|---|---|---|
| **1. Upstream Retirement** | Upstream VS Code removes or disables Agent Plugins 1.0 support. | Halt rollout immediately. Document the last supported version (VS Code 1.140.0). Do not silently migrate to unvalidated alternatives. |
| **2. Hook Contract Failure** | Required lifecycle hooks (e.g., `PreToolUse`, `SessionStart`) fail to trigger or alter input envelopes unexpectedly. | Reopen Phase 03/08. Do not advertise broken hooks as enforced security boundaries. |
| **3. Policy Bypass or Widening** | A tool bypasses scout/privacy deny rules or expands permissions without authorization. | Disable activation guidance. Hold release until the security violation is resolved and re-tested. |
| **4. Session Leakage / Collision** | Session state or plan CAS leaks across different project roots or concurrent windows. | Pause rollout. Investigate `vscode-session-context.cjs` atomic state and isolate roots. |
| **5. Version Drift** | VS Code or Copilot Chat extensions update past qualified versions (1.140.0 / 0.68.0) and introduce breaking protocol changes. | Invalidate existing receipts. Re-run Phase 08 qualification suite on new versions before updating docs. |
| **6. Ownership / Staging Collision** | Publication encounters unmanaged files or cross-target descriptor overlaps. | Fail closed. Stop publication and recover affected scope. |

---

## 7. Phase 09 Gate Verification

- [x] Authoritative capability matrix C01–C50 reconciled with Phase 08 qualification receipts.
- [x] All 12 declared contexts documented with verified status or explicit boundaries.
- [x] Architecture, codebase summary, code standards, PDR, and roadmap reconciled.
- [x] Public README and skills guide updated with quickstart, coexistence, and support matrix.
- [x] Canonical scripts README and `evcrate-help` command updated.
- [x] Projections regenerated and distribution checks passed (`distribute:check` status ok).
- [x] Controlled rollout runbook and stop-trigger checklist documented.
