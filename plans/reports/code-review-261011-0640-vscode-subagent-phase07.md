# Code Review Report — Phase 07: Documentation, Review, and Controlled Rollout

- **Date:** 2026-10-11
- **Reviewer:** `EvcCodeReviewerPhase07` (`evc-code-reviewer`)
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** `phase-07` (`plans/261010-1552-vscode-subagent-tool-references/phase-07-documentation-and-rollout.md`)
- **Branch:** `fix/vscode-subagent-tool-references`
- **Score:** **9.6 / 10** (Approved for Reviewed-Candidate Handoff — Linux-Qualified, Windows-Unqualified, Not Deployed)

---

## Code Review Summary

### Scope
- **Phase 07 & Plan files reviewed:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-07-documentation-and-rollout.md`
  - `plans/261010-1552-vscode-subagent-tool-references/architecture.md`
  - `plans/261010-1552-vscode-subagent-tool-references/reports/candidate-handoff.md`
  - `plans/261010-1552-vscode-subagent-tool-references/plan.md`
  - `plans/261010-1552-vscode-subagent-tool-references/progress.md`
- **Maintained documentation & changelogs reviewed:**
  - `docs/system-architecture.md` (793 LOC)
  - `docs/code-standards.md` (786 LOC)
  - `CHANGELOG.md` (655 LOC)
  - `docs/project-changelog.md` (767 LOC)
  - `docs/project-changelog-archive.md` (772 LOC)
- **Cross-checked implementation, generated artifacts & QA reports:**
  - `src/adapters/vscode/metadata-tools.ts` (122 LOC)
  - `src/adapters/vscode/agents.ts` (148 LOC)
  - `src/adapters/vscode/tool-inputs.ts` (477 LOC)
  - `src/adapters/vscode/runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`)
  - `src/adapters/vscode/configuration-activation-guide.ts` (82 LOC)
  - `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs` (404 LOC)
  - `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/*.agent.md`
  - `plans/reports/qa-261011-0604-vscode-phase07-verification.md`
  - Sealed Phase 01–06 receipts and qualification reports (`phase-01` through `phase-06`)
- **Lines of code / docs analyzed:** ~2,850 LOC across source, generated runtime/audit files, plan artifacts, and documentation diffs.

### Overall Assessment
Phase 07 deliverables are accurate, security-conscious, and strictly aligned with YAGNI/KISS/DRY principles and repository governance. The implementation and documentation establish a clean four-namespace tool contract without introducing a new runtime subsystem, broad tool sets, or silent permission widening. All cryptographic digests in `candidate-handoff.md`, `architecture.md`, `docs/system-architecture.md`, `docs/code-standards.md`, and `docs/project-changelog.md` match the live repository state (`pluginTree` SHA-256 `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b` across 761 files). Linux qualification (`N01`–`N10`, `W01`–`W04`) and Windows-blocked / non-deployed boundaries are recorded truthfully without fabricating Windows pass claims, older-version root-cause proof, or incident closure.

---

## Acceptance Criteria & Technical Verification

### 1. Complete Generated-Caller Migration & 18-Agent Permission Contract
- **Single Mapper Authority:** `mapAgentTools` (`src/adapters/vscode/metadata-tools.ts`) is the sole frontmatter tool mapper consumed by `convertVscodeAgents` (`src/adapters/vscode/agents.ts`).
- **Four-Namespace Separation:**
  1. Canonical source intent (`Read`, `Glob`, `Grep`, `LS`, `Bash`, `BashOutput`, `KillBash`, `KillShell`, `Task`, `TodoWrite`, `Edit`, `Write`, `MultiEdit`).
  2. Host frontmatter tool references (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`).
  3. Model-facing invocation names (`copilot_readFile`, `manage_todo_list` via `references.ts`).
  4. PreToolUse/PostToolUse hook identities and operand schemas.
- **All 18 Generated VS Code Agents Verified (`agent-tool-audit.json` & `*.agent.md`):**
  - **13 Omitted-Tool Inherited Coordinators** (`evc-brainstormer`, `evc-code-reviewer`, `evc-copywriter`, `evc-database-admin`, `evc-debugger`, `evc-docs-manager`, `evc-fullstack-developer`, `evc-journal-writer`, `evc-mcp-manager`, `evc-planner`, `evc-researcher`, `evc-tester`, `evc-ui-ux-designer`): `hasExplicitTools: false`, omit `tools` and `agents` in frontmatter, `delegation.allowed: true` (`agents: ["*"]`).
  - **4 Explicit Non-Task Leaf Agents** (`evc-scout`, `evc-scout-external`, `evc-git-manager`, `evc-project-manager`): emit exact sorted native references, record unsupported web/MCP/notebook tools in `dropped`, and enforce `agents: []` (`delegation.allowed: false`). Neither `evc-scout` nor `evc-scout-external` receives edit or subagent tools.
  - **1 Explicit Deny-All Leaf Agent** (`evc-advisor`): `tools: none` maps to `tools: []`, `agents: []`, `explicitNone: true`, `delegation.allowed: false`.
  - **Unsupported-Only Security Boundary:** Explicit lists containing only unsupported tools map to `tools: []` and `agents: []` without falling back to host inheritance.
  - **Task-Derived `canDelegate`:** Derived from source `Task` intent (`agent/runSubagent`), independent of output spelling.
  - **Direct vs. Child-Disabled `todo`:** `TodoWrite` maps to frontmatter `todo` for direct sessions while `runSubagentTool.ts` disables `manage_todo_list` in child subagents; documented accurately as expected host behavior rather than a host bug.

### 2. Runtime Normalization Parity (`tool-inputs.ts` vs `runtime-sources.ts` vs `local-tool-inputs.cjs`)
- `READ_TOOL_NAMES`, `EDIT_TOOL_NAMES`, `TERMINAL_TOOL_NAMES`, `GREP_TOOL_NAMES`, `GLOB_TOOL_NAMES`, `SUBAGENT_TOOL_NAMES`, and `UNRELATED_TOOL_NAMES` are aligned across `src/adapters/vscode/tool-inputs.ts`, `src/adapters/vscode/runtime-sources.ts` (`LOCAL_TOOL_INPUTS_SOURCE`), and emitted `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs`.
- All three normalize `filePath`, `FilePath`, `path`, `file_path`, `target_file`, and `TargetFile` across read, edit (direct, `files[]`, `replacements[]`), and glob/search (`folder`, `path`, `filePath`, `FilePath`, `dirPath`, `DirPath`, `DirectoryPath`) operations.
- Bounds (`MAX_OPERANDS = 256`, `MAX_OPERAND_BYTES = 4096`), `file://` and `./` stripping, backslash normalization, Scout heavy-directory blocks (`node_modules/`, `dist/`, etc.), and `.env` privacy prompts remain intact.

### 3. Truthful Compatibility, Qualification & Rollout Boundaries
- Maintained docs and changelogs cite only Phase 01's pinned release pair: VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) and Copilot Chat `0.68.0` (`34c174a4f195e03c826bda327ab0b6b93277a1f06a3810b9ef32a49ef0bc98c2`), with no older-version support promise.
- `docs/system-architecture.md` and `docs/code-standards.md` accurately distinguish inert default publication from explicit opt-in surgical `chat.pluginLocations` registration (`--register-vscode-settings` / `--no-register-vscode-settings`) and document `evcrate recover` rollback boundaries (repairs interrupted transactions only; never downgrades versions, rolls back committed shared HOME controller state after a project failure, reverts agent-authored docs, or mutates user `settings.json`).
- Phase 07 Steps 9–10 (production preview/deployment) remain unexecuted and explicitly gated on affected-host Windows Local qualification and operator deployment authorization.

### 4. Sealed Phase 01–06 Artifacts & Documentation Line Limits
- `git diff HEAD` confirms `0` modifications to sealed Phase 01–06 plan files, completion receipts (`phase-01-completion-receipt.md` through `phase-06-completion-receipt.md`), qualification reports (`native-qualification.md`, `docs-workflow-qualification.md`), and `.jsonl` event streams.
- All 14 `docs/*.md` files are strictly `< 800` lines (`docs/system-architecture.md`: 793, `docs/code-standards.md`: 786, `docs/project-changelog-archive.md`: 772, `docs/project-changelog.md`: 767). Two 2026-09-13 entries were cleanly archived from `docs/project-changelog.md` to `docs/project-changelog-archive.md`.

---

## Critical Issues
None (0).

## Warnings (Medium Priority)
1. **W1 — Unstaged `.gitignore` modification exposing `plans/**/*` (`M .gitignore`):**
   - **Problem:** `.gitignore` in the working tree removes `plans/**/*` and `!plans/templates/*` (lines 60–61), exposing ~500+ historical untracked `plans/` files in `git status`. While helpful when running link validators that invoke `rg` across `../plans/...` links, staging all files (`git add -A`) or committing this `.gitignore` diff would pollute repository history.
   - **Action:** Restore `.gitignore` (`git checkout -- .gitignore`) or stage only explicit Phase 07 target paths before committing.
2. **W2 — Pre-existing `README.md` line count (`408` LOC vs `< 300` guideline):**
   - **Problem:** As noted in `qa-261011-0604-vscode-phase07-verification.md`, `README.md` is 408 lines (unchanged in Phase 07; expanded during earlier v3.0.0 unified naming and migration contract updates). All 14 `docs/*.md` files pass `< 800` LOC.
   - **Action:** Either waive `< 300` LOC for `README.md` on this branch (since Phase 07 did not touch `README.md`) or condense the v3.0.0 migration tables in a follow-up docs pass.

## Suggestions (Low Priority)
1. **S1 — Nullish coalescing vs logical OR in `LOCAL_TOOL_INPUTS_SOURCE`:**
   - `src/adapters/vscode/tool-inputs.ts` uses `??` when selecting `filePath`/`FilePath`/`path`/etc., whereas `LOCAL_TOOL_INPUTS_SOURCE` in `src/adapters/vscode/runtime-sources.ts` uses `||`. Behavior is identical because empty strings fail `!rawPath.trim()`, but using `??` in `LOCAL_TOOL_INPUTS_SOURCE` would make both sources syntactically identical.
2. **S2 — Test suite temp-dir & release cache hygiene (from QA run):**
   - In a future test-hygiene commit, ensure `tests/cli/package-smoke.test.mjs` removes `/tmp/evcrate-package-smoke-*` in `finally` and `tests/distribution/validation-and-rollout.test.mjs` checks version-matched `evcrate-v${pkg.version}.release.json` before reusing cached `dist/release/install.sh`.

## Positive Observations
- **Cryptographic Traceability:** Every artifact digest in `candidate-handoff.md` and `architecture.md` was independently recomputed and matched byte-for-byte (`81792bf2...` across 761 files).
- **Candidate Immutability Preserved:** Conditional `src/adapters/vscode/configuration-activation-guide.ts` was wisely left untouched so the Linux-qualified Phase 04–06 candidate tree hash was not invalidated during Phase 07 documentation updates.
- **Surgical Documentation Budgeting:** Archiving the two oldest 2026-09-13 entries from `docs/project-changelog.md` to `docs/project-changelog-archive.md` kept both files safely below the 800-line ceiling (`767` and `772` LOC).

---

## Validation Commands & Results

| Command / Check | Result | Details |
|---|---|---|
| `npm test` (verified by `EvcTesterPhase07`) | **PASS (`0`)** | 1,046 passed, 0 failed, 25 win32 skipped (~847.6s) |
| `node --test tests/qualification/vscode-local-qualification.test.mjs tests/qualification/vscode-local-phase08-qualification.test.mjs` | **PASS (`0`)** | 13/13 passed (combined total: 1,059 passed, 0 failed, 25 skipped) |
| `npm run distribute:check` | **PASS (`0`)** | `status: "ok"` (`evcrate-resource-control` v1) |
| `npm run release:check` | **PASS (`0`)** | Runtime closure valid |
| `node .evcrate/source/.claude/scripts/validate-docs.cjs` | **PASS (`0`)** | 14 files, 24 code refs + 496 links verified, 0 fatal errors |
| `sha256sum` & `CANDIDATE_IDENTITY.pluginTree` check | **PASS (`0`)** | 761 files, SHA-256 `81792bf29a3233edce95a2e604e7596064b4127d75d8792e5af7a0ff8ccd680b`; all 10 table hashes verified |
| `git diff HEAD` on sealed Phase 01–06 artifacts | **PASS (`0`)** | 0 bytes modified across all Phase 01–06 plans, receipts, reports, and JSONL logs |
| `wc -l docs/*.md` | **PASS (`0`)** | All 14 `docs/*.md` files strictly `< 800` lines (max: `docs/system-architecture.md` at 793 lines) |

---

## Unresolved Questions
1. **Affected Windows Host Qualification (`BLOCKED`):** When a Windows Local workstation aligned to VS Code `1.140.0` / Copilot Chat `0.68.0` is available, execute native rows `WN01`–`WN10` and `WW01`–`WW04` before closing the Windows incident or authorizing rollout.
2. **Production Deployment Authorization (`PENDING`):** Target scope/profile destination and explicit operator authorization remain required before executing Phase 07 Steps 9–10.
3. **Working-Tree `.gitignore` & Pre-existing `README.md` LOC:** Confirm `.gitignore` (`plans/**/*`) will be restored before commit and whether `README.md` (`408` LOC, untouched in Phase 07) remains waived for this bugfix branch.
