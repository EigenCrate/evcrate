# Phase 09 Native Host Qualification Report & Interactive Verification Guide

**Date:** 2026-10-12  
**Plan:** [plan.md](../plan.md) | [Phase 09](../phase-09-integrated-qualification.md) | [Integrated Qualification](./integrated-qualification.md)  
**Host Workstation:** Windows 10/11 x64 (`win32 10.0.26200`), Node `v24.21.0`, VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) & `1.141.0` (`2a59476c9bfcb90b3ddc372c36762471b7dfad1c`)  
**Candidate VSIX:** `evcrate-model-bindings-2.11.0.vsix` (SHA-256 `833e982d1cb08139e4df4a4891a4622d5f001076ab55a66a77f80f70f449cc89`, `buildIdentity: 68a82c4549d3b68a8cab7b73b3252a46d195d87634e8a08023af64d1119bb965`)

---

## 1. Per-Session Authorization & Scope Record

- **User Authorization Granted (2026-10-12):**
  1. **Isolated Temp-Dir CLI Installation (`isolated_cli_install`):** Explicitly authorized running `code` (`1.140.0`) `--install-extension` and `--list-extensions --show-versions` strictly inside disposable `os.tmpdir()` `--user-data-dir` and `--extensions-dir` directories without mutating the user's real `%USERPROFILE%\.vscode` or `%APPDATA%\Code`.
  2. **Isolated Native Extension-Host Execution (`live_gui_gate`):** User authorized automated host checks where possible and requested step-by-step manual verification instructions for interactive GUI / live Copilot Chat checks that cannot be automated without an authenticated interactive GUI session.

---

## 2. Exercised Native Host Receipts (VS Code 1.140.0 on Windows x64)

### Receipt N-01: Isolated Native CLI VSIX Installation, Idempotence & Build-Identity Enforcement
- **Host Binary:** `C:\Users\loidi\AppData\Local\Programs\Microsoft VS Code\Code.exe` + `07f806f999\resources\app\out\cli.js` (`1.140.0`, commit `07f806f999227108933c2e30515b26eecc1fda74`, `x64`)
- **Isolation Scope:** Disposable `os.tmpdir()` `--user-data-dir` and `--extensions-dir` via `tests/integration/vscode-installed-runtime.test.mjs`
- **Observed Outcomes:**
  1. **Fresh Install (`req-live-cli-1`):** `coordinateVscodeCompanionInstallation` staged `evcrate-model-bindings-2.11.0.vsix` into private `evcrate-companion-stage-*`, verified SHA-256 (`c4638015...`), installed into isolated `--extensions-dir`, re-probed `--list-extensions --show-versions` (`eigencrate.evcrate-model-bindings@2.11.0`), verified unpacked `package.json#buildIdentity` (`caf354b6...`), emitted `evcrate-vscode-companion-install-v1` with `status: "installed"`, `exitCode: 0`.
  2. **Idempotent Re-Run (`req-live-cli-2`):** Detected `eigencrate.evcrate-model-bindings@2.11.0` with matching `buildIdentity` on disk; skipped reinstall with `status: "already-installed"`, `exitCode: 0`.
  3. **Same-Version Identity Mismatch (`req-live-cli-3`):** When installed `package.json#buildIdentity` differed from candidate descriptor (`f`.repeat(64) vs `caf354b6...`), refused version-only acceptance and returned `status: "manual-setup-required"`, `exitCode: 5` while preserving committed `ResourceResult` on stdout.
- **Disposition:** **PASS**

### Receipt N-02: Isolated Native Extension-Host Activation, Proposal Guard & Real Command Execution
- **Host Binary:** `C:\Users\loidi\AppData\Local\Programs\Microsoft VS Code\Code.exe` (`1.140.0`, commit `07f806f999227108933c2e30515b26eecc1fda74`)
- **Isolation Scope:** Disposable `--user-data-dir`, `--extensions-dir`, `--extensionDevelopmentPath`, `--extensionTestsPath` with `--enable-proposed-api=eigencrate.evcrate-model-bindings`
- **Observed Outcomes:**
  1. **Host API & Authority:** `vscode.version === "1.140.0"`, `typeof vscode.chat.registerCustomAgentProvider === "function"`, `vscode.workspace.isTrusted === true`, `vscode.env.remoteName === null`.
  2. **Pre-Approval Guard:** Prior to root approval, `getLatestDiagnosticsReport().setupOrInvalidationReason === "PROJECT_INSTALLATION_INVALID"` and `getContributedResources().length === 0`.
  3. **Real Command Execution (`evcrate.selectInstallation`, `evcrate.configureAgentModels`, `evcrate.configureActorModel`, `evcrate.showModelBindings`, `evcrate.clearModelBindings`):**
     - Executing `evcrate.selectInstallation` approved the workspace `.evcrate-vscode` root in `context.globalState`.
     - Executing `evcrate.configureAgentModels` for `opus`, `sonnet`, and `haiku` caused the provider to stage and contribute all **17** concrete `evc-*.agent.md` files under `user-data/User/workspaceStorage/<id>/eigencrate.evcrate-model-bindings/resolved/<rootHash>/<instanceUuid>/gen-<N>/`.
     - Executing `evcrate.configureAgentModels` (root tier `opus` -> `claude-sonnet-4`) and `evcrate.configureActorModel` (user actor `evc-planner` -> `gpt-4.1`) proved `user.actor` (`GPT-4.1 (copilot)`) beats `root.tier`.
     - Executing `evcrate.configureActorModel` (root actor `evc-planner` -> `o3-mini`) proved `root.actor` (`o3-mini (copilot)`) beats `user.actor`.
     - Executing `evcrate.clearModelBindings` on root actor `evc-planner` restored `effectiveSource: "user.actor"` (`GPT-4.1 (copilot)`).
     - Executing `evcrate.showModelBindings` returned a valid `evcrate-vscode-runtime-bindings-v1` report with `hostObservedModel: null`.
- **Disposition:** **PASS**

### Receipt N-03: Native Hook Bridge Subprocess Execution (`local-hook-bridge.cjs`)
- **Isolation Scope:** Materialized `.evcrate-vscode` bundle executed from foreign CWD and `PLUGIN_ROOT` with spaces (`tests/integration/vscode-installed-runtime.test.mjs`)
- **Observed Outcomes:**
  - All 8 lifecycle events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `Stop`) returned valid envelopes (`exit 0`).
  - Malformed/mismatched invocations exited `2` (fail-closed).
  - Scout policy denied `node_modules/` and `.git/config`; privacy policy returned `ask` for `.env` and suppressed unconfirmed reads.
- **Disposition:** **PASS**

---

## 3. Unexercised Interactive GUI & Live Copilot Inference Gates (BLOCKED)

Per `renderer.log` in the isolated VS Code `1.140.0` host (`[AgentHost] No signed-in session resolved for resource: https://api.github.com`), the isolated profile has no authenticated GitHub Copilot session, and interactive chat picker / subagent inference cannot be synthesized headlessly:

| Gate | Status | Blocker Reason |
|---|---|---|
| Live Copilot Chat picker inventory & zero duplicate static actors in UI (AC 02) | **BLOCKED** | Requires interactive Copilot Chat UI session |
| Live direct & child subagent model inference metadata (`hostObservedModel`) + tool/cost precedence (AC 04) | **BLOCKED** | Requires authenticated Copilot Chat session & live inference |
| Live running-turn immutability & cached-selection race + explicit reselection/reload recovery in Chat UI (AC 05, AC 06) | **BLOCKED** | Requires active multi-turn Copilot Chat UI session |
| Live host-enforced `tools: []` / `agents: []` denial & cross-source hook firing during a live Chat turn (AC 07) | **BLOCKED** | Requires active Copilot Chat agent turn |
| Linux x86_64 interactive GUI / CLI companion install smoke (AC 01, AC 09–11) | **BLOCKED** | Current session ran on Windows x64; Linux interactive GUI session not attached |

---

## 4. Step-by-Step Manual Verification Checklist for Interactive VS Code GUI

To complete the remaining interactive GUI rows on your authenticated local profile (or an isolated test profile signed into GitHub Copilot):

1. **Publish & Install Companion into Target Workspace / Profile:**
   ```powershell
   node dist/cli/evcrate.js publish --apply --scope project --project-root <path-to-test-workspace> --target vscode --register-vscode-settings --install-vscode-companion
   ```
2. **Verify Proposal-Disabled Guidance First (AC 01, AC 09):**
   - Launch VS Code normally **without** `--enable-proposed-api`:
     ```powershell
     code <path-to-test-workspace>
     ```
   - Run command **`EVCrate: Show Model Bindings and Diagnostics`** (`evcrate.showModelBindings`) from the Command Palette (`Ctrl+Shift+P`).
   - Confirm diagnostics display setup reason `chatPromptFiles API proposal is not available` and no static `evc-*` agents appear in the Copilot Chat `@` / agent picker.
3. **Launch with Proposed API Enabled (AC 01, AC 02, AC 03):**
   - Close VS Code and launch with the proposed API flag:
     ```powershell
     code --enable-proposed-api=eigencrate.evcrate-model-bindings <path-to-test-workspace>
     ```
   - Run **`EVCrate: Select Installation Root`** (`evcrate.selectInstallation`) and approve the workspace `.evcrate-vscode` root.
   - Run **`EVCrate: Configure Agent Model Tiers`** (`evcrate.configureAgentModels`) and bind `opus`, `sonnet`, and `haiku` to available Copilot models.
   - Open the Copilot Chat agent picker: confirm all 17 `evc-*` agents appear **once** (no duplicates).
4. **Verify Direct & Child Subagent Model Selection + Restrictions (AC 04, AC 07):**
   - Invoke `@evc-planner` (or select `evc-planner` from the agent picker) on a harmless prompt and inspect the Copilot Chat debug/request log to confirm the host-selected model matches your bound tier/override.
   - Invoke `@evc-scout` and verify read/search tools are allowed, `.env` triggers the privacy confirmation prompt (`local-hook-bridge.cjs`), and `node_modules/` reads are blocked by scout policy.
5. **Verify In-Flight Immutability & Cached-Selection Reselection Recovery (AC 05, AC 06):**
   - While `evc-planner` is selected in Chat, run **`EVCrate: Configure Actor Model Override`** (`evcrate.configureActorModel`) and change `evc-planner` to a different model.
   - Observe whether sending another message without reselecting uses the cached selection (documented cached-selection race limitation), then **explicitly reselect `evc-planner` in the Chat picker** (or run **`Developer: Reload Window`**) and confirm the next turn uses the newly bound model.
