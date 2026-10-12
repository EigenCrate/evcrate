# Phase 05 Runtime Tiers, Actor Overrides and Picker — Test Suite Execution Report

- **Date:** 2026-10-12
- **Phase:** Phase 05: Runtime tiers, actor overrides and picker
- **Execution Target:** Validation of companion TypeScript compilation, companion test suites, and adapter regression suites.
- **Verdict:** **PASS (100% Pass Rate)** — All 266 executed tests passed across 31 test files (34 companion + 232 adapter tests; 0 failures, 0 cancellations, 0 skipped, 0 todo).

---

## 1. Test Execution Summary

| Target | Command | Status | Tests Passed / Total | Runner Duration | Wall Time |
|---|---|---|---:|---:|---:|
| **1. Companion TypeScript Build** | `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | **PASS** | N/A (0 diagnostics) | N/A | 0.71 s |
| **2. Companion Test Suite** | `node --test tests/vscode-companion/*.test.mjs` | **PASS** | 34 / 34 | 84.338 ms | 0.12 s |
| **3. Adapter Test Suite** | `npm run test:adapters` | **PASS** | 232 / 232 | 31,179.671 ms | 31.29 s |
| **Total Automated Suites** | All 3 targets | **PASS** | **266 / 266 (100%)** | **31,264.009 ms** | **~32.12 s** |

*Supplemental check: `npm run build` executed cleanly (1.42 s wall time), followed by verified rerun of adapter tests against refreshed artifacts.*

---

## 2. Test Breakdown by Suite

### A. Companion Test Suite (`tests/vscode-companion/*.test.mjs` — 9 files, 34 tests)

1. `tests/vscode-companion/binding-resolution.test.mjs` (4 tests)
   - `parseActorCanonicalTier validates intent schema`
   - `resolveEffectiveActorBinding enforces full precedence chain`
   - `resolveEffectiveActorBinding handles unbound, missing, and ambiguous models`
   - `resolveInventoryBindings resolves manifest actors into full inventory`
2. `tests/vscode-companion/binding-state.test.mjs` (6 tests)
   - `parseStoredBindings handles empty, valid, and corrupt bindings`
   - `ScopedBindingStore persists and increments revisions`
   - `ScopedBindingStore partitions root bindings by rootIdentity and isolates roots`
   - `ScopedBindingStore rejects unsupported remote authority without fallback`
   - `ScopedBindingStore clear operations preserve unrelated bindings`
   - `ScopedBindingStore preserves corrupt state and refuses to overwrite`
3. `tests/vscode-companion/configuration-commands.test.mjs` (3 tests)
   - `handleConfigureAgentModels preserves state on cancellation and aborts on root change`
   - `handleConfigureAgentModels and handleConfigureActorModel bind model and inherit`
   - `handleClearModelBindings clears target and showModelBindingsDiagnostics surfaces corrupt state`
4. `tests/vscode-companion/contracts.test.mjs` (4 tests)
   - `extension package.json and core/extension contract constants maintain strict parity`
   - `canonical model intent and agent-intent-v1 / audit-v2 schemas enforce strict boundaries`
   - `companion descriptor, source receipt, layout verifier, and CLI install contracts enforce safety`
   - `local URI allowlist, root precedence, cross-scope bindings, selector collision, and storage bounds`
5. `tests/vscode-companion/generation-loader-bindings.test.mjs` (1 test)
   - `loadAndStageGeneration renders models when bound and withholds unbound tiers`
6. `tests/vscode-companion/model-catalog.test.mjs` (7 tests)
   - `validateCatalogEntry validates and trims descriptor fields`
   - `validateCatalogEntry rejects missing or oversized fields`
   - `buildCatalogSnapshot handles sorting, deduplication, and bounds`
   - `buildCatalogSnapshot skips inconsistent duplicate and invalid entries without crashing`
   - `buildCatalogSnapshot marks colliding selectors as ambiguous without dropping`
   - `buildCatalogSnapshot enforces max 2048 catalog bounds`
   - `queryChatModelCatalog queries language model API`
7. `tests/vscode-companion/prerequisites-regressions.test.mjs` (3 tests)
   - `W-A: validateLocalRootUri produces idempotent rootIdentity across %, ?, #, spaces, Unicode, and Windows drives`
   - `W-B: binding-contracts leaf module provides core binding types without circular imports`
   - `W-C: validateRuntimeDiagnosticsV1 enforces <=512 actor bounds, string limits, and coherence`
8. `tests/vscode-companion/provider-runtime.test.mjs` (4 tests)
   - `installation-roots: inspectHostGuard enforces remote authority, trust, and proposal guards`
   - `installation-roots: candidate root inspection and resolution without silent HOME fallback`
   - `agent-renderer: renderAgentTemplate preserves frontmatter and protects code fences`
   - `generation-loader: loadAndStageGeneration validates paths, hashes, symlinks, and dedupes`
9. `tests/vscode-companion/storage-and-provider.test.mjs` (2 tests)
   - `resource-storage: stageAgentGeneration writes atomic generation, enforces budget, and rejects traversal/duplicates`
   - `agent-provider: CompanionAgentProvider emits change only on inventory delta and handles cancellation`

### B. Adapter Test Suite (`tests/adapters/*.test.mjs` — 22 files, 232 tests)

1. `tests/adapters/antigravity-context.test.mjs` (31 tests)
2. `tests/adapters/contracts.test.mjs` (14 tests)
3. `tests/adapters/copilot-naming.test.mjs` (9 tests)
4. `tests/adapters/copilot-native-instructions.test.mjs` (12 tests)
5. `tests/adapters/help-consumer.test.mjs` (8 tests)
6. `tests/adapters/native-instruction-delivery.test.mjs` (6 tests)
7. `tests/adapters/omp-native-activation.test.mjs` (8 tests)
8. `tests/adapters/pi-command-name-parity.test.mjs` (6 tests)
9. `tests/adapters/qualification.test.mjs` (6 tests)
10. `tests/adapters/resource-naming.test.mjs` (6 tests)
11. `tests/adapters/uri-restoration-differential.test.mjs` (16 tests)
12. `tests/adapters/vscode-behavior.test.mjs` (8 tests)
13. `tests/adapters/vscode-configuration.test.mjs` (11 tests)
14. `tests/adapters/vscode-hooks.test.mjs` (7 tests)
15. `tests/adapters/vscode-lifecycle.test.mjs` (12 tests)
16. `tests/adapters/vscode-metadata-permissions.test.mjs` (6 tests)
17. `tests/adapters/vscode-policy.test.mjs` (8 tests)
18. `tests/adapters/vscode-reference-closure.test.mjs` (16 tests)
19. `tests/adapters/vscode-resource-projection.test.mjs` (10 tests)
20. `tests/adapters/vscode-session-context.test.mjs` (14 tests)
21. `tests/adapters/vscode-session-state.test.mjs` (11 tests)
22. `tests/adapters/vscode-support.test.mjs` (8 tests)

---

## 3. Working Tree Context

Tested snapshot includes 3 modified tracked files and 15 untracked files representing Phase 05 additions:
- Modified: `extensions/vscode-model-bindings/src/extension.ts`, `extensions/vscode-model-bindings/src/generation-loader.ts`, `extensions/vscode-model-bindings/vscode.proposed.chatPromptFiles.d.ts`
- Untracked companion source: `binding-resolver.ts`, `binding-store.ts`, `clear-commands.ts`, `command-registration.ts`, `configuration-commands.ts`, `configuration-pickers.ts`, `diagnostics-display.ts`, `installation-commands.ts`, `model-catalog.ts`, `provider-registration.ts`
- Untracked companion tests: `binding-resolution.test.mjs`, `binding-state.test.mjs`, `configuration-commands.test.mjs`, `generation-loader-bindings.test.mjs`, `model-catalog.test.mjs`

---

## 4. Unresolved Questions

None. All automated suites passed with 100% pass rate.
