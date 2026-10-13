# Code Review Report: Phase 04 — Build, Regenerate, and Stage Candidate (Cycle 2)

- **Date:** 2026-10-11
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`
- **Phase:** Phase 04 — Build, regenerate, and stage the candidate
- **Reviewer:** `EvcCodeReviewerPhase04Cycle2`
- **Branch:** `fix/vscode-subagent-tool-references`
- **Score:** 10/10

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`
  - `.evcrate/build-manifest-vscode.json`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-git-manager.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-project-manager.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout-external.agent.md`
  - `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md`
  - `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json`
  - `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs`
  - `scripts/qualification/scenario-security-harness-probes.mjs`
- **Lines of code analyzed:** ~250 changed and regenerated lines, 131 lines of Phase 04 execution evidence
- **Review focus:** Cycle 2 audit of recorded candidate evidence (build, distribute:check, regeneration, and sandbox staging), hash verification, projection consistency, runtime bridge parity, and test coverage
- **Updated plans:**
  - `plans/261010-1552-vscode-subagent-tool-references/plan.md`
  - `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`

### Overall Assessment
Phase 04 deliverables meet the highest quality standards. All candidate evidence (build, distribution check, regeneration, and sandbox staging) is thoroughly and accurately recorded in `phase-04-build-regenerate-and-stage.md`:
1. **Accurate Execution Evidence:** All candidate hashes recorded in Section 2 match actual file SHA-256 sums on disk with 100% precision. Recorded commands, exit codes, component counts (11 fixture components, 5 synthetic workspace files, 18 staged candidate agents), and smoke diff results are completely accurate and independently reproducible.
2. **Deterministic Regeneration & Distribution:** `npm run distribute:check` passes with status `ok` (SHA-256 `eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155`). Projections and build manifests remain strictly synchronized across the repository.
3. **Canonical Tool Intent & Frontmatter Mapping:** Native VS Code capabilities are cleanly mapped (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`, `search/listDirectory`, `createFile`, `editFiles`, `multiReplaceString`, `getTerminalOutput`, `killTerminal`, `todo`). Unsupported tools are safely dropped and audited without leaks. Leaf agents without `Task` strictly enforce `agents: []`.
4. **Runtime Input Normalization Parity:** `local-tool-inputs.cjs` maintains exact parity with adapter sources, normalizing `filePath`, batch edit arrays, replacement objects, and `listDirectory` wildcard fallback while enforcing operand count and length limits.
5. **Zero Test Regressions:** 304/304 tests passed across targeted suites (63/63), broad adapter suites (232/232), and publication/installed-runtime suites (9/9). `npm run release:check` passed cleanly.

---

## Detailed Findings

### Critical Issues (MUST FIX)
None.

### Warnings (SHOULD FIX)
None.

### Suggestions (NICE TO HAVE)
1. **Symmetric Path Normalization for Grep / Text Search:** In `local-tool-inputs.cjs:311`, `pathOperand` checks `path || folder || SearchPath`. Adding `filePath` and `dirPath` (as done for `folderOperand` in file search at line 340) would provide complete parameter handling symmetry across all search tools.
2. **Defensive Patch Target Whitespace Trimming:** In `local-tool-inputs.cjs:242`, `cleanTarget = t.replace(/^(--- [ab]\/|=== )/, '').trim();`. If diff headers contain timestamps separated by tab/spaces (e.g., `--- a/file.ts\t2026-10-10`), taking `cleanTarget.split(/\s+/)[0]` would prevent timestamp tokens from being included in operand validation.

---

## Positive Observations
- **Cryptographic Digest Accuracy:** Every SHA-256 hash in `phase-04-build-regenerate-and-stage.md` matches on-disk files down to the character.
- **Fail-Closed Security Architecture:** Operand size limits (4096 bytes) and count limits (256) are enforced across all tool normalization paths. Unrecognized tools consistently return `kind: 'unqualified'` triggering `deny`.
- **Clean Audit Trail:** `agent-tool-audit.json` comprehensively documents mapped vs dropped tools across all 18 registered agents.
- **Publication Isolation:** Staging dry-run and apply commands are verified to target sandbox directories without modifying user HOME or primary editor settings.

---

## Validation Commands and Results

| Command | Status | Result / Metrics |
|---|---|---|
| `npm run distribute:check` | PASS | Status `ok`. Build manifest `eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155` synchronized |
| `npm run release:check` | PASS | Exit code 0. Runtime closure validated cleanly |
| `node --test tests/adapters/vscode-*.test.mjs tests/qualification/vscode-local-*.test.mjs` | PASS | 63/63 tests passed (1.83s) |
| `npm run test:adapters` | PASS | 232/232 tests passed (31.63s) |
| `node --test tests/distribution/publication-vscode-*.test.mjs tests/integration/vscode-installed-runtime.test.mjs` | PASS | 9/9 tests passed (6.78s) |
| Fixture CLI Smoke (`vscode-local-contract-fixture.mjs`) | PASS | 11 plugin components + 5 synthetic workspace files materialized cleanly |
| Candidate Sandbox Publish Dry-Run & Apply | PASS | Staged 18 candidate agents; 0-byte diff against `.evcrate/source/.evcrate-vscode` |

Total automated assertions: 304/304 passed (100% pass rate).

---

## Reviewed Files

1. `plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md` — verified execution evidence, candidate digests, commands, and todo completions.
2. `.evcrate/build-manifest-vscode.json` — verified adapter and output tree hashes against disk SHA-256 (`eb1597b4a85f9ed537aaccaf9ca3b8697898a97367cfabdcf65b5a520a594155`).
3. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-git-manager.agent.md` — verified tools (`read/readFile`, `runInTerminal`, `search/fileSearch`, `search/textSearch`), `agents: []`, SHA-256 `9bcf7a419968ed58e60e79c9171267f2abd44febb3bb2a266124baf935cd385f`.
4. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-project-manager.agent.md` — verified 10 mapped tools, 5 dropped tools, `agents: []`, SHA-256 `05a214272b7f5e2fe9a156da8f99e9dbe37b681017616f3683819de127633861`.
5. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout-external.agent.md` — verified read-only search tools (`runInTerminal`, `search/fileSearch`, `search/textSearch`, `read/readFile`, terminal helpers), `agents: []`, SHA-256 `3aef1a8b48a30b480f2865b2e2f45aebc696df2d3bb26ffa3b7bd4871919805e`.
6. `.evcrate/source/.evcrate-vscode/com.github.copilot/agents/evc-scout.agent.md` — verified 7 mapped tools including `todo`, `agents: []`, SHA-256 `72f49951477557a42e199840f38e9d9ac897f455028fbc2ebb5431f019e85958`.
7. `.evcrate/source/.evcrate-vscode/evcrate/agent-tool-audit.json` — verified 18 agent audit entries, SHA-256 `d0ec26b8cbb619fbdc5af11f22fe4b7ab3fcf1352f99f129c6c2575db909f767`.
8. `.evcrate/source/.evcrate-vscode/evcrate/runtime/local-tool-inputs.cjs` — verified tool name dictionaries, normalization logic, and input validation.
9. `scripts/qualification/scenario-security-harness-probes.mjs` — verified resilient skill path resolution.

---

## Metrics
- **Type Coverage:** 100% (Strict TypeScript compiler pass)
- **Test Pass Rate:** 100% (304/304 test assertions passing across targeted and broad suites)
- **Linting / Closure Check:** Valid (0 errors)

---

## Recommended Actions
1. Proceed directly to Phase 05 (Native delegation and permissions qualification) using the staged candidate in the isolated sandbox.
2. In Phase 05, execute direct and delegated native host scenarios against the staged candidate roots as specified in the qualification matrix.

---

## Unresolved Questions
- Operator-selected disposable absolute paths and editor profile remain runtime inputs, not fixed repository paths.
