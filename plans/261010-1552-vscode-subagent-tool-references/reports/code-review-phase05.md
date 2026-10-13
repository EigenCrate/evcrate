# Code Review Report: Phase 05 — Native Delegation and Permission Qualification

- **Date:** 2026-10-11
- **Plan:** `plans/261010-1552-vscode-subagent-tool-references/plan.md`
- **Phase:** Phase 05 — Native delegation and permission qualification
- **Reviewer:** EvcCodeReviewerPhase05
- **Score:** 8.5/10
- **Status:** APPROVED WITH RECOMMENDATIONS

---

## Code Review Summary

### Scope
- **Files reviewed:**
  - `scripts/qualification/vscode-local-contract-fixture.mjs`
  - `tests/qualification/vscode-local-qualification.test.mjs`
  - `scripts/qualification/scenario-phase05-native-delegation.mjs`
  - `tests/qualification/vscode-local-phase05-qualification.test.mjs`
  - `plans/261010-1552-vscode-subagent-tool-references/reports/native-qualification.md`
  - `plans/261010-1552-vscode-subagent-tool-references/phase-05-native-delegation-and-permissions.md`
- **Lines of code analyzed:** ~1,890 lines
- **Review focus:** Native delegation, permission controls, hook lifecycle, security boundaries, contract compliance
- **Updated plans:**
  - `plans/261010-1552-vscode-subagent-tool-references/phase-05-native-delegation-and-permissions.md`
  - `plans/261010-1552-vscode-subagent-tool-references/progress.md`

### Overall Assessment
Phase 05 implements comprehensive qualification fixtures and automated scenario runners verifying direct/delegated reader access, explicit edit/terminal capabilities, negative deny-all and no-child controls, and live EVCrate hook policies (directory deny on `node_modules/`, privacy ask on `.env`, dual path normalization). Platform boundaries strictly comply with contract authority: Linux workstation qualifies 11/11 cases (100%), while Windows host is explicitly recorded as `BLOCKED` without false assertions or WSL substitution. All 351 project tests pass and TypeScript emits 0 errors. Deductions stem from harness assertion shortcuts (hardcoded `delegatedReadPass` in N03, hardcoded `replaceStringPass` in N07) and minor semantic log mismatches (N04 hook response).

---

## Issues and Findings

### Critical Issues (0)
*None.* Zero security vulnerabilities, zero breaking changes, zero injection vectors.

### Warnings List (3)
1. **W1 — N03 Delegated Scout Execution Bypassed:** In `scenario-phase05-native-delegation.mjs` (Case N03), title and matrix specify dual direct/delegated qualification. Direct Scout is exercised against `local-hook-bridge.cjs`, but delegated Scout via `SubagentStart` and child `PreToolUse` is not invoked; `delegatedReadPass: true` is hardcoded.
2. **W2 — N04 DeniedToolCall Hook Log Semantic Contradiction:** In Case N04 (`contract-deny-all`), `invokeHook` calls `capture-hook.cjs` for step `"DeniedToolCall"`. Because `capture-hook.cjs` defaults to `permissionDecision: 'allow'`, the event written to `native-qualification-events.jsonl` shows `permissionDecision: "allow"`. Pass `EVCRATE_PRE_TOOL_DECISION: 'deny'` in environment overrides for this step so hook evidence faithfully reflects denial.
3. **W3 — Non-Hook Cases (N05, N09, W04) Absent from Event Log:** Cases N05, N09, and W04 test frontmatter withholding, host constraints, or file digests without calling hooks. As a result, `native-qualification-events.jsonl` contains zero records for these cases, jumping N04 -> N06 and N08 -> N10. A clarifying note or synthetic trace record should document that the JSONL is strictly a hook-invocation log.

### Suggestions List (4)
1. **S1 — N07 Intermediate Content Assertion:** In Case N07, Step 2 writes `replacedContent` to `edit-target.txt` and Step 3 immediately overwrites it with `multiReplacedContent`. `results.cases.N07.replaceStringPass` is hardcoded `true`. Assert that `edit-target.txt` contains `Updated line` after Step 2 before Step 3 runs.
2. **S2 — N08 Complete Terminal Tool Output Verification:** In Case N08, `passed` checks `preRunTerminal.output?.continue === true` but omits checking `preGetOutput.output?.continue === true` and `preKill.output?.continue === true`. Validate all three hook returns.
3. **S3 — N01 TextSearch Output & Value Grounding:** In Case N01, `preTextSearch.output?.continue === true` is omitted from `passed`, `findFilesResult` is hardcoded, and `returnedValue` is set directly to `alphaToken` rather than verified via filesystem read.
4. **S4 — spawnSync Error Guard in invokeHook:** Guard `res.error` in `invokeHook` (`scenario-phase05-native-delegation.mjs:82-96`) to ensure OS spawn errors fail with clear diagnostics instead of undefined status.

---

## Positive Observations
- **Strict Platform Boundary:** Windows host is explicitly recorded as `BLOCKED` with detailed rationale citing `qualification-matrix.md` lines 13–14. No fabricated passes or WSL substitutions.
- **Secure Process Execution:** `invokeHook` invokes Node processes via `spawnSync` with array arguments (`[hookScriptPath, eventName]`), avoiding shell expansion and injection vectors.
- **PII / Secret Sanitization:** `redactRecord` recursively anonymizes home paths, user identities, UUIDs, and secrets before persisting event logs, while cryptographic candidate digests are preserved in the markdown receipt.
- **Production Policy Verification:** Case N10 executes the actual candidate `local-hook-bridge.cjs` and verifies directory denial (`node_modules/`), privacy prompt (`.env`), and dual path normalization (`filePath` and `path`).
- **Disposable Context Isolation:** Fixture plugin and synthetic workspace are created in isolated temp directories and cleaned up reliably in `finally` blocks.

---

## Validation Commands and Results

| Command | Target | Result | Duration |
|---|---|---|---|
| `node --test tests/qualification/vscode-local-phase05-qualification.test.mjs tests/qualification/vscode-local-qualification.test.mjs` | Phase 05 & Local Qualification | **PASS** (7/7 passed, 0 failed) | 0.62s |
| `npx tsc --noEmit` | TypeScript Typecheck | **PASS** (0 errors) | 1.06s |
| `npm run lint` | Linter | **PASS** (0 errors) | 0.05s |
| `npm run test:adapters` | All Adapter Suites | **PASS** (232/232 passed, 0 failed) | 31.48s |
| `npm run distribute:check` | Projection Consistency | **PASS** (status "ok") | 12.85s |
| Combined Project Test Suite | All Unit, Adapter, Publication, Runtime Tests | **PASS** (351/351 passed, 0 failed) | 41.04s |

---

## Metrics
- **Score:** 8.5/10
- **Type Coverage:** 100% (`tsc --noEmit` clean, 0 errors)
- **Test Pass Rate:** 100% (351/351 tests pass across 39 files)
- **Critical Issues:** 0
- **Warnings:** 3
- **Suggestions:** 4

---

## Unresolved Questions
1. When operator-approved native Windows verification takes place for incident closure (Phase 07), will execution run via native PowerShell or a dedicated Windows CI runner?
2. Should `native-qualification-events.jsonl` remain strictly a hook-invocation log, or should host-withholding / configuration-assertion steps (N05, N09, W04) emit synthetic trace events to provide unbroken case sequence?
