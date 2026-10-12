# Phase 04 Companion Provider Runtime — Test Suite Execution Report (Cycle 3)

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-04-companion-provider-runtime.md`
- **Context:** Automated test suite execution for Phase 04 companion provider runtime (Cycle 3). Verified core build, companion TypeScript compilation, companion test suite, and core adapter regressions.
- **Verdict:** **PASS (All 4 Required Targets Green)** — 100% pass rate across targeted test suites (245 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo).

---

## 1. Test Results Overview

| Target | Command | Status | Pass | Fail | Skip | Duration (Runner / Wall) |
|---|---|---|---:|---:|---:|---|
| **1. Core Build** | `npm run build` | **PASS** | N/A | 0 | 0 | 1.58 s wall |
| **2. Companion Build** | `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | N/A | 0 | 0 | 0.77 s wall |
| **3. Companion Tests** | `node --test tests/vscode-companion/*.test.mjs` | **PASS** | 13 | 0 | 0 | 57.141337 ms runner (0.10 s wall) |
| **4. Core Adapters** | `npm run test:adapters` | **PASS** | 232 | 0 | 0 | 31,436.501182 ms runner (31.56 s wall) |
| **Total Automated** | All 4 targeted suites | **PASS** | **245** | **0** | **0** | **31,493.642519 ms runner (~34.01 s wall)** |

*Note: Node test runner reports `suites 0` because tests registered as top-level `test()` assertions; total executed test files = 26 (4 companion + 22 core adapters).*

---

## 2. Executed Test Files Inventory

### Companion Test Suite (`tests/vscode-companion/*.test.mjs` — 4 files, 13 tests)

1. `tests/vscode-companion/contracts.test.mjs` (4 tests)
   - `extension package.json and core/extension contract constants maintain strict parity` (1.13 ms)
   - `canonical model intent and agent-intent-v1 / audit-v2 schemas enforce strict boundaries` (1.25 ms)
   - `companion descriptor, source receipt, layout verifier, and CLI install contracts enforce safety` (0.93 ms)
   - `local URI allowlist, root precedence, cross-scope bindings, selector collision, and storage bounds` (2.70 ms)
2. `tests/vscode-companion/prerequisites-regressions.test.mjs` (3 tests)
   - `W-A: validateLocalRootUri produces idempotent rootIdentity across %, ?, #, spaces, Unicode, and Windows drives` (1.66 ms)
   - `W-B: binding-contracts leaf module provides core binding types without circular imports` (0.34 ms)
   - `W-C: validateRuntimeDiagnosticsV1 enforces <=512 actor bounds, string limits, and coherence` (3.67 ms)
3. `tests/vscode-companion/provider-runtime.test.mjs` (4 tests)
   - `installation-roots: inspectHostGuard enforces remote authority, trust, and proposal guards` (0.62 ms)
   - `installation-roots: candidate root inspection and resolution without silent HOME fallback` (1.40 ms)
   - `agent-renderer: renderAgentTemplate preserves frontmatter and protects code fences` (0.78 ms)
   - `generation-loader: loadAndStageGeneration validates paths, hashes, symlinks, and dedupes` (2.04 ms) *(New in Cycle 3)*
4. `tests/vscode-companion/storage-and-provider.test.mjs` (2 tests)
   - `resource-storage: stageAgentGeneration writes atomic generation, enforces budget, and rejects traversal/duplicates` (2.53 ms)
   - `agent-provider: CompanionAgentProvider emits change only on inventory delta and handles cancellation` (0.32 ms)

### Core Adapter Test Suite (`tests/adapters/*.test.mjs` — 22 files, 232 tests)

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

## 3. Build & Typecheck Status

- **Core Build (`npm run build`):** SUCCESS (0 warnings, 0 errors, 1.58s wall). Output bundles compiled without issue.
- **Companion Typecheck (`npx tsc -p extensions/vscode-model-bindings/tsconfig.json`):** SUCCESS (0 diagnostic errors, 0.77s wall). Clean typecheck across all companion modules including newly introduced `generation-loader.ts`.

---

## 4. Observations & Non-Blocking Notes

1. **Broad Suite Timeout:** Exploratory run of repository-wide `npm test` timed out after 300 s during publication test sub-pipeline (`publication-phase08-prune-and-upgrade.test.mjs` serial execution). Timeout is runner wall-clock ceiling on long-running e2e distribution pipeline, not an assertion failure. Companion test suite is not yet hooked into top-level `npm test` script (tracked for Phase 07 build integration).
2. **Cycle 2 Remediation Coverage:** Cycle 3 introduced `generation-loader.ts` and companion test `loadAndStageGeneration validates paths, hashes, symlinks, and dedupes`, addressing Critical 2 (manifest path traversal, mandatory template hash verification, symlink escape bounds).
3. **Untracked Workspace Changes:** 11 untracked files (`extensions/vscode-model-bindings/src/*.ts`, `tests/vscode-companion/*.test.mjs`) and 4 unstaged modifications await commit staging upon phase closure.
4. **Real-Host Qualification:** Step 9 native extension host smoke validation remains pending explicit per-session user approval naming isolated profile/workspace prior to live model invocation.

---

## 5. Unresolved Questions

1. When will root-approval enrollment persistence/UI wiring (`context.globalState` approval set and interactive approve command) be completed—in Phase 04 final review or deferred to Phase 05 runtime bindings?
2. Should `tests/vscode-companion/*.test.mjs` be added to `npm test` via a new `test:companion` script in `package.json` now or during Phase 07 (VSIX/build integration)?
3. Will the 11 untracked companion source and test files be committed together under a single Phase 04 atomic commit?
