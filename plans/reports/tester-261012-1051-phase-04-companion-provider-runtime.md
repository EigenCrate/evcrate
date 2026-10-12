# Phase 04 Companion Provider Runtime — Test Suite Execution Report

- **Date:** 2026-10-12
- **Phase:** `plans/261011-2349-vscode-runtime-model-bindings/phase-04-companion-provider-runtime.md`
- **Context:** Automated test suite validation for Phase 04 companion provider runtime. Verified core build, companion TypeScript build, companion test suite, and core adapter regressions.
- **Verdict:** **PASS (All 4 Targets Green)** — 100% pass rate (244 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo). Zero failures across all gates.

---

## 1. Test Results Overview

| Target | Command | Status | Pass | Fail | Skip | Duration (Runner / Wall) |
|---|---|---|---:|---:|---:|---|
| **1. Core Build** | `npm run build` | **PASS** | N/A | 0 | 0 | 1.411 s wall |
| **2. Companion Build** | `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | N/A | 0 | 0 | 0.665 s wall |
| **3. Companion Tests** | `node --test tests/vscode-companion/*.test.mjs` | **PASS** | 12 | 0 | 0 | 60.81 ms runner (0.084 s wall) |
| **4. Core Adapters** | `npm run test:adapters` | **PASS** | 232 | 0 | 0 | 31,095.24 ms runner (31.196 s wall) |
| **Total Automated** | All 4 targets verified | **PASS** | **244** | **0** | **0** | **33.356 s wall** |

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
   - agent-renderer: renderAgentTemplate preserves frontmatter, handles pinned vs inherit model, and rewrites relative references
4. `tests/vscode-companion/storage-and-provider.test.mjs` (2 tests)
   - resource-storage: stageAgentGeneration writes atomic generation and enforces budget
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

- **Core TypeScript Build (`npm run build`):** SUCCESS (0 warnings, 0 errors, 1.411 s).
- **Companion TypeScript Build (`npx tsc -p extensions/vscode-model-bindings/tsconfig.json`):** SUCCESS (0 warnings, 0 errors, 0.665 s).
- Both project configs type-check and compile cleanly with zero diagnostics.

---

## 4. Coverage & Performance Metrics

- **Automated Pass Rate:** 100% (244/244 passed, 0 failed, 0 skipped, 0 cancelled).
- **Failed Tests:** None.
- **Flaky Tests Identified:** None across single and repeated runs.
- **Execution Times:**
  - Companion test suite: 60.81 ms runner execution time (fast in-memory unit tests).
  - Core adapter test suite: 31,095.24 ms runner execution time (~31.10 s).
- **Slow Tests Identified in Adapters:**
  - `vscode-projection: complete end-to-end build and validation`: ~1.67–2.39 s (full multi-file projection generation).
  - `vscode-hooks: subprocess execution of local-hook-bridge.cjs`: ~0.51 s (real CJS child process spawn).
  - Subprocess bridge invocations in `vscode-behavior.test.mjs`: ~0.03–0.18 s each.

---

## 5. Critical Issues & Observations

1. **Working Tree Untracked Files:**
   - 6 companion runtime files in `extensions/vscode-model-bindings/src/`:
     - `agent-provider.ts`, `agent-renderer.ts`, `binding-contracts.ts`, `extension.ts`, `installation-roots.ts`, `resource-storage.ts`
   - 3 companion test files in `tests/vscode-companion/`:
     - `prerequisites-regressions.test.mjs`, `provider-runtime.test.mjs`, `storage-and-provider.test.mjs`
   - These are currently untracked (`??`). Fresh git checkout/CI clone will fail until staged/committed.
2. **Phase Boundary & Scope Limitation:**
   - Results validate automated unit and adapter regression gates in local node environment.
   - Live VS Code editor qualification (extension host activation, proposed `chatPromptFiles` API enablement, live model invocation) deferred to Phase 09 per 2026-10-12 user gate amendment. No live model or extension host installation performed.

---

## 6. Recommendations & Next Steps

1. **Stage and commit Phase 04 changes:** Track new runtime modules (`extensions/vscode-model-bindings/src/*.ts`), modified contracts, and new test files (`tests/vscode-companion/*.test.mjs`).
2. **Proceed to Phase 05:** Implement runtime model bindings and model picker UI on top of verified provider runtime.
3. **Keep adapter regression check in CI pipeline:** Fast feedback loop preserved via `tests/vscode-companion/*.test.mjs` (<100 ms).

---

## 7. Unresolved Questions

1. Should the untracked Phase 04 companion runtime and test files be committed directly under Phase 04 before starting Phase 05, or bundled into a combined companion commit?
2. Are there live VS Code extension host headless integration tests planned before Phase 09 qualification?
