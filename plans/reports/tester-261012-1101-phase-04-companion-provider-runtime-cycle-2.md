# Phase 04 Companion Provider Runtime — Test Suite Execution Report (Cycle 2)

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-04-companion-provider-runtime.md`
- **Context:** Automated test suite re-run for Phase 04 companion provider runtime after Cycle 1 fixes. Verified core build, companion TypeScript build, companion test suite, and core adapter regressions.
- **Verdict:** **PASS (All 4 Requested Gates Green)** — 100% pass rate (244 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo).

---

## 1. Test Results Overview

| Target | Command | Status | Pass | Fail | Skip | Duration (Runner / Wall) |
|---|---|---|---:|---:|---:|---|
| **1. Core Build** | `npm run build` | **PASS** | N/A | 0 | 0 | 1.44 s wall |
| **2. Companion Build** | `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | N/A | 0 | 0 | 0.68 s wall |
| **3. Companion Tests** | `node --test tests/vscode-companion/*.test.mjs` | **PASS** | 12 | 0 | 0 | 55.475941 ms runner (0.10 s wall) |
| **4. Core Adapters** | `npm run test:adapters` | **PASS** | 232 | 0 | 0 | 31,199.903246 ms runner (31.32 s wall) |
| **Total Automated** | All 4 targets verified | **PASS** | **244** | **0** | **0** | **31,255.379187 ms runner (~33.54 s wall)** |

*Note on runner metrics: Node test runner reports `suites 0` for both runs because tests are top-level `test()` registrations rather than nested `describe()` blocks; logical test files total 26 (4 companion + 22 adapters).*

---

## 2. Executed Test Files Inventory

### Companion Test Files (`tests/vscode-companion/*.test.mjs` — 4 files, 12 tests)
1. `tests/vscode-companion/contracts.test.mjs` (4 tests)
   - extension package.json and core/extension contract constants maintain strict parity
   - canonical model intent and agent-intent-v1 / audit-v2 schemas enforce strict boundaries
   - companion descriptor, source receipt, layout verifier, and CLI install contracts enforce safety
   - local URI allowlist, root precedence, cross-scope bindings, selector collision, and storage bounds
2. `tests/vscode-companion/prerequisites-regressions.test.mjs` (3 tests)
   - W-A: validateLocalRootUri produces idempotent rootIdentity across %, ?, #, spaces, Unicode, and Windows drives
   - W-B: binding-contracts leaf module provides core binding types without circular imports
   - W-C: validateRuntimeDiagnosticsV1 enforces <=512 actor bounds, string limits, and coherence
3. `tests/vscode-companion/provider-runtime.test.mjs` (3 tests)
   - installation-roots: inspectHostGuard enforces remote authority, trust, and proposal guards
   - installation-roots: candidate root inspection and resolution without silent HOME fallback
   - agent-renderer: renderAgentTemplate preserves frontmatter, handles pinned vs inherit model, and protects code fences
4. `tests/vscode-companion/storage-and-provider.test.mjs` (2 tests)
   - resource-storage: stageAgentGeneration writes atomic generation, enforces budget, and rejects traversal/duplicates
   - agent-provider: CompanionAgentProvider emits change only on inventory delta and handles cancellation

### Core Adapter Test Files (`tests/adapters/*.test.mjs` — 22 files, 232 tests)
1. `tests/adapters/antigravity-context.test.mjs` (31 tests)
2. `tests/adapters/contracts.test.mjs` (14 tests)
3. `tests/adapters/copilot-naming.test.mjs` (9 tests)
4. `tests/adapters/copilot-native-instructions.test.mjs` (12 tests)
5. `tests/adapters/help-consumer.test.mjs` (8 tests)
6. `tests/adapters/native-instruction-delivery.test.mjs` (6 tests)
7. `tests/adapters/omp-native-activation.test.mjs` (16 tests)
8. `tests/adapters/pi-command-name-parity.test.mjs` (3 tests)
9. `tests/adapters/qualification.test.mjs` (4 tests)
10. `tests/adapters/resource-naming.test.mjs` (10 tests)
11. `tests/adapters/uri-restoration-differential.test.mjs` (21 tests)
12. `tests/adapters/vscode-behavior.test.mjs` (14 tests)
13. `tests/adapters/vscode-configuration.test.mjs` (7 tests)
14. `tests/adapters/vscode-hooks.test.mjs` (9 tests)
15. `tests/adapters/vscode-lifecycle.test.mjs` (4 tests)
16. `tests/adapters/vscode-metadata-permissions.test.mjs` (17 tests)
17. `tests/adapters/vscode-policy.test.mjs` (23 tests)
18. `tests/adapters/vscode-reference-closure.test.mjs` (6 tests)
19. `tests/adapters/vscode-resource-projection.test.mjs` (6 tests)
20. `tests/adapters/vscode-session-context.test.mjs` (5 tests)
21. `tests/adapters/vscode-session-state.test.mjs` (4 tests)
22. `tests/adapters/vscode-support.test.mjs` (3 tests)

---

## 3. Build & Compilation Status

- **Core TypeScript Build (`npm run build`):** SUCCESS (0 warnings, 0 errors, 1.44 s wall).
- **Companion TypeScript Build (`npx tsc -p extensions/vscode-model-bindings/tsconfig.json`):** SUCCESS (0 warnings, 0 errors, 0.68 s wall).
- Both project configs type-check and compile cleanly with zero diagnostics.

---

## 4. Coverage & Performance Metrics

- **Automated Pass Rate:** 100% (244/244 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo).
- **Failed Tests:** None.
- **Flaky Tests Identified:** None across repeated executions.
- **Execution Times:**
  - Companion test suite: 55.475941 ms runner execution time (0.10 s wall).
  - Core adapter test suite: 31,199.903246 ms runner execution time (31.32 s wall).
  - Total runner test execution: 31,255.379187 ms (~31.26 s).

---

## 5. Critical Issues & Scope Limitations

1. **Cycle 1 Review Findings vs Automated Test Scope:**
   - Automated tests exercise HOME root resolution, nested model metadata preservation, code fence protection, path traversal rejection, and duplicate actor rejection.
   - However, automated green tests do not verify end-to-end extension activation wiring in VS Code host or user-facing explicit root approval enrollment UI.
2. **Untracked Working Tree Files:**
   - 6 companion runtime files in `extensions/vscode-model-bindings/src/`:
     - `agent-provider.ts`, `agent-renderer.ts`, `binding-contracts.ts`, `extension.ts`, `installation-roots.ts`, `resource-storage.ts`
   - 3 companion test files in `tests/vscode-companion/`:
     - `prerequisites-regressions.test.mjs`, `provider-runtime.test.mjs`, `storage-and-provider.test.mjs`
   - These files are included in this local run but not yet committed in Git. Results are not reproducible from committed sources alone.
3. **Qualification Boundary:**
   - Live VS Code extension host qualification (real host launch, proposed `chatPromptFiles` API enablement, live model invocation) is deferred to Phase 09 per plan schedule; outside this test rerun scope.

---

## 6. Recommendations & Next Steps

1. Stage and commit Phase 04 companion runtime files and test suites.
2. Ensure Code Reviewer verifies whether extension wiring and root approval requirements are satisfied or slated for Phase 05 integration.
3. Add `tests/vscode-companion/*.test.mjs` to a dedicated `package.json` script (e.g., `npm run test:companion`).

---

## 7. Unresolved Questions

1. Have the Cycle 1 code review findings regarding extension activation wiring and explicit root approval enrollment been formally accepted as deferred to Phase 05, or do they require additional implementation in Phase 04?
2. When will the untracked Phase 04 companion runtime and companion test files be committed to git?
