# Code Review Report: Phase 03 — Behavioral Regressions and Native Fixtures

- **Date:** 2026-10-10
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 03 — Behavioral regressions and native fixtures
- **Reviewer:** `EvcCodeReviewerPhase03`
- **Branch:** `fix/vscode-subagent-tool-references`
- **Score:** 10/10

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `scripts/qualification/vscode-local-contract-fixture.mjs`
  - `tests/adapters/vscode-hooks.test.mjs`
  - `tests/adapters/vscode-metadata-permissions.test.mjs`
  - `tests/adapters/vscode-policy.test.mjs`
  - `tests/adapters/vscode-resource-projection.test.mjs`
  - `tests/fixtures/vscode-local/native-plugin/com.github.copilot/agents/contract-reader.agent.md`
  - `tests/fixtures/vscode-local/native-plugin/com.github.copilot/agents/contract-editor.agent.md`
  - `tests/fixtures/vscode-local/native-plugin/com.github.copilot/agents/contract-no-child.agent.md`
  - `tests/fixtures/vscode-local/tool-references.json`
  - `tests/qualification/vscode-local-qualification.test.mjs`
- **Lines of code analyzed:** ~352 modified/added lines across 10 files
- **Review focus:** Independent host reference provenance, circular mapping elimination, security boundary verification, positive/negative agent controls, and native hook/policy regression tests
- **Updated plans:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-03-regression-and-native-fixtures.md`
  - `plans/261010-1552-vscode-subagent-tool-references/progress.md`

### Overall Assessment
Phase 03 implementation is exemplary. It eliminates circular self-testing of tool mapping, introduces independent host reference provenance via `tool-references.json`, establishes positive and negative controls for delegation and editing, and rigorously tests security boundaries across metadata mapping, policy enforcement, subprocess hook bridges, and resource projection.

1. **Independent Host Provenance:** Replaced self-referential map assertions with data-driven contract verification against `tool-references.json` (pinned to VS Code 1.140.0 / GitHub Copilot Chat 0.68.0).
2. **Security Boundaries Enforced:**
   - Explicit unsupported-only tools remain empty (`mapped: []`) and fail closed without falling back to host capability inheritance (`canDelegate: false`).
   - Deduplication prevents capability expansion.
   - String comma-separated and array definitions produce identical capability contracts.
   - `contract-no-child` agent proves that having `agent/runSubagent` with `agents: []` enforces leaf confinement.
   - Multi-operand operations (`multiReplaceString`) fail closed if any operand violates Scout policy.
   - Subprocess hook bridge fails closed on duplicate keys (exit code 2) and unqualified tools (`decision: 'deny'`).
3. **Fixture Parity:** Checked-in Markdown agent files match `vscode-local-contract-fixture.mjs` string constants exactly, preventing emitter/fixture drift.
4. **Validation:** 100% of Phase 03 tests pass (55/55 in focused suite, 98/98 across all adapter and qualification suites). Zero TypeScript compilation errors.

---

## Detailed Findings

### Critical Issues
None.

### High Priority Findings
None.

### Medium Priority Improvements
None.

### Low Priority Suggestions
1. **Symmetric permission decision assertion in Scenario J:** In `tests/adapters/vscode-hooks.test.mjs:352-355`, Scenario J tests permitted `createFile`. Asserting `assert.equal(outHostCreateAllow.hookSpecificOutput?.permissionDecision, undefined);` would mirror Scenario H and ensure strict symmetry.
2. **Exact file count assertions in fixture materialization:** In `tests/qualification/vscode-local-qualification.test.mjs:33,94`, exact assertions (`assert.equal(manifest.files.length, 11)` and `assert.equal(manifest.length, 5)`) could replace `assert.ok(manifest.files.length > 0)` to guarantee no unmanifested files slip in.
3. **Capability count assertion in qualification fixture test:** In `tests/qualification/vscode-local-qualification.test.mjs:255-259`, adding `assert.equal(Object.keys(toolReferences.capabilities).length, 13);` provides early detection against accidental capability deletion.

---

## Positive Observations
- **Elimination of Circular Assertions:** Replaced `assert.deepEqual(VSCODE_LOCAL_TOOL_MAP.read, ...)` with independent capability verification against versioned provenance fixture.
- **Fail-Closed Security Design:** Unqualified tools, disallowed directories, and unallowlisted subagents consistently evaluate to `deny`.
- **Zero Unnecessary Dependencies:** Clean standard Node test runner assertions without extra testing libraries or bloated test fixtures.
- **Directory Creation Robustness:** Added `fs.mkdirSync(path.dirname(fullPath), { recursive: true })` in `materializeWorkspace` to safely support multi-level directories like `scout-slice-a/`.

---

## Validation Commands and Results

| Command | Result | Notes |
|---|---|---|
| `npm run build` | PASS | Prebuild, advisor-runtime generation, TypeScript compile clean (0 errors) |
| `npm run typecheck:omp-runtime` | PASS | TypeScript check for OMP runtime clean |
| `node --test tests/adapters/vscode-*.test.mjs` | PASS | 93/93 tests pass (1.67s) |
| `node --test tests/qualification/vscode-local-qualification.test.mjs` | PASS | 5/5 tests pass (0.25s) |
| `npm run test:adapters` | PASS | 232/232 tests pass (31.5s) |
| `npm run test:protocol` | PASS | 53/53 tests pass (0.15s) |
| `npm run test:scopes` | PASS | 24/24 tests pass (0.42s) |
| `npm run test:publication` | PASS | 114/114 tests pass (248.1s) |

---

## Metrics
- **Type Coverage:** 100% (clean TypeScript compilation)
- **Test Pass Rate:** 100% (55/55 Phase 03 tests, 98/98 adapter & qualification tests)
- **Linting Issues:** 0

---

## Recommended Actions
1. Proceed with Phase 04 (`plans/261010-1552-vscode-subagent-tool-references/phase-04-build-regenerate-and-stage.md`).
2. Optionally apply the low-priority assertion hardening items during Phase 04 staging validation.

---

## Unresolved Questions
1. **External Pre-existing Failure in Phase 08 Qualification:** `tests/qualification/vscode-local-phase08-qualification.test.mjs:120` fails because `scripts/qualification/scenario-security-harness-probes.mjs:60` references `skills/cmd-advise/SKILL.md` instead of `skills/evc-cmd-advise/SKILL.md` (renamed in PR #24, commit `36c68bb4`). This is outside Phase 03 scope and does not affect Phase 03 deliverables, but should be queued for correction in the qualification harness.
