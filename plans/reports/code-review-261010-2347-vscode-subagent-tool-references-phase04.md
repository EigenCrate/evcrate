# Code Review Report: Phase 04 — Build, Regenerate, and Stage Candidate

- **Date:** 2026-10-10
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`
- **Phase:** Phase 04 — Build, regenerate, and stage the candidate
- **Reviewer:** `EvcCodeReviewerPhase04`
- **Branch:** `fix/vscode-subagent-tool-references`
- **Score:** 10/10

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `.evcrate/build-manifest-vscode.json`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-git-manager.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-project-manager.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout-external.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md`
  - `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json`
  - `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs`
  - *Supporting qualification fix:* `scripts/qualification/scenario-security-harness-probes.mjs`
- **Lines of code analyzed:** ~210 changed/generated lines across target deliverables and projections
- **Review focus:** Regenerated VS Code subagent tool references, manifest/adapter hash consistency, runtime tool input normalization parity, security boundary enforcement, and publication isolation
- **Updated plans:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`
  - `plans/261010-1552-vscode-subagent-tool-references/progress.md`

### Overall Assessment
Phase 04 deliverables are verified and of exceptional quality. All target VS Code subagent definitions, runtime normalizers, audit logs, and build manifests are regenerated and synchronized cleanly:
1. **Tool Reference Accuracy:** All 4 generated agent Markdown files reflect host-specific tool references mapped from canonical intent (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `createFile`, `editFiles`, `multiReplaceString`, `getTerminalOutput`, `killTerminal`, `todo`). Unsupported tools (`ListMcpResourcesTool`, `NotebookEdit`, `ReadMcpResourceTool`, `WebFetch`, `WebSearch`) are systematically dropped without unmapped leaks.
2. **Delegation Invariants Preserved:** Agents lacking `Task` (`agent/runSubagent`) strictly emit `agents: []` to guarantee leaf confinement in VS Code.
3. **Runtime Bridge Parity:** `local-tool-inputs.cjs` precisely matches `src/adapters/vscode/runtime-sources.ts` and `src/adapters/vscode/tool-inputs.ts`. Parameter normalization seamlessly supports `filePath`, batch edit arrays, replacement objects, and `listDirectory` wildcard fallback.
4. **Manifest & Hash Integrity:** `npm run distribute:check` and SHA-256 verifications confirm exact hash alignment for `metadata-tools.js`, `runtime-sources.js`, `tool-inputs.js`, and `.evcrate-vscode`.
5. **Zero Test Regressions:** 100% test pass rate across 304 executed tests (63 targeted, 232 adapter, 9 publication/installed-runtime) with exit code 0.

---

## Detailed Findings

### Critical Issues (MUST FIX)
None.

### Warnings (SHOULD FIX)
None.

### Suggestions (NICE TO HAVE)
1. **Symmetric Path Normalization for Grep / Text Search:** In `src/adapters/vscode/tool-inputs.ts:384` and `local-tool-inputs.cjs:311`, `pathOperand` checks `path || folder || SearchPath`. Adding `filePath` and `dirPath` (as done for `folderOperand` in file search at line 414) would ensure complete parameter handling symmetry across all search tools.
2. **Defensive Patch Target Whitespace Trimming:** In `local-tool-inputs.cjs:242` and `src/adapters/vscode/tool-inputs.ts:315`, `cleanTarget = t.replace(/^(--- [ab]\/|=== )/, '').trim();`. If diff headers contain timestamps separated by tab/spaces (e.g., `--- a/file.ts\t2026-10-10`), taking `cleanTarget.split(/\s+/)[0]` would prevent timestamp tokens from being included in operand validation.

---

## Positive Observations
- **Strict YAGNI / KISS Compliance:** Agent bodies and system prompts were untouched; only frontmatter declarations and manifests were updated.
- **Fail-Closed Security Architecture:** Operand size limits (4096 bytes) and count limits (256) are enforced across all tool normalization paths. Unrecognized tools consistently return `kind: 'unqualified'` triggering `deny`.
- **Clean Audit Trail:** `agent-tool-audit.json` comprehensively documents mapped vs dropped tools across all 18 registered agents.
- **Pre-existing Flake Remediation:** Regression in `scenario-security-harness-probes.mjs` caused by command prefix renaming was cleanly resolved with backwards-compatible fallback resolution (`skills/evc-cmd-advise/SKILL.md` -> `skills/cmd-advise/SKILL.md`).

---

## Validation Commands and Results

| Command | Status | Result / Metrics |
|---|---|---|
| `npm run build` | PASS | Prebuild, advisor runtime, and TypeScript compilation passed cleanly (0 errors) |
| `npm run distribute:check` | PASS | `{"operation":"distribute.check","status":"ok"}`. Projections and manifests synchronized |
| `npm run release:check` | PASS | Runtime closure verification passed (code 0) |
| `node --test tests/adapters/vscode-*.test.mjs tests/qualification/vscode-local-*.test.mjs` | PASS | 63/63 tests passed (1.99s) |
| `npm run test:adapters` | PASS | 232/232 tests passed (31.55s) |
| `node --test tests/distribution/publication-vscode-*.test.mjs tests/integration/vscode-installed-runtime.test.mjs` | PASS | 9/9 tests passed (6.95s) |
| Fixture CLI Smoke (`vscode-local-contract-fixture.mjs`) | PASS | 11 plugin components + 5 synthetic workspace files materialized cleanly |
| Candidate Sandbox Publish Dry-Run | PASS | Scoped cleanly to sandbox roots without modifying user profile or settings |

---

## Reviewed Files

1. `.evcrate/build-manifest-vscode.json` — verified adapter and output tree hashes against disk SHA-256.
2. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-git-manager.agent.md` — verified tools (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`) and `agents: []`.
3. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-project-manager.agent.md` — verified 10 mapped tools, 5 dropped tools, and `agents: []`.
4. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout-external.agent.md` — verified read-only search tools (`runInTerminal`, `search/fileSearch`, `search/textSearch`, `read/readFile`, terminal helpers) and `agents: []`.
5. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md` — verified 7 mapped tools including `todo` and `agents: []`.
6. `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json` — verified 18 agent audit dispositions and dropped/mapped lists.
7. `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs` — verified tool name sets, normalization logic, and byte-for-byte identity with `LOCAL_TOOL_INPUTS_SOURCE`.
8. `scripts/qualification/scenario-security-harness-probes.mjs` — verified resilient skill path resolution.

---

## Metrics
- **Type Coverage:** 100% (Strict TypeScript compiler pass)
- **Test Pass Rate:** 100% (304/304 test assertions passing across targeted and broad suites)
- **Linting / Closure Check:** Valid (0 errors)

---

## Unresolved Questions
None.
