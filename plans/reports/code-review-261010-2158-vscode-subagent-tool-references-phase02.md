# Code Review Report: Phase 02 — Frontmatter Mapping Cutover

- **Date:** 2026-10-10
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 02 — Frontmatter mapping cutover
- **Reviewer:** `EvcCodeReviewerPhase02`
- **Branch:** `fix/vscode-subagent-tool-references`
- **Score:** 10/10

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `src/adapters/vscode/metadata-tools.ts`
  - `src/adapters/vscode/tool-inputs.ts`
  - `src/adapters/vscode/runtime-sources.ts`
  - `tests/adapters/vscode-metadata-permissions.test.mjs`
  - `tests/adapters/vscode-resource-projection.test.mjs`
  - `tests/adapters/vscode-policy.test.mjs`
- **Lines of code analyzed:** ~282 modified/added lines across 6 files
- **Review focus:** Verification of Phase 02 frontmatter mapping cutover, dual-authority runtime parity, tool permissions, leaf agent confinement, Task delegation preservation, and regression coverage
- **Updated plans:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-02-frontmatter-mapping-cutover.md`
  - `plans/261010-1552-vscode-subagent-tool-references/plan.md`

### Overall Assessment
The Phase 02 cutover is implemented cleanly, securely, and in strict adherence to architectural contracts and the frozen Phase 01 baseline.
1. All 13 canonical tool mappings in `VSCODE_LOCAL_TOOL_MAP` are updated from invalid legacy strings to verified host references (`read/readFile`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `runInTerminal`, `getTerminalOutput`, `killTerminal`, `agent/runSubagent`, `todo`, `editFiles`, `createFile`, `multiReplaceString`).
2. Namespace boundaries are rigorously maintained across canonical source intent, frontmatter declarations, model-facing prompt prose, and hook event identities.
3. Subagent delegation (`canDelegate`) is correctly derived from canonical source `Task` capability (`lower === 'task'` and `native.includes('agent/runSubagent')`), preserving coordinator delegation without losing `agents: []` leaf confinement on non-task agents.
4. Tool inheritance on omission (e.g., `evc-docs-manager`) and explicit deny-all on `tools: []` or `tools: "none"` (e.g., `evc-advisor`) are fully preserved.
5. Dual-authority parity between `src/adapters/vscode/tool-inputs.ts` and `src/adapters/vscode/runtime-sources.ts:LOCAL_TOOL_INPUTS_SOURCE` is exact, adding full support for `filePath`/`FilePath` parameter variants across single-file, batch, and multi-replacement operations.
6. Directory listing (`search/listDirectory`) properly defaults `pattern` to `'*'` and enforces Scout directory blocking.
7. Terminal helper tools (`getTerminalOutput`, `killTerminal`) are categorized as unrelated tools to avoid spurious rejection as unqualified command tools.
8. All 89 VS Code adapter tests and 228 adapter suite tests pass 100%. TypeScript compiles without errors.

---

## Detailed Findings

### Critical Issues
None. Zero breaking issues or security regressions identified.

### High Priority Findings
None. Type safety, permissions, and policy boundaries are fully enforced.

### Medium Priority Improvements
None. Implementation strictly follows KISS, DRY, and YAGNI without speculative abstractions or framework bloat.

### Low Priority Suggestions
1. **Comment precision on `canDelegate` check**: In `src/adapters/vscode/metadata-tools.ts:103`, the condition checks `lower === 'task' || native.includes('agent/runSubagent') || native.includes('runSubagent')`. The latter check `native.includes('runSubagent')` is redundant with `lower === 'task'`, but serves as defensive historical compatibility.
2. **Phase 03 Test Coverage**: In Phase 03, consider adding an explicit negative regression test verifying that an attempt to call `search/listDirectory` on `node_modules` is blocked by Scout policy in the test suite.

---

## Positive Observations
- **Dual-Authority Parity:** Perfect 1-to-1 parity preserved between `tool-inputs.ts` and `LOCAL_TOOL_INPUTS_SOURCE` in `runtime-sources.ts`, preventing runtime drift in projected environments.
- **Fail-Closed Security:** Unqualified inputs and unrecognized tool names consistently fail closed to `decision: 'deny'`.
- **Leaf Confinement:** Explicit non-task tools immediately enforce `agents: []`, ensuring leaf subagents cannot spawn arbitrary processes.
- **Minimal Edit Surface:** Zero speculative classes or dynamic registries added; tool mappings use frozen readonly arrays and minimal set unions.

---

## Validation Results
- **TypeScript build:** `npm run build` executed cleanly (0 errors).
- **VS Code test suite:** `node --test tests/adapters/vscode-*.test.mjs` passed 100% (89/89 tests passed, 0 failures, duration 1.67s).
- **All adapter tests:** `npm run test:adapters` passed 100% (228/228 tests passed, 0 failures, duration 31.6s).
- **Protocol tests:** `npm run test:protocol` passed 100% (53/53 tests passed, 0 failures, duration 0.16s).

---

## Unresolved Questions
None.
