# Documentation Status Report: Phase 07 — Documentation, Review, and Controlled Rollout

- **Date:** 2026-10-11
- **Author:** `EvcDocsManagerPhase07`
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** `phase-07` (`phase-07-documentation-and-rollout.md`)
- **Branch:** `fix/vscode-subagent-tool-references`
- **Disposition:** **COMPLETE — REVIEWED-CANDIDATE HANDOFF DOCUMENTED (Linux-Qualified; Windows-Unqualified; Not Deployed)**

---

## 1. Executive Summary

Inspected and verified Phase 07 documentation and rollout artifacts across `docs/system-architecture.md`, `docs/code-standards.md`, `CHANGELOG.md`, `docs/project-changelog.md`, `docs/project-changelog-archive.md`, `plans/261010-1552-vscode-subagent-tool-references/architecture.md`, `plans/261010-1552-vscode-subagent-tool-references/phase-07-documentation-and-rollout.md`, and `plans/261010-1552-vscode-subagent-tool-references/reports/candidate-handoff.md`.

Key confirmations:
- **Four-Namespace Tool Contract & 13-Capability Mapping (`1.140.0` / `0.68.0`):** Consistently documented across architecture, standards, and changelogs without broad groups (`edit`, `execute`, `agent`), runtime registry discovery, or extra extensions.
- **Permission & Delegation Invariants:** `Task`-derived `canDelegate` (`agents: ['*']` vs. leaf `agents: []`), `tools: []` deny-all, omitted-tool inheritance, unsupported-only empty lists, and direct `todo` vs. host-disabled child-subagent `manage_todo_list` (`runSubagentTool.ts`) verified across all maintained docs.
- **Dual-Authority Hook Operand Normalization:** Paired `filePath`, `FilePath`, `path`, `file_path`, `target_file`, and `TargetFile` normalization in `src/adapters/vscode/tool-inputs.ts`, `src/adapters/vscode/runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`), and emitted `evcrate/runtime/local-tool-inputs.cjs` documented across read, edit (`files[]`, `replacements[]`), and search/glob payloads.
- **Line-Count Budget (`docs.maxLoc < 800`):** All 14 `docs/*.md` files strictly `< 800` lines (max: `docs/system-architecture.md` at 793 LOC); `validate-docs.cjs` exit 0.
- **Rollout & Incident State Separation:** Explicit boundary maintained between **Linux-qualified reviewed-candidate handoff** (complete, tree `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b`), **Windows Local qualification** (`BLOCKED`), **Windows incident closure** (`OPEN / BLOCKED`), and **production deployment** (`NOT DEPLOYED`, Steps 9–10 intentionally unexecuted).

---

## 2. Phase 07 Documentation Audit by File

| File | Lines | Phase 07 Contract & Rollout Coverage |
|---|---:|---|
| `docs/system-architecture.md` | 793 | Lines 130–150: Documents inert default publication vs. opt-in `chat.pluginLocations` registration (`--register-vscode-settings` / `--no-register-vscode-settings`), `evcrate recover` scope isolation, `mapAgentTools` 13-capability projection to VS Code `1.140.0` / Copilot Chat `0.68.0`, four-namespace separation, `Task`-derived `canDelegate`, direct vs. child-disabled `todo`, `filePath`/`path` normalization (`tool-inputs.ts` & `runtime-sources.ts`), build-declaration audit (`agent-tool-audit.json`), Linux `N01`–`N10` / `W01`–`W04` qualification (`81792bf2...`), and blocked Windows/incident/rollout status. |
| `docs/code-standards.md` | 786 | Lines 4, 758–763: Adds `### VS Code Local tool-reference, qualification, and rollout standards` covering mapper authority (`mapAgentTools`), independent provenance fixture testing (`tests/fixtures/vscode-local/tool-references.json`), permission & `filePath`/`FilePath` normalization invariants across `tool-inputs.ts` and `LOCAL_TOOL_INPUTS_SOURCE`, build declaration vs. effective grant distinction, and operator republish/verification/parent-scouting workaround/rollback boundaries. |
| `CHANGELOG.md` | 655 | Lines 107, 113: Records Unreleased `Bug Fixes` (`vscode` frontmatter tool-map cutover to `1.140.0` / `0.68.0` identifiers, `Task`-derived `canDelegate`, `filePath`/`FilePath` normalization without widening permissions or blaming host runtime) and `Documentation` (four-namespace separation, audit vs. runtime grants, Linux `N01`–`N10` & `W01`–`W04` qualification, child `todo` host restriction, operator boundaries, Windows-unqualified non-deployed handoff). |
| `docs/project-changelog.md` | 767 | Lines 5–13, 761–763: Adds `2026-10-11 — fix(vscode): correct subagent frontmatter tool references and qualify Linux candidate handoff (Phases 01–07)` with full 13-capability map, `filePath`/`FilePath` normalization parity, candidate digests (`81792bf2...`, `eb1597b4...`, `d0ec26b8...`), Linux Phase 05 (11/11) & Phase 06 (3/3) receipts, and blocked Windows/incident/rollout gates; compacts historical Phases 01–07 distribution entry with pointer to archive. |
| `docs/project-changelog-archive.md` | 772 | Lines 5–13: Preserves archived `2026-09-13` Phase 08/09 distribution entries moved from `docs/project-changelog.md` to maintain `< 800` LOC ceiling. |
| `plans/261010-1552-vscode-subagent-tool-references/architecture.md` | 43 | Lines 1–43: Replaces pending design note with implemented architecture contract: boundary, 4 tool namespaces, 13-capability mapping table, invariants across all 18 generated agents, inert default publish vs. opt-in settings registration, and Linux-qualified / Windows-blocked rollout gate. |
| `plans/261010-1552-vscode-subagent-tool-references/phase-07-documentation-and-rollout.md` | 75 | Lines 8–11, 50–56: Records Reviewed-Candidate Handoff Complete (Linux-qualified; Windows-unqualified), Cross-Platform Acceptance / Incident Closure / Production Deployment Blocked (Steps 9–10 unexecuted), and completes Phase 07 checklist items. |
| `plans/261010-1552-vscode-subagent-tool-references/reports/candidate-handoff.md` | 104 | Lines 1–104: Cryptographic candidate identity table, platform qualification matrix (`A01`–`A02`, `N01`–`N10`, `W01`–`W04` Linux PASS vs. Windows Native BLOCKED), 18-agent audit, hook normalization parity, and operator runbook (preview/republish, profile verification, parent-scouting workaround, recovery boundaries). |

---

## 3. Technical Contract Verification Matrix

1. **Four-Namespace Separation:**
   - **Source Intent (13 capabilities):** `Read`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillBash`, `KillShell`, `Task`, `TodoWrite`, `Edit`, `Write`, `MultiEdit`.
   - **VS Code `1.140.0` / Copilot Chat `0.68.0` Frontmatter References:** `read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString` (`Write` -> `['createFile', 'editFiles']`; `KillBash`/`KillShell` -> `['killTerminal']`; `MultiEdit` -> `['multiReplaceString']`, excluding `applyPatch`).
   - **Model-Facing Names:** `copilot_readFile`, `manage_todo_list` preserved in prose/schemas without conflating frontmatter declarations.
   - **Hook Event Identities & Operands:** `filePath`, `FilePath`, `path`, `file_path`, `target_file`, `TargetFile` normalized identically across `src/adapters/vscode/tool-inputs.ts`, `src/adapters/vscode/runtime-sources.ts`, and `evcrate/runtime/local-tool-inputs.cjs`.
2. **Delegation & Subagent Boundaries:**
   - `canDelegate` derived from canonical `Task` presence (`agents: ['*']` for coordinators vs. `agents: []` for leaf agents).
   - Direct sessions resolve `todo`; child subagents have `manage_todo_list` disabled by host runtime (`runSubagentTool.ts`).
3. **State Separation (Handoff vs. Acceptance / Closure / Rollout):**
   - **Reviewed-Candidate Handoff:** **READY / COMPLETE** on Linux x64 (candidate tree `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b`).
   - **Cross-Platform Implementation Acceptance:** **BLOCKED** pending affected-host Windows Local qualification (`WN01`–`WN10`, `WW01`–`WW04`) on VS Code `1.140.0` / Copilot Chat `0.68.0`.
   - **Windows Incident Closure:** **OPEN / BLOCKED** (requires affected-host Windows verification; historical older-version causality remains separate and unconfirmed).
   - **Production Deployment (Steps 9–10):** **NOT EXECUTED / NOT DEPLOYED** (requires Windows qualification and explicit operator deployment authorization).

---

## 4. Documentation Line-Count Verification (`docs/*.md < 800` LOC)

All 14 Markdown files in `docs/` are strictly below the 800-line limit (`validate-docs.cjs` exit 0):

| File | Line Count | Limit | Headroom | Status |
|---|---:|---:|---:|---|
| `docs/system-architecture.md` | 793 | 800 | 7 | PASS (`< 800`) |
| `docs/code-standards.md` | 786 | 800 | 14 | PASS (`< 800`) |
| `docs/project-changelog-archive.md` | 772 | 800 | 28 | PASS (`< 800`) |
| `docs/project-changelog.md` | 767 | 800 | 33 | PASS (`< 800`) |
| `docs/codebase-summary.md` | 746 | 800 | 54 | PASS (`< 800`) |
| `docs/project-overview-pdr.md` | 641 | 800 | 159 | PASS (`< 800`) |
| `docs/project-roadmap.md` | 259 | 800 | 541 | PASS (`< 800`) |
| `docs/design-guidelines.md` | 205 | 800 | 595 | PASS (`< 800`) |
| `docs/all-project-advisor-history.md` | 192 | 800 | 608 | PASS (`< 800`) |
| `docs/workspace-advisor-pdr.md` | 181 | 800 | 619 | PASS (`< 800`) |
| `docs/pi-native-migration.md` | 161 | 800 | 639 | PASS (`< 800`) |
| `docs/workspace-advisor-host-contract.md` | 145 | 800 | 655 | PASS (`< 800`) |
| `docs/upgrade-backup-and-leftover-guidance.md` | 113 | 800 | 687 | PASS (`< 800`) |
| `docs/snyk-expert-cli.md` | 32 | 800 | 768 | PASS (`< 800`) |

---

## 5. Protected Paths Compliance

Only `plans/reports/docs-manager-261011-phase-07-summary.md` was written in this step. All sealed and already-verified Phase 07 files (`docs/system-architecture.md`, `docs/code-standards.md`, `CHANGELOG.md`, `docs/project-changelog.md`, `docs/project-changelog-archive.md`, `docs/codebase-summary.md`, `docs/project-roadmap.md`, `plans/261010-1552-vscode-subagent-tool-references/**`, `.evcrate/**`, `src/**`, `tests/**`, `scripts/**`, `.gitignore`) were left untouched.

---

## 6. Unresolved Questions

1. **Windows Native Qualification (`BLOCKED`):** When an affected Windows Local host running pinned VS Code `1.140.0` / Copilot Chat `0.68.0` is available, execute `WN01`–`WN10` and `WW01`–`WW04` to unblock cross-platform acceptance and Windows incident closure.
2. **Production Rollout Authorization (`PENDING`):** Target scope (`home` vs. `project`), profile settings registration (`--register-vscode-settings` vs. `--no-register-vscode-settings`), and explicit operator authorization remain required before executing Phase 07 Steps 9–10.
