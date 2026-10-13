# Phase 07 Reviewed-Candidate Handoff Report: VS Code Subagent Tool References

- **Date:** 2026-10-11
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** `phase-07` (Documentation, review, and controlled rollout)
- **Branch:** `fix/vscode-subagent-tool-references`
- **Candidate Handoff Disposition:** **REVIEWED-CANDIDATE HANDOFF READY (Linux-Qualified; Windows-Unqualified)**
- **Cross-Platform Implementation Acceptance:** **PENDING WINDOWS QUALIFICATION**
- **Windows Incident Closure:** **OPEN / BLOCKED** (awaiting affected-host Windows verification on pinned release pair; historical older-version causality remains separate)
- **Production Deployment Status:** **NOT DEPLOYED** (Steps 9–10 gated on Windows native/workflow qualification and explicit operator deployment authorization)

---

## 1. Pinned Release Pair & Cryptographic Candidate Identity

| Artifact / Component | Identifier / Path | SHA-256 / Version |
|---|---|---|
| **Pinned Editor** | VS Code `1.140.0` (x64) | Commit `07f806f999227108933c2e30515b26eecc1fda74` |
| **Pinned Extension** | GitHub Copilot Chat `0.68.0` | Provenance fixture `34c174a4f195e03c826bda327ab0b6b93277a1f06a3810b9ef32a49ef0bc98c2` |
| **Candidate Plugin Tree** | `.evcrate/source/.evcrate-vscode/` (761 files) | `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b` |
| **VS Code Build Manifest** | `.evcrate/build-manifest-vscode.json` | `eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155` |
| **Agent Declaration Audit** | `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json` | `d0ec26b8cbb619fbdc5af11f22fe4b7ab3fcf1352f99f129c6c2575db909f767` |
| **Candidate `evc-scout`** | `com.github.copilot/agents/evc-scout.agent.md` | `72f49951477557a42e199840f38e9d9ac897f455028fbc2ebb5431f019e85958` |
| **Candidate `evc-scout-external`** | `com.github.copilot/agents/evc-scout-external.agent.md` | `3aef1a8b48a30b480f2865b2e2f45aebc696df2d3bb26ffa3b7bd4871919805e` |
| **Candidate `evc-git-manager`** | `com.github.copilot/agents/evc-git-manager.agent.md` | `9bcf7a419968ed58e60e79c9171267f2abd44febb3bb2a266124baf935cd385f` |
| **Candidate `evc-project-manager`** | `com.github.copilot/agents/evc-project-manager.agent.md` | `05a214272b7f5e2fe9a156da8f99e9dbe37b681017616f3683819de127633861` |
| **Hook Bridge Script** | `evcrate/runtime/local-hook-bridge.cjs` | `4f90d9391fa17a9d7e27c0752c5d7b89dc1919a417c73f58ad3fb6171f741f05` |
| **Bootstrap Instructions** | `com.github.copilot/rules/bootstrap.instructions.md` | `f70bc13bcb7f2dd07a31e3ca915f72f7aad914cf7e1a374803666bd2485fc447` |

---

## 2. Qualification Evidence Matrix by Platform

| Case ID | Surface / Scenario | Linux x64 (`7.1.10-200.fc44.x86_64`) | Windows Local | Evidence Reference |
|---|---|---|---|---|
| **A01** | Generated Scout and explicit source capabilities resolve in recorded host contract | **PASS** | **PASS** (offline contract) | [phase-04-completion-receipt.md](./phase-04-completion-receipt.md) |
| **A02** | Omitted / empty / unsupported-only / Task projection cases preserve boundaries | **PASS** | **PASS** (offline contract) | [phase-03-completion-receipt.md](./phase-03-completion-receipt.md) |
| **N01** | Direct no-shell `contract-reader`: locate file, find key, read unprovided value | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N02** | Coordinator delegates to `contract-reader`; grounded child findings returned | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N03** | Production `evc-scout` direct and delegated with live hook bridge; 0 edits | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N04** | Direct and delegated `tools: []` (`contract-deny-all` / `evc-advisor`) withheld | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N05** | Direct no-child control (`agent/runSubagent` + `agents: []`) blocks child start | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N06** | Task-bearing coordinator (`agent/runSubagent` + `agents: ['*']`) delegates | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N07** | Explicit edit control (`createFile`, `replaceString`, `multiReplaceString`) | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N08** | Terminal family (`runInTerminal`, `getTerminalOutput`, `killTerminal`) | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N09** | Direct `todo` resolves; child subagent `manage_todo_list` disabled by host | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **N10** | Protected `node_modules/` denied for Scout; `.env` triggers privacy ask | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |
| **W01** | Two disjoint Scout tasks return line-grounded tokens; 0 source mutations | **PASS** | **BLOCKED** | [docs-workflow-qualification.md](./docs-workflow-qualification.md) |
| **W02** | Canonical `evc-docs-manager` with omitted tools inherits editing and updates 4 docs | **PASS** | **BLOCKED** | [docs-workflow-qualification.md](./docs-workflow-qualification.md) |
| **W03** | End-to-end `/evcrate-local cmd-docs-update` (`>= 4` reader branch, `Explore` -> `evc-scout`, size/validator checks) | **PASS** | **BLOCKED** | [docs-workflow-qualification.md](./docs-workflow-qualification.md) |
| **W04** | Candidate registration & refresh resolves candidate URI/digest without collision | **PASS** | **BLOCKED** | [native-qualification.md](./native-qualification.md) |

---

## 3. Source, Generated-Agent Class, and Runtime Normalization Audit

1. **Four-Namespace Separation (`src/adapters/vscode/metadata-tools.ts`)**:
   - Canonical source tool intent (`Read`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillBash`, `KillShell`, `Task`, `TodoWrite`, `Edit`, `Write`, `MultiEdit`) maps exclusively to verified VS Code `1.140.0` / Copilot Chat `0.68.0` frontmatter references (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`).
   - Model-facing names (`copilot_readFile`, `manage_todo_list`) and PreToolUse/PostToolUse hook identities remain separate.
   - `canDelegate` is derived from source `Task` intent rather than output string equality.
2. **All 18 Generated Agent Classes (`.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json`)**:
   - **Omitted-tool inherited coordinators (13 agents)**: `evc-brainstormer`, `evc-code-reviewer`, `evc-copywriter`, `evc-database-admin`, `evc-debugger`, `evc-docs-manager`, `evc-fullstack-developer`, `evc-journal-writer`, `evc-mcp-manager`, `evc-planner`, `evc-researcher`, `evc-tester`, `evc-ui-ux-designer` omit `tools` in frontmatter (`explicitNone: false`, `mapped: []`, `delegation.allowed: true`, `agents: ['*']`).
   - **Explicit non-Task leaf agents (4 agents)**: `evc-scout`, `evc-scout-external`, `evc-git-manager`, `evc-project-manager` emit exact mapped native references, record unsupported web/MCP/notebook tools in `dropped`, and enforce `delegation.allowed: false` (`agents: []`).
   - **Explicit deny-all leaf agent (1 agent)**: `evc-advisor` (`tools: none`) emits `tools: []` and `agents: []` (`explicitNone: true`, `delegation.allowed: false`).
   - **Explicit Task-bearing coordinator control**: Verified in `vscode-metadata-permissions.test.mjs`, `vscode-resource-projection.test.mjs`, and `contract-coordinator` (`N02`, `N06`).
3. **Hook Operand Normalization Parity (`tool-inputs.ts` & `runtime-sources.ts`)**:
   - Both TypeScript source (`src/adapters/vscode/tool-inputs.ts`), runtime source authority (`src/adapters/vscode/runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE`), and emitted `evcrate/runtime/local-tool-inputs.cjs` normalize `filePath`, `FilePath`, `path`, `file_path`, `target_file`, and `TargetFile` across read, edit (`files[]`, `replacements[]`), and search/glob operations.
   - Paired unit and subprocess bridge regressions (`tests/adapters/vscode-policy.test.mjs`, `tests/adapters/vscode-hooks.test.mjs`) verify both permitted operations and protected-path (`node_modules/`, `.env`) denial/approval.

---

## 4. Operator Runbook: Clean Republish, Verification, Smoke, Workaround & Rollback

### A. Preview and Clean Republish (Requires Explicit Deployment Authorization)
Do **not** run against production user profiles without explicit operator deployment authorization:
```bash
# 1. Preview publication without mutating editor settings
node dist/cli/evcrate.js publish --dry-run --scope home --target vscode --no-register-vscode-settings --json

# 2. Apply publication (inert by default; add --register-vscode-settings only if settings.json update is approved)
node dist/cli/evcrate.js publish --apply --scope home --target vscode --no-register-vscode-settings --json
```

### B. Selected Profile & Candidate Verification
1. Ensure only one `evcrate-local` plugin location is enabled in `chat.pluginLocations` for the active profile so stale definitions do not collide.
2. Start a fresh VS Code session and verify that `.evcrate-vscode/evcrate/agent-tool-audit.json` matches SHA-256 `d0ec26b8cbb619fbdc5af11f22fe4b7ab3fcf1352f99f129c6c2575db909f767` and `evc-scout.agent.md` matches `72f49951477557a42e199840f38e9d9ac897f455028fbc2ebb5431f019e85958`.
3. Run direct and delegated smoke using `evc-scout` on a non-ignored workspace directory; confirm native `search/fileSearch`, `search/textSearch`, and `read/readFile` tool traces succeed and that `node_modules/` remains blocked by the PreToolUse hook. Note that VS Code intentionally disables `manage_todo_list` (`todo`) inside child subagents while permitting it in direct sessions.

### C. Safe Manual Workaround While Windows Local Remains Blocked
Until native Windows Local rows (`WN01`–`WN10`, `WW01`–`WW04`) are executed and passed on an affected Windows installation running VS Code `1.140.0` / Copilot Chat `0.68.0`:
- Perform repository scouting directly in the parent session rather than relying on delegated Windows Scout subagents.
- Never widen leaf agent permissions, enable auto-approval, or disable PreToolUse hooks to work around an unverified Windows host.

### D. Rollback & Recovery Boundaries
- **Interrupted transaction repair**: Stop active agent sessions and run `evcrate recover --scope home --json` (or `--scope project --project-root <path> --json`).
- **Scope and content limits**: `evcrate recover` is an interrupted-transaction repair tool, **not** a general version-downgrade switch. Project-scope rollback does not undo an already-committed shared HOME controller update (`~/.evcrate/bin`), does not revert agent-made documentation edits, and never mutates user `settings.json`.
- **Declaration rollback**: To disable or revert plugin declarations after a completed publish, set the `.evcrate-vscode` entry in `chat.pluginLocations` to `false` (or republish a verified known-good snapshot) while preserving user-owned configuration files.

---

## 5. Unresolved Questions & Remaining Gates Before Closure/Rollout

1. **Affected Windows Host Qualification (`BLOCKED`)**: Execute native rows `WN01`–`WN10` and `WW01`–`WW04` on the affected Windows Local workstation after operator-approved alignment to VS Code `1.140.0` / Copilot Chat `0.68.0`. (Historical older-version causality remains separate.)
2. **Production Deployment Authorization (`PENDING`)**: Resolve target scope/profile destination and obtain explicit operator authorization before executing Phase 07 Steps 9–10 in a user environment.
