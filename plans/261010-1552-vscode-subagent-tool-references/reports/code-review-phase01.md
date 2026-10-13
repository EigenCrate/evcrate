# Code Review Report: Phase 01 — Host Contract and Baseline

- **Date:** 2026-10-10
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 01 — Host contract and baseline
- **Reviewer:** EvcReviewerPhase01
- **Score:** 10/10
- **Status:** APPROVED (Proceed to Phase 02)

---

## 1. Executive Summary

Phase 01 delivers a frozen host reference baseline (`reports/host-contract.md`) for VS Code Local subagent tool references targeting VS Code `1.140.0` (commit `07f806f999227108933c2e30515b26eecc1fda74`) and Copilot Chat `0.68.0`.

All deliverables satisfy project requirements and phase invariants:
- Zero production code or published agent modifications occurred in Phase 01 (`git status --porcelain` is clean).
- Complete contract established across all 13 canonical mapper capabilities in `VSCODE_LOCAL_TOOL_MAP`.
- Subagent delegation preservation (`canDelegate` condition update for `agent/runSubagent`) clearly identified and formulated.
- Crucial parameter difference (`filePath` vs `path`) uncovered and documented for paired implementation in `tool-inputs.ts` and `runtime-sources.ts`.
- Architecture, security, performance, and YAGNI/KISS/DRY principles strictly respected.

---

## 2. Deliverables Reviewed

| Deliverable | Path | Status | Finding |
|---|---|---|---|
| Frozen Host Contract | `plans/261010-1552-vscode-subagent-tool-references/reports/host-contract.md` | Verified & Frozen | 13 capabilities mapped, parameter diff analyzed, delegation invariants preserved |
| Phase Progress | `plans/261010-1552-vscode-subagent-tool-references/progress.md` | Reconciled & Updated | Phase 01 marked COMPLETE, Phase 02 selected as active |
| Phase Checklist | `plans/261010-1552-vscode-subagent-tool-references/phase-01-host-contract-and-baseline.md` | Complete & Reconciled | All 5 TODO items checked `[x]`, implementation & review complete |
| Master Plan | `plans/261010-1552-vscode-subagent-tool-references/plan.md` | Reconciled & Updated | Phase 01 status Complete, validation item pinned pair checked `[x]` |
| Git Working Tree | Working tree root | Verified Clean | Invariant confirmed: 0 tracked files modified |

---

## 3. Systematic Assessment Against Criteria

### A. Contract Completeness (All 13 Mapper Entries)
All 13 keys of `VSCODE_LOCAL_TOOL_MAP` are audited with frontmatter reference, model-facing name, required parameters, and semantic disposition:
1. `read` -> `read/readFile` (direct equivalent, `filePath`)
2. `glob` -> `search/fileSearch` (direct equivalent, `query`)
3. `grep` -> `search/textSearch` (direct equivalent, `query`, `isRegexp`)
4. `ls` -> `search/listDirectory` (preferred listing capability, `path`)
5. `bash` -> `runInTerminal` (direct equivalent, `command`)
6. `bashoutput` -> `getTerminalOutput` (semantic approximation)
7. `killbash` -> `killTerminal` (semantic approximation)
8. `killshell` -> `killTerminal` (semantic approximation)
9. `task` -> `agent/runSubagent` (direct equivalent, delegation invariant preserved)
10. `todowrite` -> `todo` (direct equivalent, host restricts in child subagents)
11. `edit` -> `editFiles` / concrete edit tools (`replaceString`, `applyPatch`)
12. `write` -> `createFile` / `replaceString` (file creation vs edit overwrite)
13. `multiedit` -> `multiReplaceString` / `applyPatch` (concrete multi-edit)

### B. Delegation Preservation
- `src/adapters/vscode/metadata-tools.ts` currently checks `native === 'runSubagent'`.
- Changing `task` mapping to `agent/runSubagent` would silently clear `canDelegate` unless updated.
- Contract specifies exact logic required: `if (native === 'runSubagent' || native === 'agent/runSubagent') { canDelegate = true; }`.
- Coordinator agents retain `canDelegate = true` and `agents: ['*']`; leaf agents retain `agents: []`.

### C. Parameter Difference Analysis (`filePath`)
- Host contributions in Copilot Chat 0.68.0 pass `filePath` (or `replacements[].filePath`).
- Current `normalizeLocalTool` in `tool-inputs.ts` checks `path ?? file_path ?? target_file ?? TargetFile`.
- Without normalizing `filePath`, tool calls would fail closed as `unqualified`.
- Solution captures `toolInput.filePath ?? toolInput.FilePath ?? ...` for both TypeScript source and runtime bundle string.

### D. Security Considerations
- Deny-all semantics for `tools: []` / `tools: none` preserved.
- Canonical blocked directories (12 dirs) and sensitive credential patterns preserved.
- No terminal execution bypass introduced.
- Strict isolation maintained between coordinator delegation and leaf tools.

### E. Performance & Architecture
- Static adapter mapping remains offline and deterministic; no runtime overhead.
- Normalization addition is $O(1)$ nullish coalescing.
- Clean separation: specification in Phase 01, code edits deferred to Phase 02.

### F. YAGNI / KISS / DRY
- No speculative backward compatibility with unpinned host versions.
- Pinned strictly to VS Code 1.140.0 / Copilot 0.68.0.
- Reuses existing adapter structures without introducing extra middleware layers.

---

## 4. Issues & Recommendations

### Critical Issues (0)
*None.*

### Warnings (1)
- **W1 (Dual Authority Sync):** In Phase 02, updating `src/adapters/vscode/tool-inputs.ts` must be accompanied by an identical update to `src/adapters/vscode/runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE`. Divergence would cause hook subprocess execution to fail despite passing unit tests.

### Suggestions (2)
- **S1 (Fixture Coverage):** In Phase 03, expand `tests/adapters/vscode-tool-inputs.test.mjs` with explicit test cases for `filePath` and `FilePath` payloads alongside legacy `path`.
- **S2 (Delegation Test):** In Phase 03, verify `mapAgentTools` with both `runSubagent` and `agent/runSubagent` to ensure `canDelegate` remains `true`.

---

## 5. Validation Commands and Results

| Command | Target / Scope | Result | Details |
|---|---|---|---|
| `git status --porcelain` | Source tree cleanliness | PASS | Clean (0 modified tracked files) |
| `npm run build` | TypeScript compilation & asset generation | PASS | Clean build (exit 0) |
| `node --test tests/adapters/vscode-*.test.mjs` | VS Code adapter unit test suite | PASS | 89/89 tests passed in 1.72s |

---

## 6. Unresolved Questions

1. Exact Windows build, commit, and original call trace remain uncaptured on native Windows hardware; incident closure remains blocked until Windows qualification is completed on the pinned pair.
2. Effective model-specific edit selector behavior (`editFiles` vs `replaceString` vs `applyPatch`) across Claude 3.7 / GPT-4o will be validated during Phase 02/05 native execution.
