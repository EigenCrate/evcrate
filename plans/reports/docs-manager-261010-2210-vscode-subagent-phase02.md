# Documentation Status Report: Phase 02 — Frontmatter Mapping Cutover

- **Date:** 2026-10-10
- **Author:** `EvcDocsManagerPhase02`
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 02 — Frontmatter mapping cutover
- **Branch:** `fix/vscode-subagent-tool-references`
- **Status:** Complete (Review and documentation analysis complete; no `docs/` updates required in Phase 02)

---

## 1. Executive Summary

This report reviews the documentation status and impacts for **Phase 02 — Frontmatter mapping cutover** of the VS Code subagent tool references track.

Phase 02 cut over internal tool mapping in `src/adapters/vscode/metadata-tools.ts` from legacy unverified tool references to host-verified LanguageModelToolsService references (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`). It also updated dual-authority tool input normalizers (`src/adapters/vscode/tool-inputs.ts` and `src/adapters/vscode/runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE`) to support host `filePath`/`FilePath`/`dirPath` casing variants and array-nested paths for batch edit and replacement operations.

Following a comprehensive audit of all files in `docs/`:
1. **Zero immediate documentation updates in `docs/` are required for Phase 02.** Current documentation in `docs/` operates at the architectural and governance level (Agent Plugins 1.0 manifest, user-controlled `chat.pluginLocations` registration, 8 hook events, and fail-closed Scout/privacy policies) and contains no outdated or conflicting tool mapping references.
2. **Namespace boundaries and invariants are fully documented in code.** Detailed architectural notes explaining the four distinct namespaces (canonical source tool intent, host frontmatter tool references, model-facing invocation names, and hook event identities) were added directly to `src/adapters/vscode/metadata-tools.ts` JSDoc.
3. **Plan alignment and single-writer ownership.** Per `plans/261010-1552-vscode-subagent-tool-references/phase-07-documentation-and-rollout.md` and repository operational memory (`memory://root/MEMORY.md`), public documentation updates (`docs/system-architecture.md`, `docs/code-standards.md`, and `docs/project-changelog.md`) are scheduled for Phase 07 following final candidate qualification and review acceptance.
4. **Sealed paths and roadmap protected.** All sealed paths (`plan.md`, `phase-01-host-contract-and-baseline.md`, `reports/host-contract.md`, `reports/phase-01-completion-receipt.md`, and `docs/project-roadmap.md`) remain strictly untouched.

---

## 2. Code Changes Analyzed

The following Phase 02 files were reviewed against the documentation base:
- `src/adapters/vscode/metadata-tools.ts`:
  - Updated `VSCODE_LOCAL_TOOL_MAP` to map all 13 canonical capabilities to readonly arrays of host references.
  - Added comprehensive top-of-file documentation of the 4 tool namespaces.
  - Updated `mapAgentTools` to iterate arrays, preserve dropped tools faithfully, and determine `canDelegate` from recognized canonical `Task` capability independently of reference output spelling.
- `src/adapters/vscode/tool-inputs.ts` & `src/adapters/vscode/runtime-sources.ts`:
  - Maintained 1:1 dual-authority parity for `LOCAL_TOOL_INPUTS_SOURCE`.
  - Added host native tool names to classification dictionaries (`read/readfile`, `createfile`, `replacestring`, `multireplacestring`, `applypatch`, `search/listdirectory`, `copilot_*`, etc.).
  - Added extraction for `toolInput.filePath`, `toolInput.FilePath`, `toolInput.dirPath`, `toolInput.DirPath`, and item-level `filePath` in batch arrays (`files`, `replacements`).
  - Set default wildcard pattern `*` for directory listing operations.
  - Classified terminal lifecycle helpers (`getTerminalOutput`, `killTerminal`) as unrelated tools to avoid spurious rejection.
- `tests/adapters/vscode-metadata-permissions.test.mjs`:
  - Updated test assertions to expect new mapped references (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`, `todo`, `agent/runSubagent`).
- `tests/adapters/vscode-resource-projection.test.mjs`:
  - Updated end-to-end projection test assertions to expect frontmatter `todo` while preserving model prose `manage_todo_list`.
- `tests/adapters/vscode-policy.test.mjs`:
  - Added test coverage for `filePath`/`FilePath` extraction across read, concrete edit (`createFile`, `replaceString`, `multiReplaceString`), and directory search operations.

---

## 3. Documentation Audit & Gap Analysis

| Documentation File | Status | Audit Findings & Recommendations |
|---|---|---|
| `docs/system-architecture.md` | Accurate (No change) | Section 2 (lines 130-137) covers VS Code target at the system boundary: Agent Plugins 1.0 bundle at `.evcrate/source/.evcrate-vscode/`, manual `chat.pluginLocations` registration, publication never mutating editor settings, 8 hook events, and rejection of `--agent` relay. It does not document low-level frontmatter tool mappings. Updates for tool references/qualification are scheduled for Phase 07 per plan. |
| `docs/code-standards.md` | Accurate (No change) | Lines 84-88, 251-255, 646-650 document target IDs (`vscode`), schema-2 registry, and adapter hash closures (`dist/adapters/uri-restoration.js`). Internal tool mapping arrays do not alter code standards. Qualification rules will be integrated in Phase 07. |
| `docs/codebase-summary.md` | Accurate (No change) | Line 39 accurately summarizes `src/adapters/vscode/` as "VS Code Local plugin; shared URI restoration and Markdown frontmatter". No sub-module breakdown exists for `metadata-tools.ts`. To prevent merge conflicts in parallel worktrees, `codebase-summary.md` follows a single-writer model and should not be modified mid-flight. |
| `docs/project-overview-pdr.md` | Accurate (No change) | FR-25 documents high-level VS Code Local requirements (Agent Plugins 1.0, user-controlled registration, Linux x64 qualification). Specific frontmatter tool strings are not part of PDR scope. |
| `docs/project-roadmap.md` | Sealed (No change) | Prior completed roadmap entries for Phase 08/09 remain sealed historical records. Prompt forbids direct modification of roadmap. |
| `docs/project-changelog.md` | Deferred (Phase 07) | Milestone changelog entries for this fix track are scheduled for Phase 07 rollout per plan. |
| `docs/design-guidelines.md` | N/A (No change) | Governs UI/web viewer styling. |
| `docs/upgrade-backup-and-leftover-guidance.md` | Accurate (No change) | Covers target collision refusal and unmanaged leftovers. |

---

## 4. Documentation Validation Results

Validation via `node .evcrate/source/.claude/scripts/validate-docs.cjs docs/`:
- **Files Checked:** 14 files in `docs/`
- **Internal Links:** 493 internal links working (zero broken links introduced)
- **Code References:** 19 code references validated
- **Outcome:** Baseline cleanly retained; zero regressions introduced by Phase 02.

---

## 5. Protected Paths Verification

The following protected paths were verified as untouched and uncommitted:
- `plans/261010-1552-vscode-subagent-tool-references/plan.md` (UNTOUCHED)
- `plans/261010-1552-vscode-subagent-tool-references/phase-01-host-contract-and-baseline.md` (UNTOUCHED)
- `plans/261010-1552-vscode-subagent-tool-references/reports/host-contract.md` (UNTOUCHED)
- `plans/261010-1552-vscode-subagent-tool-references/reports/phase-01-completion-receipt.md` (UNTOUCHED)
- `docs/project-roadmap.md` (UNTOUCHED)

---

## 6. Phase 07 Documentation Handoff Plan

When Phase 07 executes (after Phase 03 behavioral testing, Phase 04 projection build/regeneration, and Phase 05/06 native qualification), the designated integration owner should apply the following planned documentation updates:
1. **`docs/system-architecture.md`**: Note host frontmatter tool reference resolution semantics and the separation of namespaces (declarations vs model invocation vs hook events).
2. **`docs/code-standards.md`**: Update any tool reference conventions or dual-authority synchronization rules (`tool-inputs.ts` <-> `runtime-sources.ts`).
3. **`docs/project-changelog.md`**: Record the fix entry for VS Code subagent tool references and `filePath` parameter normalization.

---

## 7. Unresolved Questions

None.
